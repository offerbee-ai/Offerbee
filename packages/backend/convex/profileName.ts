// Pure name-normalization shared by the profile-name mutation and its tests.
// Kept free of any Convex-server imports so it runs under plain vitest (same
// pattern as plaidMatch.ts / reminderRules.ts).

export type NormalizedName = {
  firstName: string;
  lastName: string;
  /** Combined "First Last" for the single `users.name` column + render sites. */
  name: string;
};

// Trim, collapse internal whitespace, and derive the combined display name.
// Never throws — callers decide whether an empty first name is acceptable.
export function normalizeProfileName(
  firstNameRaw?: string | null,
  lastNameRaw?: string | null,
): NormalizedName {
  const firstName = collapse(firstNameRaw);
  const lastName = collapse(lastNameRaw);
  const name = [firstName, lastName].filter(Boolean).join(" ");
  return { firstName, lastName, name };
}

// A profile needs at least a non-empty first name so no user is ever nameless.
export function hasValidFirstName(firstNameRaw?: string | null): boolean {
  return collapse(firstNameRaw).length > 0;
}

function collapse(value?: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}
