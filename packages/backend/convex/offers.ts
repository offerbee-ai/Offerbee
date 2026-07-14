import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const DAY_MS = 24 * 60 * 60 * 1000;
const SIGNUP_MILESTONES = [1, 7, 14, 30]; // ascending
const FEE_MILESTONES = [7, 30];
const ELEVATED_MULTIPLIER = 2;

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

function isFxCard(d: Doc<"cardDetails">): boolean {
  return Boolean(d.isFxFee && (d.fxFee ?? 0) > 0);
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

  // Perks / entitlements (educational, one-time except the annual hotel night).
  const year = new Date(now).getFullYear();
  if (d.isLoungeAccess)
    out.push({
      type: "perk_lounge",
      cardKey: d.cardKey,
      dedupKey: `perk:${d.cardKey}:lounge`,
      title: `${name} includes lounge access`,
      body: `Your ${name} includes airport lounge access — don't forget to use it.`,
      data: link,
    });
  if (d.isFreeCheckedBag)
    out.push({
      type: "perk_checked_bag",
      cardKey: d.cardKey,
      dedupKey: `perk:${d.cardKey}:checked_bag`,
      title: `${name} includes a free checked bag`,
      body: `Your ${name} gives you a free checked bag — use it on your next flight.`,
      data: link,
    });
  if (d.isFreeHotelNight)
    out.push({
      type: "perk_free_hotel_night",
      cardKey: d.cardKey,
      dedupKey: `perk:${d.cardKey}:free_hotel_night:${year}`,
      title: `Use your free hotel night`,
      body: `Don't forget your free hotel night on ${name} this year.`,
      data: link,
    });
  if (d.isTrustedTraveler)
    out.push({
      type: "perk_trusted_traveler",
      cardKey: d.cardKey,
      dedupKey: `perk:${d.cardKey}:trusted_traveler`,
      title: `${name} reimburses Global Entry / TSA PreCheck`,
      body: `Your ${name} reimburses Global Entry or TSA PreCheck — claim it if you haven't.`,
      data: link,
    });

  // FX fee warning.
  if (isFxCard(d))
    out.push({
      type: "fx_fee_warning",
      cardKey: d.cardKey,
      dedupKey: `fx_fee:${d.cardKey}`,
      title: `${name} charges foreign transaction fees`,
      body: `${name} charges ${d.fxFee}% on foreign purchases — avoid using it abroad.`,
      data: link,
    });

  // Elevated spend categories (static — do not claim calendar rotation).
  for (const cat of d.spendBonusCategory ?? []) {
    if (!cat.earnMultiplier || cat.earnMultiplier < ELEVATED_MULTIPLIER) continue;
    const catName =
      cat.spendBonusCategoryName ?? cat.spendBonusCategoryType ?? "a category";
    out.push({
      type: "spend_bonus_category",
      cardKey: d.cardKey,
      dedupKey: `spend_bonus:${d.cardKey}:${catName}`,
      title: `${name} earns ${cat.earnMultiplier}x on ${catName}`,
      body: `Use ${name} for ${catName} to earn ${cat.earnMultiplier}x.`,
      data: link,
    });
  }

  return out;
}

function detectCrossCard(items: Item[]): Candidate[] {
  const withDetail = items.filter(
    (i): i is { userCard: Doc<"userCards">; detail: Doc<"cardDetails"> } =>
      i.detail !== null && i.userCard.notificationsEnabled !== false,
  );
  const out: Candidate[] = [];

  // No-FX-fee alternative for travel.
  const fxCards = withDetail.filter((i) => isFxCard(i.detail));
  const noFxCards = withDetail.filter((i) => !isFxCard(i.detail));
  if (fxCards.length > 0 && noFxCards.length > 0) {
    const best = [...noFxCards].sort(
      (a, b) => (a.detail.annualFee ?? 0) - (b.detail.annualFee ?? 0),
    )[0];
    out.push({
      type: "no_fx_alternative",
      cardKey: best.detail.cardKey,
      dedupKey: `fx_alt:${best.detail.cardKey}`,
      title: `Use ${best.detail.cardName} abroad`,
      body: `For travel, use ${best.detail.cardName} (no foreign transaction fee) instead of ${fxCards[0].detail.cardName}.`,
      data: { route: "card", cardKey: best.detail.cardKey },
    });
  }

  // Best card per shared spend category.
  const byCategory = new Map<
    string,
    { display: string; cardKey: string; cardName: string; mult: number }[]
  >();
  for (const { detail } of withDetail) {
    for (const cat of detail.spendBonusCategory ?? []) {
      if (!cat.earnMultiplier) continue;
      const display =
        cat.spendBonusCategoryName ?? cat.spendBonusCategoryType ?? "";
      const norm = display.trim().toLowerCase();
      if (!norm) continue;
      const list = byCategory.get(norm) ?? [];
      list.push({
        display,
        cardKey: detail.cardKey,
        cardName: detail.cardName,
        mult: cat.earnMultiplier,
      });
      byCategory.set(norm, list);
    }
  }
  for (const [norm, list] of byCategory) {
    const distinctCards = new Set(list.map((l) => l.cardKey));
    if (distinctCards.size < 2) continue;
    const best = [...list].sort((a, b) => b.mult - a.mult)[0];
    out.push({
      type: "category_optimizer",
      cardKey: best.cardKey,
      dedupKey: `optimize:${norm}:${best.cardKey}`,
      title: `Best card for ${best.display}`,
      body: `Best card for ${best.display}: ${best.cardName} (${best.mult}x).`,
      data: { route: "card", cardKey: best.cardKey },
    });
  }

  return out;
}

function buildCandidates(
  user: Doc<"users">,
  items: Item[],
  now: number,
): Candidate[] {
  let candidates = [
    ...items.flatMap((i) => detectPerCard(i, now)),
    ...detectCrossCard(items),
  ];
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
