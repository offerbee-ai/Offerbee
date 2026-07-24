import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_NOTIFICATION_CATEGORIES } from "./onboardingCatalog";
import { periodEnd, periodKey } from "./benefitCycles";
import { DAY_MS, EXPIRY_ROUNDUP_LEADS, expiryRoundupPlan } from "./reminderRules";
import type { ExpiryTier, RoundupBenefit, RoundupMember, RoundupTier } from "./reminderRules";

const PAGE = 50;
const MAX_SUGGESTED_PER_RUN = 3;
const BENEFITS_PER_USER = 200;

const fmtUsd = (n: number) => `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;

function categoriesFor(user: Doc<"users">) {
  return user.notificationCategories ?? DEFAULT_NOTIFICATION_CATEGORIES;
}

// Current-period usage for one benefit (manual + Plaid auto rows). Mirrors
// benefits.currentPeriodUsage (kept local so reminders has no cross-module coupling).
async function currentPeriodUsage(ctx: MutationCtx, benefitId: Id<"userBenefits">, pk: string): Promise<number> {
  const rows = await ctx.db
    .query("benefitUsages")
    .withIndex("by_userBenefitId_and_periodKey", (q) => q.eq("userBenefitId", benefitId).eq("periodKey", pk))
    .take(50);
  return Math.round(rows.reduce((a, r) => a + r.amount, 0) * 100) / 100;
}

// "Realistically usable" (the `smart` filter): redeemed in a PRIOR period, or
// created in the current period (grace — no full period to use it yet).
async function isUsable(ctx: MutationCtx, benefit: Doc<"userBenefits">, pk: string): Promise<boolean> {
  const prior = await ctx.db
    .query("benefitUsages")
    .withIndex("by_userBenefitId_and_periodKey", (q) => q.eq("userBenefitId", benefit._id).lt("periodKey", pk))
    .first();
  if (prior) return true;
  return periodKey(benefit.cycle, benefit.createdAt) === pk;
}

type Notif = {
  type: string;
  cardKey?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  dedupKey: string;
};

async function insertIfNew(ctx: MutationCtx, userId: string, n: Notif, now: number) {
  const dup = await ctx.db
    .query("notifications")
    .withIndex("by_userId_and_dedupKey", (q) => q.eq("userId", userId).eq("dedupKey", n.dedupKey))
    .unique();
  if (dup) return;
  await ctx.db.insert("notifications", {
    userId,
    type: n.type,
    ...(n.cardKey ? { cardKey: n.cardKey } : {}),
    title: n.title,
    body: n.body,
    ...(n.data ? { data: n.data } : {}),
    dedupKey: n.dedupKey,
    isRead: false,
    createdAt: now,
    deliveryStatus: "pending",
  });
}

// Active, un-muted, un-snoozed benefits for a user. `card` mute lives on userCards.
async function activeBenefits(ctx: MutationCtx, userId: string, now: number): Promise<Doc<"userBenefits">[]> {
  const benefits = await ctx.db
    .query("userBenefits")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(BENEFITS_PER_USER);
  const out: Doc<"userBenefits">[] = [];
  for (const b of benefits) {
    if (b.archivedAt) continue;
    if (b.snoozedUntil && b.snoozedUntil > now) continue;
    const card = await ctx.db.get(b.userCardId);
    if (card && card.notificationsEnabled === false) continue;
    out.push(b);
  }
  return out;
}

// Dedup slug per tier (kept short + stable — the value is baked into dedupKeys).
const TIER_SLUG: Record<ExpiryTier, string> = { headsUp: "headsup", lastChance: "last" };

// N == 1: rich, actionable single-credit push (deep-links to the card, keeps the
// `expiring` Expo action category via push.ts CATEGORY_FOR_TYPE).
async function emitSingleCredit(
  ctx: MutationCtx,
  userId: string,
  m: RoundupMember,
  tier: ExpiryTier,
  now: number,
) {
  await insertIfNew(
    ctx,
    userId,
    {
      type: "credit_expiring",
      cardKey: m.cardKey,
      title: `${fmtUsd(m.remaining)} left on ${m.title}`,
      body: `Resets in ${plural(m.daysLeft, "day")} — use it before it's gone.`,
      data: { route: "card", cardKey: m.cardKey, benefitId: m.benefitId },
      dedupKey: `credit_expiring:${m.benefitId}:${m.periodKey}:${TIER_SLUG[tier]}`,
    },
    now,
  );
}

// N >= 2: one grouped push. Deduped per (tier, month-anchor) so each tier fires
// at most once per month regardless of how many days the window spans.
async function emitRoundup(
  ctx: MutationCtx,
  userId: string,
  t: RoundupTier,
  tier: ExpiryTier,
  now: number,
) {
  const copy =
    tier === "headsUp"
      ? {
          title: `${plural(t.count, "credit")} · ${fmtUsd(t.totalRemaining)} reset soon`,
          body: `Soonest resets in ${plural(t.soonestDays, "day")}. Tap to use them before they're gone.`,
        }
      : {
          title: `Last chance: ${plural(t.count, "credit")} · ${fmtUsd(t.totalRemaining)}`,
          body: `Reset in ${plural(t.soonestDays, "day")} — use them now.`,
        };
  await insertIfNew(
    ctx,
    userId,
    {
      type: "credit_expiry_roundup",
      title: copy.title,
      body: copy.body,
      data: { route: "benefits", tier },
      dedupKey: `credit_expiry_roundup:${TIER_SLUG[tier]}:${t.monthAnchor}`,
    },
    now,
  );
}

// Daily expiry producer: gather each active benefit that has entered its cycle's
// heads-up window, then emit one grouped roundup per tier (N>=2) or a rich
// single-credit push (N==1). Gated on the `expiry` category.
async function detectExpiryRoundup(ctx: MutationCtx, user: Doc<"users">, now: number) {
  if (!categoriesFor(user).expiry) return;
  const inputs: RoundupBenefit[] = [];
  for (const b of await activeBenefits(ctx, user.userId, now)) {
    // Cheap synchronous pre-filter: skip benefits outside every expiry window
    // before the per-benefit usage/usable reads, so a full wallet doesn't run
    // 2 queries/benefit when nothing is near reset. Benefits outside the
    // heads-up window are null-tiered by expiryRoundupPlan anyway, so this is
    // behavior-preserving (lastChance lead <= headsUp lead for every cycle).
    const days = Math.ceil((periodEnd(b.cycle, now) - now) / DAY_MS);
    if (days > EXPIRY_ROUNDUP_LEADS[b.cycle].headsUp) continue;
    const pk = periodKey(b.cycle, now);
    inputs.push({
      benefitId: b._id as string,
      cardKey: b.cardKey,
      title: b.title,
      cycle: b.cycle,
      amount: b.amount,
      usedAmount: await currentPeriodUsage(ctx, b._id, pk),
      usable: await isUsable(ctx, b, pk),
    });
  }
  const plan = expiryRoundupPlan(inputs, now);
  // The single-credit (N==1) and roundup (N>=2) paths use independent dedup keys,
  // so if a tier's count flips across the 1<->2 boundary within one period a
  // credit can receive both forms. Accepted: over-notifying (one extra actionable
  // push, and rare since monthly credits enter the window together) is the safe
  // failure vs. a unified key that could silently drop a newly-added credit.
  for (const tier of ["headsUp", "lastChance"] as ExpiryTier[]) {
    const t = plan[tier];
    if (!t) continue;
    if (t.count === 1) {
      await emitSingleCredit(ctx, user.userId, t.members[0], tier, now);
    } else {
      await emitRoundup(ctx, user.userId, t, tier, now);
    }
  }
}

// Plaid medium-confidence matches awaiting confirm in the Detected feed. Gated on
// the `transactions` category; deduped by transactionId so a pending suggestion is
// nudged at most once.
async function detectSuggested(ctx: MutationCtx, user: Doc<"users">, now: number) {
  if (!categoriesFor(user).transactions) return;
  const suggested = await ctx.db
    .query("plaidTransactions")
    .withIndex("by_userId_and_matchStatus", (q) => q.eq("userId", user.userId).eq("matchStatus", "suggested"))
    .take(MAX_SUGGESTED_PER_RUN);
  if (suggested.length === MAX_SUGGESTED_PER_RUN) {
    console.log(`reminders: capped suggested nudges at ${MAX_SUGGESTED_PER_RUN} for user ${user.userId}`);
  }
  for (const t of suggested) {
    if (!t.matchedBenefitId) continue;
    const benefit = await ctx.db.get(t.matchedBenefitId);
    if (!benefit || benefit.archivedAt) continue;
    const card = await ctx.db.get(benefit.userCardId);
    if (card && card.notificationsEnabled === false) continue;
    const merchant = t.merchantName ?? t.name ?? "a recent charge";
    await insertIfNew(
      ctx,
      user.userId,
      {
        type: "credit_suggested",
        cardKey: benefit.cardKey,
        title: `Did you use your ${benefit.title}?`,
        body: `We spotted a ${fmtUsd(t.amount)} charge at ${merchant}. Log it against your credit?`,
        data: { route: "detected", transactionId: t.transactionId, cardKey: benefit.cardKey },
        dedupKey: `credit_suggested:${t.transactionId}`,
      },
      now,
    );
  }
}

// Daily sweep: expiry + suggested, paginated + self-scheduling (offers pattern).
export const scanDailyBatch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const now = Date.now();
    const page = await ctx.db.query("users").paginate({ numItems: PAGE, cursor });
    for (const user of page.page) {
      if (user.notificationsEnabled === false) continue;
      await detectExpiryRoundup(ctx, user, now);
      await detectSuggested(ctx, user, now);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.reminders.scanDailyBatch, { cursor: page.continueCursor });
    } else {
      await ctx.scheduler.runAfter(0, internal.push.flushPending, {});
    }
  },
});

// Stable within a calendar week (guards accidental double-runs the same day).
function weekKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD of the run
}

async function buildDigest(ctx: MutationCtx, user: Doc<"users">, now: number) {
  if (!categoriesFor(user).digest) return;
  // The expiry roundup only owns near-term credits when the user has the expiry
  // category enabled; otherwise the digest must still surface them (never drop a
  // credit from both channels).
  const roundupOwnsNearTerm = categoriesFor(user).expiry;
  let count = 0;
  let totalRemaining = 0;
  let soonestDays = Infinity;
  for (const b of await activeBenefits(ctx, user.userId, now)) {
    const days = Math.ceil((periodEnd(b.cycle, now) - now) / DAY_MS);
    if (roundupOwnsNearTerm && days <= EXPIRY_ROUNDUP_LEADS[b.cycle].headsUp) continue;
    const pk = periodKey(b.cycle, now);
    const used = await currentPeriodUsage(ctx, b._id, pk);
    const remaining = Math.round((b.amount - used) * 100) / 100;
    if (remaining <= 0) continue;
    if (!(await isUsable(ctx, b, pk))) continue;
    count += 1;
    totalRemaining = Math.round((totalRemaining + remaining) * 100) / 100;
    if (days < soonestDays) soonestDays = days;
  }
  if (count === 0) return; // never send an empty digest
  await insertIfNew(
    ctx,
    user.userId,
    {
      type: "credit_digest",
      title: `${plural(count, "credit")} · ${fmtUsd(totalRemaining)} available this week`,
      body: `Soonest resets in ${plural(soonestDays, "day")}. Tap to see them all.`,
      data: { route: "benefits" },
      dedupKey: `credit_digest:${weekKey(now)}`,
    },
    now,
  );
}

// Weekly Monday sweep. Single UTC cron; flushPending's quiet-hours + timezone
// prevent night delivery (per-tz scheduling is a documented v2 non-goal).
export const scanDigestBatch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const now = Date.now();
    const page = await ctx.db.query("users").paginate({ numItems: PAGE, cursor });
    for (const user of page.page) {
      if (user.notificationsEnabled === false) continue;
      await buildDigest(ctx, user, now);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.reminders.scanDigestBatch, { cursor: page.continueCursor });
    } else {
      await ctx.scheduler.runAfter(0, internal.push.flushPending, {});
    }
  },
});
