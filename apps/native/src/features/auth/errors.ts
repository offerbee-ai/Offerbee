/** First human-readable message from a Clerk API error, else the fallback. */
export function clerkError(err: unknown, fallback = "Something went wrong. Try again."): string {
  const e = err as { errors?: { message?: string; longMessage?: string }[] };
  return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? fallback;
}
