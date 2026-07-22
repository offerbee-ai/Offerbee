import { describe, expect, it } from "vitest";
import { applyItemDelta } from "./arrayDelta";

// One item-level delta applied to a stored array (matched by name across any of
// nameKeys). Shared by the freshness auto-apply path and the per-item review
// confirm, so a single benefit/category change is applied without touching the
// rest of the array.

const NAME_KEYS = ["spendBonusCategoryName", "spendBonusCategoryType"];

describe("applyItemDelta", () => {
  it("adds a new item", () => {
    const out = applyItemDelta(
      [{ spendBonusCategoryName: "Dining", earnMultiplier: 3 }],
      { changeType: "add", itemName: "Costco Gas", item: { spendBonusCategoryName: "Costco Gas", earnMultiplier: 5 } },
      NAME_KEYS,
    );
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ spendBonusCategoryName: "Costco Gas", earnMultiplier: 5 });
  });

  it("removes an item by name (case/space-insensitive)", () => {
    const out = applyItemDelta(
      [
        { spendBonusCategoryName: "Gas Stations", earnMultiplier: 4 },
        { spendBonusCategoryName: "Dining", earnMultiplier: 3 },
      ],
      { changeType: "remove", itemName: "  gas stations ", item: undefined },
      NAME_KEYS,
    );
    expect(out).toEqual([{ spendBonusCategoryName: "Dining", earnMultiplier: 3 }]);
  });

  it("patches a matched item by merging over it (omitted fields survive)", () => {
    const out = applyItemDelta(
      [{ spendBonusCategoryName: "Gas", earnMultiplier: 4, spendBonusCategoryGroup: "Auto" }],
      { changeType: "patch", itemName: "Gas", item: { spendBonusCategoryName: "Gas", earnMultiplier: 5 } },
      NAME_KEYS,
    );
    expect(out[0]).toEqual({ spendBonusCategoryName: "Gas", earnMultiplier: 5, spendBonusCategoryGroup: "Auto" });
  });

  it("adds when a patch target is not found (idempotent upsert)", () => {
    const out = applyItemDelta(
      [{ spendBonusCategoryName: "Dining", earnMultiplier: 3 }],
      { changeType: "patch", itemName: "Gas", item: { spendBonusCategoryName: "Gas", earnMultiplier: 4 } },
      NAME_KEYS,
    );
    expect(out).toHaveLength(2);
  });

  it("matches on the fallback name key", () => {
    const out = applyItemDelta(
      [{ spendBonusCategoryType: "Single - Dining", earnMultiplier: 3 }],
      { changeType: "remove", itemName: "Single - Dining", item: undefined },
      NAME_KEYS,
    );
    expect(out).toEqual([]);
  });
});
