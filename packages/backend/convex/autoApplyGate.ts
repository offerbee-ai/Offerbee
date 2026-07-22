// The auto-apply gate: decides whether a proposed card-data change is written
// automatically or falls back to the human review queue. A change auto-applies
// only when it is confident, cited (has a source URL), within sane bounds, and
// is not a removal — removals always go to review (the "never bulk-delete"
// safety rule). Pure module — unit-testable. The kill switch and per-run
// removal cap live in the pipeline action, not here.

export type GateConfig = { confidenceThreshold: number };

export type Change = {
  field: string;
  changeType: "patch" | "add" | "remove";
  confidence?: number;
  sourceUrl?: string;
  proposed?: any;
  current?: any;
};

export type GateDecision = { autoApply: boolean; reason: string };

// Absolute sanity bounds for scalar fields (issuer terms never exceed these).
const SCALAR_BOUNDS: Record<string, [number, number]> = {
  annualFee: [0, 1000],
  fxFee: [0, 100],
  signupBonusSpend: [0, 100000],
};

const MULTIPLIER_BOUNDS: [number, number] = [1, 10];

const inRange = (n: number, [lo, hi]: [number, number]) => n >= lo && n <= hi;

function boundsError(change: Change): string | null {
  const p = change.proposed;

  if (typeof p === "number") {
    const b = SCALAR_BOUNDS[change.field];
    if (b && !inRange(p, b)) return `out of bounds for ${change.field}`;
    if (p < 0) return "negative value out of bounds";
    return null;
  }

  if (p && typeof p === "object") {
    if (typeof p.multiplier === "number" && !inRange(p.multiplier, MULTIPLIER_BOUNDS))
      return "multiplier out of bounds";
    for (const v of Object.values(p)) {
      if (typeof v === "number" && v < 0) return "negative value out of bounds";
    }
    return null;
  }

  return null;
}

export function gateChange(change: Change, cfg: GateConfig): GateDecision {
  if (change.changeType === "remove")
    return { autoApply: false, reason: "removal requires review" };

  const confidence = change.confidence ?? change.proposed?.confidence ?? 0;
  if (confidence < cfg.confidenceThreshold)
    return { autoApply: false, reason: `low confidence (${confidence})` };

  const url = change.sourceUrl ?? change.proposed?.sourceUrl;
  if (!url) return { autoApply: false, reason: "no source url" };

  const bound = boundsError(change);
  if (bound) return { autoApply: false, reason: bound };

  return { autoApply: true, reason: "ok" };
}
