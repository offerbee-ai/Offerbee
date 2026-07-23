// Parses the LLM's card-profile response into a normalized shape the diff
// primitives consume. The model returns JSON, sometimes wrapped in prose or a
// markdown fence; we extract the object, coerce annualFee to a number, and map
// the two arrays to { name, ... } items (benefits' `title` -> `name`) so
// cardDataDiff can match them. Returns null when no usable JSON is present.
// Pure module — unit-testable.

import type { NamedItem } from "./cardDataDiff";

export type ExtractedSignupBonus = {
  amount?: number;
  spend?: number;
  length?: number;
  lengthPeriod?: string;
  desc?: string;
  confidence?: number;
  sourceUrl?: string;
};

export type ExtractedProfile = {
  annualFee?: number;
  annualFeeConfidence?: number;
  annualFeeSourceUrl?: string;
  fxFee?: number;
  fxFeeConfidence?: number;
  fxFeeSourceUrl?: string;
  // Present only when the model reported the block (omitted → don't diff).
  signupBonus?: ExtractedSignupBonus;
  // undefined = the model omitted the field (do NOT diff → no bogus removals);
  // [] = the model explicitly reported no items (a real removal signal).
  earnCategories?: NamedItem[];
  benefits?: NamedItem[];
};

export function toNum(x: unknown): number | undefined {
  if (typeof x === "number") return Number.isFinite(x) ? x : undefined;
  if (typeof x === "string") {
    const n = parseFloat(x.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function parseExtraction(raw: string): ExtractedProfile | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj: Record<string, any>;
  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    obj = parsed;
  } catch {
    return null;
  }

  const profile: ExtractedProfile = {};

  const afNode = obj.annualFee;
  const af = toNum(afNode?.value ?? afNode);
  if (af !== undefined) {
    profile.annualFee = af;
    if (afNode && typeof afNode === "object") {
      if (typeof afNode.confidence === "number")
        profile.annualFeeConfidence = afNode.confidence;
      if (typeof afNode.sourceUrl === "string")
        profile.annualFeeSourceUrl = afNode.sourceUrl;
    }
  }

  const fxNode = obj.fxFee;
  const fx = toNum(fxNode?.value ?? fxNode);
  if (fx !== undefined) {
    profile.fxFee = fx;
    if (fxNode && typeof fxNode === "object") {
      if (typeof fxNode.confidence === "number")
        profile.fxFeeConfidence = fxNode.confidence;
      if (typeof fxNode.sourceUrl === "string")
        profile.fxFeeSourceUrl = fxNode.sourceUrl;
    }
  }

  const sbNode = obj.signupBonus;
  if (sbNode && typeof sbNode === "object" && !Array.isArray(sbNode)) {
    const sb: ExtractedSignupBonus = {};
    const amount = toNum(sbNode.amount);
    if (amount !== undefined) sb.amount = amount;
    const spend = toNum(sbNode.spend);
    if (spend !== undefined) sb.spend = spend;
    // Accept either explicit length/lengthPeriod or a combined
    // lengthOfPeriod like "3 months".
    const length = toNum(sbNode.length);
    if (length !== undefined) sb.length = length;
    if (typeof sbNode.lengthPeriod === "string" && sbNode.lengthPeriod.trim())
      sb.lengthPeriod = sbNode.lengthPeriod;
    if (typeof sbNode.lengthOfPeriod === "string") {
      const m = sbNode.lengthOfPeriod.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?/);
      if (m) {
        if (sb.length === undefined) sb.length = parseFloat(m[1]);
        if (sb.lengthPeriod === undefined && m[2])
          sb.lengthPeriod = m[2].toLowerCase();
      }
    }
    // Empty/whitespace strings are absence, not values — "" as a desc would
    // otherwise diff against the stored desc and propose wiping it.
    if (typeof sbNode.desc === "string" && sbNode.desc.trim())
      sb.desc = sbNode.desc;
    // The block only counts as reported when it carries at least one VALUE —
    // a metadata-only object (confidence/sourceUrl alone) verifies nothing
    // and must not read as an evaluated field downstream.
    const hasValue =
      sb.amount !== undefined ||
      sb.spend !== undefined ||
      sb.length !== undefined ||
      sb.lengthPeriod !== undefined ||
      sb.desc !== undefined;
    if (hasValue) {
      if (typeof sbNode.confidence === "number")
        sb.confidence = sbNode.confidence;
      if (typeof sbNode.sourceUrl === "string") sb.sourceUrl = sbNode.sourceUrl;
      profile.signupBonus = sb;
    }
  }

  if (Array.isArray(obj.earnCategories)) {
    profile.earnCategories = obj.earnCategories
      .filter((c: any) => c && typeof c.name === "string")
      .map((c: any) => {
        const out: NamedItem = { ...c };
        // Coerce numeric terms so the gate's bounds checks apply (LLMs often
        // return "5" / "7000" as strings).
        const m = toNum(c.multiplier);
        if (m !== undefined) out.multiplier = m;
        const sl = toNum(c.spendLimit);
        if (sl !== undefined) out.spendLimit = sl;
        return out;
      });
  }

  if (Array.isArray(obj.benefits)) {
    profile.benefits = obj.benefits
      .map((b: any): NamedItem | null => {
        const name =
          typeof b?.name === "string"
            ? b.name
            : typeof b?.title === "string"
              ? b.title
              : undefined;
        if (!name) return null;
        const { title: _title, ...rest } = b ?? {};
        return { ...rest, name };
      })
      .filter((b: NamedItem | null): b is NamedItem => b !== null);
  }

  return profile;
}
