import type { Auth } from "convex/server";

// Shared auth helpers. Identity is the Clerk JWT subject (see auth.config.ts).
// Every owned row stores this value as `userId`.

export async function getUserId({ auth }: { auth: Auth }) {
  return (await auth.getUserIdentity())?.subject ?? null;
}

export async function requireUserId({ auth }: { auth: Auth }) {
  const userId = await getUserId({ auth });
  if (userId) return userId;

  throw new Error(
    "Authenticated user was required, but no Clerk subject was found",
  );
}

// ── Admin gating ────────────────────────────────────────────────────────────
// Admin status comes from a Clerk `role` claim. One-time setup: in the Clerk
// dashboard add a claim to the "convex" JWT template —
//   "role": "{{user.public_metadata.role}}"
// then set publicMetadata.role = "admin" on the users who should be admins.
// Until that's configured the claim is undefined and everyone is a non-admin
// (fail closed).
type MaybeRole = { role?: unknown };

export async function isAdmin({ auth }: { auth: Auth }) {
  const identity = await auth.getUserIdentity();
  return (identity as MaybeRole | null)?.role === "admin";
}

export async function requireAdmin({ auth }: { auth: Auth }) {
  const identity = await auth.getUserIdentity();
  if (!identity) throw new Error("Authenticated user was required");
  if ((identity as unknown as MaybeRole).role !== "admin")
    throw new Error("Admin access is required for this action");
  return identity.subject;
}
