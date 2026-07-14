import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const DAY_MS = 24 * 60 * 60 * 1000;
const SIGNUP_MILESTONES = [1, 7, 14, 30]; // ascending
const FEE_MILESTONES = [7, 30];

type Item = { userCard: Doc<"userCards">; detail: Doc<"cardDetails"> | null };
type Candidate = {
  type: string;
  cardKey?: string;
  title: string;
  body: string;
  dedupKey: string;
  data?: Record<string, unknown>;
};

// Smallest milestone bucket the remaining days fall into, so each threshold
// crossing fires exactly once (dedup keys are per-bucket).
function pickBucket(daysLeft: number, milestonesAsc: number[]): number | null {
  if (daysLeft < 0) return null;
  for (const m of milestonesAsc) if (daysLeft <= m) return m;
  return null;
}

function addMonths(ts: number, n: number): number {
  const d = new Date(ts);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
}

function detectPerCard(item: Item, now: number): Candidate[] {
  const { userCard: uc, detail: d } = item;
  if (!d) return [];
  if (uc.notificationsEnabled === false) return [];
  const out: Candidate[] = [];
  const name = d.cardName;
  const link = { route: "card", cardKey: d.cardKey };

  // Signup-bonus min-spend deadline (needs the user-supplied start date).
  if (
    d.isSignupBonus &&
    d.signupBonusSpend &&
    d.signupBonusLength &&
    uc.signupBonusStartDate &&
    !uc.signupBonusMet
  ) {
    const period = (d.signupBonusLengthPeriod ?? "months").toLowerCase();
    const deadline = period.startsWith("day")
      ? uc.signupBonusStartDate + d.signupBonusLength * DAY_MS
      : addMonths(uc.signupBonusStartDate, d.signupBonusLength);
    const daysLeft = Math.ceil((deadline - now) / DAY_MS);
    const bucket = pickBucket(daysLeft, SIGNUP_MILESTONES);
    if (bucket !== null) {
      const reward = d.signupBonusAmount
        ? `${d.signupBonusAmount} ${d.signupBonusType ?? "bonus"}`
        : "your welcome bonus";
      out.push({
        type: "signup_deadline",
        cardKey: d.cardKey,
        dedupKey: `signup_deadline:${d.cardKey}:${bucket}`,
        title: `${daysLeft} days left to earn your bonus`,
        body: `Spend $${d.signupBonusSpend} on ${name} within ${daysLeft} days to earn ${reward}.`,
        data: link,
      });
    }
  }

  // Annual-fee anniversary (needs the user-supplied opened date).
  if (d.annualFee && d.annualFee > 0 && uc.openedDate) {
    const opened = new Date(uc.openedDate);
    let years = new Date(now).getFullYear() - opened.getFullYear();
    let anniv = new Date(opened);
    anniv.setFullYear(opened.getFullYear() + years);
    if (anniv.getTime() < now) {
      years += 1;
      anniv = new Date(opened);
      anniv.setFullYear(opened.getFullYear() + years);
    }
    const daysLeft = Math.ceil((anniv.getTime() - now) / DAY_MS);
    const bucket = pickBucket(daysLeft, FEE_MILESTONES);
    const waivedFirstYear = years === 1 && d.isSignupAnnualFeeWaived;
    if (bucket !== null && !waivedFirstYear) {
      out.push({
        type: "annual_fee_due",
        cardKey: d.cardKey,
        dedupKey: `annual_fee_due:${d.cardKey}:${years}:${bucket}`,
        title: `${name} annual fee due soon`,
        body: `Your ${name} $${d.annualFee} annual fee posts in ${daysLeft} days — keep, downgrade, or cancel?`,
        data: link,
      });
    }
  }

  return out;
}

function buildCandidates(
  user: Doc<"users">,
  items: Item[],
  now: number,
): Candidate[] {
  let candidates = items.flatMap((i) => detectPerCard(i, now));
  const enabled = user.enabledOfferTypes;
  if (enabled && enabled.length > 0) {
    const allow = new Set(enabled);
    candidates = candidates.filter((c) => allow.has(c.type));
  }

  // Renewal toggle gates the annual-fee alert. Undefined => ON here (legacy users
  // keep the alert); explicit false (set via onboarding/settings) silences it.
  if (user.reminderPrefs?.renewal === false) {
    candidates = candidates.filter((c) => c.type !== "annual_fee_due");
  }

  return candidates;
}

async function loadItems(
  ctx: MutationCtx,
  userId: string,
): Promise<Item[]> {
  const cards = await ctx.db
    .query("userCards")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(200);
  return await Promise.all(
    cards.map(async (userCard) => {
      const detail = await ctx.db
        .query("cardDetails")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", userCard.cardKey))
        .unique();
      return { userCard, detail };
    }),
  );
}

async function detectAndInsert(
  ctx: MutationCtx,
  user: Doc<"users">,
  now: number,
) {
  const items = await loadItems(ctx, user.userId);
  const candidates = buildCandidates(user, items, now);
  for (const c of candidates) {
    const dup = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_dedupKey", (q) =>
        q.eq("userId", user.userId).eq("dedupKey", c.dedupKey),
      )
      .unique();
    if (dup) continue;
    await ctx.db.insert("notifications", {
      userId: user.userId,
      type: c.type,
      ...(c.cardKey ? { cardKey: c.cardKey } : {}),
      title: c.title,
      body: c.body,
      ...(c.data ? { data: c.data } : {}),
      dedupKey: c.dedupKey,
      isRead: false,
      createdAt: now,
      deliveryStatus: "pending",
    });
  }
}

// Daily sweep across all users, paginated + self-scheduling.
export const scanUsersBatch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const now = Date.now();
    const page = await ctx.db.query("users").paginate({ numItems: 50, cursor });
    for (const user of page.page) {
      if (user.notificationsEnabled === false) continue;
      await detectAndInsert(ctx, user, now);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.offers.scanUsersBatch, {
        cursor: page.continueCursor,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.push.flushPending, {});
    }
  },
});

// Re-evaluate offers for the owners of a card whose detail just changed.
export const rescanCard = internalMutation({
  args: { cardKey: v.string() },
  handler: async (ctx, { cardKey }) => {
    const now = Date.now();
    const owners = await ctx.db
      .query("userCards")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .take(200);
    const seen = new Set<string>();
    for (const owner of owners) {
      if (seen.has(owner.userId)) continue;
      seen.add(owner.userId);
      const user = await ctx.db
        .query("users")
        .withIndex("by_userId", (q) => q.eq("userId", owner.userId))
        .unique();
      if (!user || user.notificationsEnabled === false) continue;
      await detectAndInsert(ctx, user, now);
    }
    await ctx.scheduler.runAfter(0, internal.push.flushPending, {});
  },
});
