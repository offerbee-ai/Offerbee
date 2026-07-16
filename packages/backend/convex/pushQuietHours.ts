// Pure quiet-hours check (no Convex imports). start inclusive, end exclusive,
// both 0-23 local hours; overnight windows (start > end) wrap midnight. Unknown
// timezone => never suppress (fail open).
export type QuietHoursInput = {
  quietHoursStart?: number;
  quietHoursEnd?: number;
  timeZone?: string;
};

export function inQuietHours(user: QuietHoursInput, now: number): boolean {
  const { quietHoursStart: start, quietHoursEnd: end, timeZone } = user;
  if (start === undefined || end === undefined || start === end) return false;
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: timeZone ?? "UTC",
      }).format(new Date(now)),
    );
  } catch {
    return false;
  }
  if (hour === 24) hour = 0; // some runtimes format midnight as "24"
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
