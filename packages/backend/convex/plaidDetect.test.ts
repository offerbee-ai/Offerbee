import { describe, expect, it } from "vitest";
import { deriveDetected } from "./plaidDetect";

const acct = (over: Partial<Parameters<typeof deriveDetected>[0][number]>) => ({
  accountId: "acc-1",
  mask: "0704",
  name: "Sapphire Preferred",
  officialName: undefined,
  subtype: "credit card",
  ...over,
});

describe("deriveDetected", () => {
  it("resolves a recognizable credit account to its cardKey", () => {
    const out = deriveDetected([acct({})], "Chase");
    expect(out).toEqual([
      {
        accountId: "acc-1",
        mask: "0704",
        name: "Sapphire Preferred",
        officialName: undefined,
        subtype: "credit card",
        resolvedCardKey: "chase-sapphirepreferred",
      },
    ]);
  });

  it("returns null resolvedCardKey for ambiguous names (Chase UR case)", () => {
    const out = deriveDetected(
      [acct({ name: "Ultimate Rewards®", officialName: "Ultimate Rewards®" })],
      "Chase",
    );
    expect(out[0].resolvedCardKey).toBeNull();
  });

  it("filters out non-credit accounts", () => {
    const out = deriveDetected(
      [acct({ subtype: "checking" }), acct({ accountId: "acc-2" })],
      "Chase",
    );
    expect(out.map((a) => a.accountId)).toEqual(["acc-2"]);
  });

  it("keeps accounts with no subtype (Plaid sometimes omits it)", () => {
    const out = deriveDetected([acct({ subtype: undefined })], "Chase");
    expect(out).toHaveLength(1);
  });
});
