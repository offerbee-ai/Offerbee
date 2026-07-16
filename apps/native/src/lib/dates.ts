/** "JULY 2026" kicker for the Review header. */
export function monthKicker(now: number): string {
  return new Date(now)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" })
    .toUpperCase();
}

/** Compact relative timestamp for the notifications inbox. */
export function timeAgo(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Jul 31" — last day of the period (resetAt is the exclusive reset instant). */
export function resetDayLabel(resetAt: number): string {
  return new Date(resetAt - 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
