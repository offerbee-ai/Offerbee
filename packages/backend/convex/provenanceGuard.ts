// Guards authoritative field values against being clobbered by a RapidAPI
// refresh. catalogSync.saveCardDetail full-overwrites a card's stored content
// on every change; a field that a human confirmed (provenance source "manual")
// or the verifier web-checked ("web") must NOT be reverted to the stale API
// value. This strips such fields from the incoming API patch so their stored
// value survives. RapidAPI-sourced provenance is not protective — it merely
// records the API value, which the refresh is free to update.
//
// Pure module (no Convex imports) so it's unit-testable, matching the
// benefitOverrides.ts pattern.

// Sources whose recorded value outranks a RapidAPI refresh.
export const AUTHORITATIVE_SOURCES: ReadonlySet<string> = new Set([
  "web",
  "manual",
]);

// Only `field` and `source` drive the guard; the index signature lets callers
// pass full fieldProvenance entries (value/confidence/sourceUrl/verifiedAt).
type ProvenanceEntry = { field: string; source: string; [key: string]: unknown };

// Split an incoming RapidAPI content object into the patch to actually apply
// (authoritative fields removed) and the list of preserved field names.
export function guardApiContent(
  content: Record<string, unknown>,
  provenance: ReadonlyArray<ProvenanceEntry> | undefined,
): { patch: Record<string, unknown>; preserved: string[] } {
  const pinned = new Set(
    (provenance ?? [])
      .filter((p) => AUTHORITATIVE_SOURCES.has(p.source))
      .map((p) => p.field),
  );

  const patch: Record<string, unknown> = {};
  const preserved: string[] = [];
  for (const [key, value] of Object.entries(content)) {
    if (pinned.has(key)) preserved.push(key);
    else patch[key] = value;
  }
  return { patch, preserved };
}
