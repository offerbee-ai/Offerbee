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
