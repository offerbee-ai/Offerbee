// Batch-planning and retry-classification helpers for the freshness pipeline's
// self-chaining daily driver. Pure module — unit-testable.

// How many cards the next chained invocation may claim: the per-run cap,
// shrunk by what's left of the daily budget. 0 means the chain must stop.
export function planBatch(
  processed: number,
  dailyCap: number,
  perRunCap: number,
): number {
  return Math.max(0, Math.min(perRunCap, dailyCap - processed));
}

// Which OpenRouter HTTP failures are worth retrying: rate limits and server
// errors. Other 4xx (bad request, auth) will not improve on retry.
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

// Exponential backoff: 2s, 4s, 8s, ...
export function retryDelayMs(attempt: number): number {
  return 2000 * 2 ** attempt;
}

// One owned card's freshness state, as listRefreshCandidates surfaces it.
export type FreshnessCandidate = {
  cardKey: string;
  cardName: string;
  cardIssuer: string;
  cardUrl: string | null;
  lastVerifiedAt: number | null;
};

// TTL gate for the external refresh path (the Claude-Code /freshness-refresh
// skill). Keeps only cards DUE for re-verification — never verified, or last
// verified before the TTL window elapsed — ranked oldest-first, capped at
// `limit`. A card verified within the last `ttlMs` is fresh and dropped, so the
// external pipeline re-checks each card at most once per TTL (1 week by
// default), matching the cron's claimDueCards. `now`/`ttlMs` are injected for
// testability. Strict `<` cutoff mirrors claimDueCards (a card exactly at the
// cutoff is treated as still fresh).
export function selectDueCandidates(
  cards: FreshnessCandidate[],
  now: number,
  ttlMs: number,
  limit: number,
): FreshnessCandidate[] {
  const cutoff = now - ttlMs;
  // Math.max(0, …) guards a caller that passes a negative limit: slice(0, -1)
  // would otherwise return all-but-the-last, defeating the cap. The query
  // clamps upstream too; this keeps the pure helper safe on its own.
  const cap = Math.max(0, limit);
  return cards
    .filter((c) => c.lastVerifiedAt == null || c.lastVerifiedAt < cutoff)
    .sort((a, b) => (a.lastVerifiedAt ?? 0) - (b.lastVerifiedAt ?? 0))
    .slice(0, cap);
}
