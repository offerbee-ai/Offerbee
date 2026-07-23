---
name: freshness-refresh
description: Weekly card-data refresh run by Claude Code itself (subscription-billed, no OpenRouter cost). Lists the wallet cards most overdue for verification, fetches each card's official issuer page, extracts the terms, and submits them to the server-side freshness pipeline (suppression, gating, audit, and review queue all still apply). Trigger - /freshness-refresh, "refresh card data", "weekly data refresh".
---

# Freshness refresh (external extraction)

You are the extraction model for this run. The Convex pipeline stays
authoritative: it diffs, suppresses, gates, audits, and routes to the review
queue. Your job is only to read issuer pages accurately and submit profiles.

All commands run from `packages/backend`. Default deployment is dev; pass
`--deployment-name adept-porpoise-776` (staging) or `handsome-dodo-841` (prod)
on every `convex run` when asked to refresh those.

## Workflow

1. **Get the work list** (oldest-verified wallet cards first):

   ```sh
   npx convex run freshness:listRefreshCandidates '{"limit": 15}'
   ```

   The response is `{candidates: [...], nextCursorKey}`. Work through
   `candidates`. `nextCursorKey` is non-null only when the deployment has
   more than one page of distinct owned cards (1000+) — pass it back as
   `cursorKey` to cover the rest; normally it is null and you ignore it.

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
   - Confidence honestly per field; `sourceUrl` = the final page URL.

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
