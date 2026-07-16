import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

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

// Baseline Plaid transaction sync (webhook is the low-latency trigger; this is
// the safety net so Items stay current even without webhooks).
crons.interval(
  "sync plaid transactions",
  { hours: 6 },
  internal.plaid.syncAllItems,
  { cursor: null },
);

// Daily retirement of Plaid suggestions logic has since resolved (period
// expired or issuer credit covered it) — keeps Detected down to actionables.
crons.interval(
  "retire resolved suggestions",
  { hours: 24 },
  internal.plaid.retireAllResolvedSuggestions,
  { cursor: null },
);

// Daily credit reminders: unused-before-reset expiry alerts + Plaid
// suggested-credit confirmation nudges.
crons.interval(
  "credit reminders daily",
  { hours: 24 },
  internal.reminders.scanDailyBatch,
  { cursor: null },
);

// Weekly Monday digest of unused credits (Monday 14:00 UTC; quiet-hours defers
// delivery to a sensible local time). crons.cron per the project's Convex
// guidelines (interval/cron only).
crons.cron(
  "credit weekly digest",
  "0 14 * * 1",
  internal.reminders.scanDigestBatch,
  { cursor: null },
);

export default crons;
