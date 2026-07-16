import { describe, expect, it } from "vitest";
import { normalizeProfileName, hasValidFirstName } from "./profileName";

describe("normalizeProfileName", () => {
  it("trims and combines first + last into a display name", () => {
    expect(normalizeProfileName("  Ronak ", " Patel ")).toEqual({
      firstName: "Ronak",
      lastName: "Patel",
      name: "Ronak Patel",
    });
  });

  it("drops an empty last name from the combined name", () => {
    expect(normalizeProfileName("Ronak", "")).toEqual({
      firstName: "Ronak",
      lastName: "",
      name: "Ronak",
    });
    expect(normalizeProfileName("Ronak", undefined)).toEqual({
      firstName: "Ronak",
      lastName: "",
      name: "Ronak",
    });
  });

  it("collapses internal whitespace", () => {
    expect(normalizeProfileName("Mary   Jane", "Van   Buren")).toEqual({
      firstName: "Mary Jane",
      lastName: "Van Buren",
      name: "Mary Jane Van Buren",
    });
  });

  it("treats null/undefined as empty", () => {
    expect(normalizeProfileName(null, null)).toEqual({
      firstName: "",
      lastName: "",
      name: "",
    });
  });
});

describe("hasValidFirstName", () => {
  it("requires a non-empty, non-whitespace first name", () => {
    expect(hasValidFirstName("Ronak")).toBe(true);
    expect(hasValidFirstName("  R ")).toBe(true);
    expect(hasValidFirstName("")).toBe(false);
    expect(hasValidFirstName("   ")).toBe(false);
    expect(hasValidFirstName(undefined)).toBe(false);
    expect(hasValidFirstName(null)).toBe(false);
  });
});
