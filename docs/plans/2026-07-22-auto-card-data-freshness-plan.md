# Auto card-data freshness — daily LLM verify + auto-update

**Date:** 2026-07-22
**Status:** implemented (PRs #84/#85) and hardened (see "Implementation status & hardening" at the end); shadow mode until precision is proven
**Goal:** A daily cron that keeps user-facing card data fresh automatically. For every card in
any user's wallet, fetch the latest terms from the web, LLM-eval against what we store, and
auto-apply confident corrections to fees, sign-up bonus, earn (bonus) categories, and benefits —
so users always see current data without a human in the loop.

## What already exists (reuse, don't rebuild)

`verify.ts` is ~70% of this:

- **LLM web verify** — OpenRouter, `anthropic/claude-sonnet-5`, `plugins:[{id:"web"}]` (server-side
  web search, single round trip), prompt prefers the issuer's own page, returns
  `{value, sourceUrl, confidence, note}`.
- **Wallet enumeration** — `getUserCardKeys`.
- **Cross-check + provenance** — `crossCheckCard` compares web vs stored; writes `fieldProvenance`
  (source/confidence/url/verifiedAt) or enqueues a `cardDataReview` proposal.
- **Admin review queue** — `review.ts`: `enqueueReview` / `listPendingReviews` / `confirmReview` /
  `rejectReview`, backed by the `cardDataReview` table + `fieldProvenance` on `cardDetails`.

### Gaps to close

1. **Coverage** — only 3 numeric fields (`annualFee`, `signupBonusAmount`, `signupBonusSpend`).
   Need: earn categories (`spendBonusCategory[]`), benefits (`benefit[]`), base earn, fx fee, the
   rest of the signup block, travel-perk text/flags.
2. **Shape** — `webVerify` returns one number. Categories/benefits are arrays of objects → need
   **structured extraction**, not a scalar.
3. **Trigger** — user-initiated + `requireAdmin` (`startForMyCards`). Need a **daily cron across all
   wallets**, deduped by cardKey.
4. **Auto-apply** — everything currently routes to human review. Need **confidence-gated
   auto-apply**, with review as the fallback path.

## Critical bug to fix first (blocks everything)

`catalogSync.saveCardDetail` on a hash change does `ctx.db.patch(id, { ...content })` — a **full
overwrite from RapidAPI**. The existing "refresh card details" cron runs **every 2h**. So any
correction we write gets **clobbered back to the stale RapidAPI value within 2 hours**.

**Fix:** make writes provenance-aware. On a RapidAPI refresh, do not overwrite a field whose
`fieldProvenance` is web-verified and newer than the incoming API data. Options:
- (A) field-level guard inside `saveCardDetail` — skip fields with a fresher `source:"web"`
  provenance entry. Simplest; keeps one write path.
- (B) read-time overlay — store corrections separately, merge on read. More moving parts.

Recommend **(A)**. Also: verify `detailHash` is computed from content that now includes possibly
protected fields, so a protected-field skip doesn't cause hash thrash.

## Downstream ripple (must handle)

- Changing `benefit[]` → `saveCardDetail` schedules `benefits.seedOwnersForCard` → re-seeds
  `userBenefits` for owners. Keep idempotent; don't duplicate tracked credits.
- Changing `spendBonusCategory[]` → feeds `tips.ts` (earn-multiplier push tips). Don't double-fire
  tips when a category is corrected/added.

## Pipeline design

Extend `verify.ts` into an automated batch pipeline.

### 1. Enumerate — distinct wallet cardKeys

New `internalQuery getWalletCardKeys` (or paginated): distinct `cardKey` across **all** `userCards`
(dedupe across users — big cost saving; verify only owned cards, not the whole catalog).

### 2. Schedule — daily cron, TTL-spread, capped

- `crons.interval("verify card data", { hours: 24 }, internal.verify.verifyWalletCardsBatch, { cursor: null })`.
- Each card carries `lastVerifiedAt`; re-verify only when older than `CARD_VERIFY_TTL_DAYS` (e.g. 7).
- Per-run cap (`PER_RUN_CAP`) + scheduler chaining across batches — mirror
  `rapidapi.refreshStaleDetails` (self-reschedules until the batch drains). Daily cron picks the
  most-overdue N; load spreads over the week.

### 3. Extract — one structured LLM call per card, `cardUrl`-first

**Source selection (before the LLM call):** each `cardDetails` row carries `cardUrl` from RapidAPI.
Use it as the primary source, but do **not** trust it blindly — coverage/quality varies (staging:
77/99 have a URL; most are issuer domains — amex/chase/citi/capitalone/wellsfargo/bofa — but some
are junk co-brand pages — nbarizona.com, abbybank.com, aacreditunion.org — and 22/99 are missing).

Decide the source per card:

1. **`cardUrl` present AND issuer-authoritative** (domain on an issuer allowlist, or domain matches
   `cardIssuer`) → point the extraction at that page. Highest confidence.
2. **`cardUrl` junk/affiliate domain, missing, 404s, or the page doesn't match the card** → **fall
   back to open web search** (the current `plugins:[{id:"web"}]` behavior).
3. The LLM must **confirm the fetched page is the right card** before trusting it — guards URL rot
   and wrong-slug. If it can't confirm, treat as fallback.

**URL self-heal (bonus):** when the stored `cardUrl` is junk/404 and the LLM finds the correct
official page during fallback, write the corrected URL back to `cardUrl` (with provenance) so the
next run goes straight to source 1. The URL column heals itself over time.

Then request the **full structured profile** in a single call. Forced JSON, per-field `confidence`
+ `sourceUrl`:

```jsonc
{
  "annualFee": { "value": 0, "confidence": 0.95, "sourceUrl": "https://citi.com/..." },
  "signupBonus": { "amount": ..., "spend": ..., "desc": ..., "confidence": ..., "sourceUrl": ... },
  "earnCategories": [
    { "name": "Costco Gas", "group": "Auto", "multiplier": 5, "spendLimit": 7000,
      "desc": "5% at Costco gas...", "confidence": 0.9, "sourceUrl": "..." }
  ],
  "benefits": [ { "title": "...", "desc": "...", "confidence": ..., "sourceUrl": ... } ]
}
```

Prompt: "prefer the issuer's official terms page; if terms are tiered/regional, report the standard
US consumer terms; set confidence low if the page is ambiguous or not the issuer's own."

### 4. Eval — diff extracted vs stored

Pure, unit-testable differ. Match arrays by normalized name (earn category name / benefit title).
Emit a changeset of typed ops:
`{ field, changeType: "patch"|"add"|"remove", current, proposed, confidence, sourceUrl }`.

### 5. Gate — the auto-apply decision (safety core)

A change **auto-applies** only if ALL hold; else it **falls back to the `cardDataReview` queue**
(never dropped, never silently applied):

- `confidence >= CONFIDENCE_AUTO_APPLY` (start 0.85).
- Has a `sourceUrl`; **issuer-domain** source required for higher-risk fields.
- Passes sanity bounds: fee 0–1000, multiplier 1–10, no negatives, `spendLimit >= 0`.
- Passes magnitude guards: numeric delta not absurd; **never bulk-delete** — cap net array
  removals at 1 per card per run (a wholesale "benefits: 10 → 0" is always a review, never auto).
- A failed/empty web result **never** overwrites good data (existing behavior — keep).

### 6. Apply — provenance + audit + rollback

New `internalMutation applyVerifiedCorrections`: patch the allowed fields, write `fieldProvenance`
(`source:"web"`, confidence, url, verifiedAt), bump `lastVerifiedAt`. Store the **previous value**
in an audit row (new `cardDataAudit` table or reuse `cardDataReview` with `status:"auto-applied"`)
for rollback + a "what changed" admin view. Log every auto-apply.

### 7. Kill switch

Env `AUTO_APPLY_ENABLED`. When off, the whole pipeline runs in **review-only** mode (enqueue, apply
nothing) — same code path, safe default for first deploy.

## Config (env)

`CONFIDENCE_AUTO_APPLY` (0.85), `PER_RUN_CAP`, `CARD_VERIFY_TTL_DAYS` (7), `OPENROUTER_MODEL`
(deepseek/deepseek-v4-flash — matches deployments), `AUTO_APPLY_ENABLED`, `AUTO_APPLY_FIELDS`
(allowlist of field groups), `ISSUER_DOMAIN_ALLOWLIST` (authoritative domains for source selection).

## Rollout (staged — do not ship full-auto on day one)

1. **Shadow (review-only).** `AUTO_APPLY_ENABLED=false`. Pipeline enqueues every diff to the review
   queue. Run on dev + staging ~1 week. Measure LLM precision against your own judgment. This also
   dogfoods the extraction quality cheaply.
2. **Auto-apply safe scalars.** Turn on for `annualFee`, `fxFee`, earn multipliers only, threshold
   0.9, issuer-domain required. Text/benefits still review.
3. **Expand to arrays.** Enable `spendBonusCategory[]` + `benefit[]` auto-apply once precision is
   proven. Keep bulk-delete on manual review permanently.

## Risks

- **Hallucination / wrong source** — LLM cites a blog, not the issuer; regional/tiered terms
  confusion. Mitigated by issuer-domain gate + confidence + shadow phase.
- **RapidAPI clobber** — the 2h refresh reverts corrections (see Critical bug). Must land the
  provenance-aware write first.
- **Cost** — one web-LLM call per distinct wallet card per TTL period. Deduping across users + TTL +
  per-run cap keep it bounded. Estimate before Phase 2.
- **Downstream** — benefit changes re-seed `userBenefits`; category changes drive tips. Verify no
  duplicate credits / duplicate tips.
- **Silent regression** — audit log + rollback + kill switch are mandatory, not optional.

## Single solution — no new manual override layer

This automated pipeline is the **one** mechanism; we are **not** adding a hand-curated
`spendBonusOverrides.json`. Every stale-data case (including the motivating Costco 5%-gas example)
is fixed by the daily verify → auto-apply loop, not by hand-editing JSON per card.

The existing `benefitOverrides.json` (credits only) stays as-is — it predates this work and still
functions — but it is **not extended** to earn rates, and nothing new depends on it. If a true
emergency ever needs an instant manual override, `fieldProvenance` (highest confidence, `verifiedAt`
= now) already lets an admin pin a value that the pipeline won't overwrite; no new file needed.

## Decisions (confirmed 2026-07-22)

1. **Auto-apply: gated + staged.** Shadow/review-only first week to measure LLM precision, then
   confidence-gated auto-apply (issuer-cited, threshold 0.85+); bulk-deletes always reviewed.
   `AUTO_APPLY_ENABLED=false` on first deploy.
2. **Refresh TTL: weekly per card.** `CARD_VERIFY_TTL_DAYS=7`; daily cron picks the most-overdue N,
   load spread across the week.

### Still open

- **Which fields auto-apply vs always-review** — recommend scalars (fees, multipliers) first,
  arrays (benefits, categories) after Phase-2 precision is proven.
- **Monthly OpenRouter spend ceiling** — set a cap before Phase 2.
- **Second source** — issuer page only, or also a second aggregator to break ties?
```

---

## Implementation status & hardening (updated 2026-07-22)

PRs #84/#85 shipped the pipeline (`freshness.ts` + pure modules, `cardDataAudit`,
per-item review UI). A follow-up hardening pass closed the gaps found when
auditing the shipped code against this plan:

### Shipped divergences from the original design (intentional)

- **Removals never auto-apply** (gate rule) instead of a numeric "net removals
  ≤1 per run" cap — strictly stronger. The mass-removal guard (below) covers
  the review-spam side.
- **Array corrections are per-item reviews** (one row per add/remove/patch with
  `changeType` + `itemName`), not whole-array blobs.
- **Enumeration is claim-based** (most-overdue-first via
  `cardDetails.by_lastVerifiedAt`), not a cron-picks-N cursor walk.

### Hardening pass (this branch)

1. **Review-loop integrity** — manual (`source:"manual"`) provenance pins
   outrank auto-apply; reviewer-rejected proposals are value-level suppressed
   (audited `mode:"suppressed"`, not re-enqueued every TTL); confirms verify the
   live value still matches the proposal (else the row closes as
   `status:"stale"`); pending rows whose diff disappeared are retired after each
   run; bulk confirm requires an issuer-authoritative citation. The gate verdict
   is persisted as `wouldAutoApply` on review + audit rows.
2. **Scheduling/throughput** — `verifyWalletBatch` self-chains until due cards
   drain or the daily budget is spent; `claimDueCards` selects+claims in one
   transaction (the claim doubles as crash backoff); per-card calls are staggered.
3. **LLM robustness** — `response_format: json_object` + bounded 429/5xx/network
   retries; `verifyMyWallet` runs in bounded chunks.
4. **Mass-removal guard** — an extraction removing a strict majority (≥2) of an
   array's items is dropped whole, audited `mode:"suspect"`, retried on the
   short backoff.
5. **Coverage** — `fxFee` (auto-eligible) and the signup-bonus block
   (review-only via `reviewOnlyFields` until precision proves it). Base earn and
   travel perks deliberately skipped (freeform text, high false-positive risk).
6. **URL self-heal** — implemented: an issuer-authoritative, confident citation
   found during web-search fallback is proposed as a `cardUrl` change
   (sanitized), flowing through the normal gate/kill-switch/suppression path.
7. **Audit/rollback/measurement** — `audit.ts`: paginated history, run log
   (`pipelineRuns`), `shadowPrecision` (reviewer verdicts over
   `wouldAutoApply:true` rows), and `revertAudit` (inverse delta, manual-pinned,
   audited `mode:"revert"`). Surfaced in the review page's History tab.
8. **Cleanup** — legacy `verify.ts` pipeline deleted (`freshness.ts` owns
   verification end-to-end).

### Env vars (Convex dashboard, per deployment)

| Var | Default | Meaning |
| --- | --- | --- |
| `AUTO_APPLY_ENABLED` | unset (off) | Kill switch; off = shadow mode (record + review only) |
| `CONFIDENCE_AUTO_APPLY` | 0.85 | Gate threshold for auto-apply |
| `CARD_VERIFY_TTL_DAYS` | 7 | Per-card re-verify TTL |
| `FRESHNESS_FAILURE_RETRY_HOURS` | 6 | Backoff after a failed/suspect extraction |
| `FRESHNESS_PER_RUN_CAP` | 25 | Cards claimed per chain link |
| `FRESHNESS_DAILY_CAP` | 150 | Hard ceiling on LLM calls per daily chain |
| `FRESHNESS_CALL_SPACING_MS` | 5000 | Stagger between per-card verifications |
| `FRESHNESS_WALLET_CONCURRENCY` | 3 | Concurrency of the manual wallet verify |
| `OPENROUTER_MAX_RETRIES` | 2 | Retries per extraction on 429/5xx/network |
| `OPENROUTER_MODEL` | deepseek/deepseek-v4-flash | Extraction model |
| `ISSUER_DOMAIN_ALLOWLIST` | built-in list | Authoritative domains (comma-separated) |

### Rollout recipe

1. Deploy with `AUTO_APPLY_ENABLED` unset — shadow mode. Let the daily cron run
   ≥1 TTL cycle (a week) while reviewing findings normally.
2. Watch the History tab's **shadow precision** tile (reviewer-confirmed share
   of would-auto-apply findings). Target ≥95%.
3. Set `AUTO_APPLY_ENABLED=true` on dev/staging first; watch the audit trail
   and revert anything wrong (revert pins the field against re-apply).
4. Promote to prod. Signup-bonus fields stay review-only (`reviewOnlyFields`)
   until precision on them separately justifies promotion.
