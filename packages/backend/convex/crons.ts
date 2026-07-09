import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Nightly full catalog list (a single API call), 08:00 UTC.
crons.cron("sync card catalog", "0 8 * * *", internal.rapidapi.syncCatalog, {});

// Rolling detail refresh (TTL-gated + capped per run), every 2 hours.
crons.interval(
  "refresh card details",
  { hours: 2 },
  internal.rapidapi.refreshStaleDetails,
  {},
);

// Daily offer-detection sweep across all users.
crons.interval("detect offers", { hours: 24 }, internal.offers.scanUsersBatch, {
  cursor: null,
});

// Safety-net push drain (also retries notifications left pending during quiet hours).
crons.interval(
  "flush pending push",
  { minutes: 10 },
  internal.push.flushPending,
  {},
);

// Delivery receipts (Expo needs >15m after send).
crons.interval(
  "check push receipts",
  { minutes: 30 },
  internal.push.checkReceipts,
  {},
);

export default crons;
