import { notifAction, notifCategory, notifTarget } from "./derive";

describe("notifCategory", () => {
  it("maps expiring types", () => {
    expect(notifCategory("credit_expiring")).toBe("expiring");
    expect(notifCategory("credit_expiry_roundup")).toBe("expiring");
  });
  it("maps annual fee to fee", () => {
    expect(notifCategory("annual_fee_due")).toBe("fee");
  });
  it("defaults everything else to reset", () => {
    expect(notifCategory("credit_suggested")).toBe("reset");
    expect(notifCategory("perk_lounge")).toBe("reset");
    expect(notifCategory("totally_unknown")).toBe("reset");
  });
});

describe("notifAction", () => {
  it("expiring -> Use accent", () => {
    expect(notifAction("expiring")).toEqual({ label: "Use", tone: "accent" });
  });
  it("fee -> Details neutral", () => {
    expect(notifAction("fee")).toEqual({ label: "Details", tone: "neutral" });
  });
  it("reset -> View neutral", () => {
    expect(notifAction("reset")).toEqual({ label: "View", tone: "neutral" });
  });
});

describe("notifTarget", () => {
  it("reads data.route + ids", () => {
    expect(notifTarget({ route: "credit", creditId: "c1" })).toBe("/credit/c1?from=Notifications");
    expect(notifTarget({ route: "card", cardKey: "amex_plat" })).toBe("/card/amex_plat");
    expect(notifTarget({ route: "benefits" })).toBe("/benefits");
  });
  it("returns null when route missing or unknown", () => {
    expect(notifTarget(undefined)).toBeNull();
    expect(notifTarget(null)).toBeNull();
    expect(notifTarget({})).toBeNull();
    expect(notifTarget({ route: "mystery" })).toBeNull();
  });
});
