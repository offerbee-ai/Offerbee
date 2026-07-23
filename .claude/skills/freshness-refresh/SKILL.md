---
name: freshness-refresh
description: Weekly card-data refresh run by Claude Code itself (subscription-billed, no OpenRouter cost). Lists the wallet cards due for verification (TTL-gated to once per week per card), fetches each card's official issuer page, extracts the terms, and submits them to the server-side freshness pipeline (suppression, gating, audit, and review queue all still apply). Trigger - /freshness-refresh, "refresh card data", "weekly data refresh".
---

# Freshness refresh (external extraction)

You are the extraction model for this run. The Convex pipeline stays
authoritative: it diffs, suppresses, gates, audits, and routes to the review
queue. Your job is only to read issuer pages accurately and submit profiles.

All commands run from `packages/backend`. Default deployment is dev; pass
`--deployment-name adept-porpoise-776` (staging) or `handsome-dodo-841` (prod)
on every `convex run` when asked to refresh those.

## Workflow

1. **Get the work list** (cards actually due for a refresh):

   ```sh
   npx convex run freshness:listRefreshCandidates '{"limit": 15}'
   ```

   The response is `{candidates: [...], truncated}`. Work through
   `candidates` — owned cards **due** for re-verification, oldest-first.
   The query TTL-gates server-side: a card verified within the last
   `CARD_VERIFY_TTL_DAYS` (1 week) is fresh and is **not** returned, so
   sequential runs refresh each card at most once per week — the same TTL the
   cron uses. (The gate is a read-only filter, not a lease: if two refresh
   runs overlap, both can pick the same due card until the first submission
   lands. Don't run overlapping refreshes; the daily routine is a single run.)

   **If `candidates` is empty and `truncated` is false, every scanned owned
   card is still fresh.** Stop here and report "nothing due this week" — do
   not force-refresh fresh cards. If `candidates` is empty but `truncated`
   is true, the scan was partial (see below) — report partial coverage; do
   not claim nothing is due.
   (To audit owned cards regardless of freshness, pass
   `'{"includeFresh": true}'` — but note it still returns at most `limit`
   (default 25, max 100), so raise `limit` for a bigger wallet. Never use it
   for a routine refresh.)

   `truncated` is false in any realistic deployment; if it is ever true,
   say so in the summary (it means distinct owned cards exceeded the
   query's 4,000-key walk ceiling and coverage was partial).

2. **Per card — fetch the page.** Use the card's `cardUrl`. Fetch with a
   browser User-Agent. If the URL redirects, note the final URL. If the page
   is unreachable or is a JS-only shell, skip the card and say so in the
   summary — do not extract from search results or memory.

3. **Per card — extract.** Read the page text and produce EXACTLY this JSON
   shape (the server validates it with the same parser the daily pipeline
   uses):

   ```json
   {
     "annualFee": { "value": 0, "confidence": 0.0, "sourceUrl": "<final page url>" },
     "fxFee": { "value": 0, "confidence": 0.0, "sourceUrl": "<url>" },
     "signupBonus": { "amount": 0, "spend": 0, "lengthOfPeriod": "3 months", "desc": "<short>", "confidence": 0.0, "sourceUrl": "<url>" },
     "earnCategories": [{ "name": "<category>", "multiplier": 0, "spendLimit": 0, "desc": "<short>", "confidence": 0.0, "sourceUrl": "<url>" }],
     "benefits": [{ "title": "<benefit>", "desc": "<short>", "confidence": 0.0, "sourceUrl": "<url>" }]
   }
   ```

   Rules:
   - Report the issuer's standard US consumer terms only.
   - **Omit any field the page does not state — never guess.** An omitted
     field leaves the stored value untouched; a wrong value creates work.
   - `multiplier` is cash-back % or points-per-dollar; `spendLimit` 0 = none.
   - `fxFee` is the foreign-transaction fee percent, 0 if none.
   - Omit `signupBonus` entirely if the card has none.
   - One benefits entry per distinct benefit; short titles (they are the
     dedupe key), short descs.
   - **Title format must be stable and canonical: do NOT put the dollar amount
     in the title.** Use `"Resy Credit"`, not `"$400 Resy Credit"`; put the
     amount in `desc`. Titles are the dedupe key — an amount in the title makes
     the same benefit churn (phantom remove+add) when the amount is phrased
     differently next run.
   - Confidence honestly per field; `sourceUrl` = the final page URL.

   ### Extract COMPLETELY — this is the hard part on premium cards

   One-pass reading of a huge page reliably misses ~20% of benefits. Do NOT
   sweep the page once and stop. Follow this procedure — it is mandatory for
   any page longer than ~15k characters (every premium travel card):

   a. **Walk the page section by section.** Premium pages group benefits into
      sections — e.g. Amex: "Premium Travel", "Dining & Entertainment",
      "Shopping & Wellness"; Chase: Travel, Dining, Lounge/Statement Credits,
      Protections & Insurance, plus partner/promo blocks. Enumerate every
      benefit WITHIN a section before moving to the next. Do not jump around.

   b. **Anchor to the page's own declared section counts — carefully.** Amex
      pages print labeled benefit counts, e.g. `All Premium Travel Benefits
      (19)`, `Dining & Entertainment (7)`, `Shopping & Wellness (9)`. Trust a
      count ONLY when it is attached to a benefit-section label like that.
      **A bare `(N)` is not a benefit count** — pages are full of unrelated
      parentheticals (`All Cards (42)`, `Southwest (5)` in nav/brand menus,
      footnote markers). Do not anchor to those. Many issuers (Chase) print no
      labeled counts at all — then skip this step and rely on (a) and (c).

      A labeled count is a **re-read trigger, never a fill target.** If a
      section's label says (19) and you captured 12, re-read *that section* for
      benefits you skipped — but only add ones with explicit supporting text on
      the page. **Never invent, duplicate, or split a benefit to reach a
      number.** Under-counting a section is fine; fabricating to hit N is not.

   c. **Self-critique pass before you submit (bounded).** After a draft,
      re-read the FULL page text with your extracted title list in hand and ask
      only: "which benefits or earn categories on this page — with explicit
      page text — are NOT in my list?" Add each (canonical title, no
      duplicates). Run this at most **2 additional passes**; stop earlier if a
      pass adds nothing. If after 2 passes a labeled section count still looks
      short, do NOT keep looping or pad it — note the specific gap in your
      summary (e.g. "Premium Travel: page says 19, captured 17") and submit
      what the page actually supports. A narrow "what did I miss?" read has far
      higher recall than the first "list everything" sweep.

   d. **Scan the deep sections, not just the top grid.** The most-missed
      benefits live below the primary benefit grid: partnership/co-brand
      credits, promotional earn multipliers, elite statuses, and travel
      insurances buried in fine print. Concrete misses seen on Sapphire
      Reserve when this step was skipped: Southwest Airlines credit, A-List
      status, Lyft credits, Peloton, Hyatt Explorist status, Shops at Chase
      credit. Do not stop at the marquee statement credits.

   A premium card that yields fewer benefits than the page's summed section
   counts is under-extracted — treat that as a failed extraction and redo the
   short sections, exactly as you would re-read a page that failed to fetch.

4. **Per card — submit.** Build the args with Python to avoid quote-escaping
   bugs (`profileJson` is a JSON string inside JSON):

   ```sh
   python3 - <<'EOF' > /tmp/freshness-args.json
   import json
   profile = { ... }  # the object from step 3
   print(json.dumps({"cardKey": "<cardKey>", "profileJson": json.dumps(profile)}))
   EOF
   npx convex run freshness:processExternalProfile "$(cat /tmp/freshness-args.json)"
   ```

   The response is `{ok: true}` or `{ok: false, error}` — surface errors.

5. **Summarize.** Table: cardKey, page fetched (y/n + final URL), fields
   submitted, submit result. Remind that proposals land in the web app's
   review queue (Data Review tab) — array changes ALWAYS go to review on this
   path, scalars follow the normal auto-apply gate.

## Notes

- This path skips the pipeline's mass-removal guard on arrays (deliberate:
  whole-array rebuilds are review-gated per item instead). Cards stuck on the
  6h `suspect` backoff loop are exactly the ones this run should fix.
- Do not patch `cardDetails`, `cardDataReview`, or `cardDataAudit` directly —
  `processExternalProfile` is the only write surface for this workflow.
- Benefit amount/cycle corrections belong in `benefitOverrides.json`
  (see repo CLAUDE.md), not here.
