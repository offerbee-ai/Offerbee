import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { getUserId, requireUserId } from "./auth";
import { periodEnd, periodKey } from "./benefitCycles";
import { suggestCredits } from "./benefitParser";
import { benefitSourceValidator, cycleValidator } from "./validators";

const MAX_BENEFITS_PER_USER = 300;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const roundCents = (n: number) => Math.round(n * 100) / 100;

function assertValidAmount(n: number) {
  if (!Number.isFinite(n) || n <= 0 || n > 100_000)
    throw new Error("Amount must be a positive dollar value under 100,000");
}

// Load a userBenefit and confirm the caller owns it (throws otherwise).
async function requireOwnedBenefit(
  ctx: QueryCtx,
  userId: string,
  userBenefitId: Id<"userBenefits">,
) {
  const benefit = await ctx.db.get(userBenefitId);
  if (!benefit) throw new Error(`Benefit '${userBenefitId}' could not be found`);
  if (benefit.userId !== userId)
    throw new Error(`User '${userId}' cannot modify '${userBenefitId}'`);
  return benefit;
}

async function currentPeriodUsage(
  ctx: QueryCtx,
  userBenefitId: Id<"userBenefits">,
  pk: string,
): Promise<number> {
  const rows = await ctx.db
    .query("benefitUsages")
    .withIndex("by_userBenefitId_and_periodKey", (q) =>
      q.eq("userBenefitId", userBenefitId).eq("periodKey", pk),
    )
    .take(50);
  return roundCents(rows.reduce((a, r) => a + r.amount, 0));
}

// ── Queries ─────────────────────────────────────────────────────────────────

// Parsed credit suggestions for one owned card, each flagged if already tracked.
export const suggestionsForCard = query({
  args: { cardKey: v.string() },
  handler: async (ctx, { cardKey }) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const owned = await ctx.db
      .query("userCards")
      .withIndex("by_userId_and_cardKey", (q) =>
        q.eq("userId", userId).eq("cardKey", cardKey),
      )
      .unique();
    if (!owned) return [];

    const detail = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .unique();

    const tracked = (
      await ctx.db
        .query("userBenefits")
        .withIndex("by_userId_and_cardKey", (q) =>
          q.eq("userId", userId).eq("cardKey", cardKey),
        )
        .take(100)
    ).filter((b) => b.archivedAt === undefined);
    const trackedTitles = new Set(
      tracked.map((b) => b.benefitTitle).filter(Boolean),
    );

    return suggestCredits(detail?.benefit ?? []).map((s) => ({
      ...s,
      alreadyTracked: trackedTitles.has(s.benefitTitle),
    }));
  },
});

// All tracked credits (with current-period usage + reset instant) plus the
// user's cards (for fee/verdict derivation). One snapshot so derive() is
// consistent. Returns resetAt (ms); the client computes the day countdown.
export const listMyCredits = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return { credits: [], cards: [] };
    const now = Date.now();

    const userCards = await ctx.db
      .query("userCards")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(200);

    const cardMeta = new Map<
      string,
      { userCardId: Id<"userCards">; cardKey: string; name: string; issuer: string; fee: number }
    >();
    const cards = await Promise.all(
      userCards.map(async (uc) => {
        const detail = await ctx.db
          .query("cardDetails")
          .withIndex("by_cardKey", (q) => q.eq("cardKey", uc.cardKey))
          .unique();
        const catalog = detail
          ? null
          : await ctx.db
              .query("cardCatalog")
              .withIndex("by_cardKey", (q) => q.eq("cardKey", uc.cardKey))
              .unique();
        const meta = {
          userCardId: uc._id,
          cardKey: uc.cardKey,
          name:
            uc.nickname ?? detail?.cardName ?? catalog?.cardName ?? uc.cardKey,
          issuer: detail?.cardIssuer ?? catalog?.cardIssuer ?? "",
          fee: detail?.annualFee ?? 0,
        };
        cardMeta.set(uc._id, meta);
        return meta;
      }),
    );

    const benefits = (
      await ctx.db
        .query("userBenefits")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(MAX_BENEFITS_PER_USER)
    ).filter((b) => b.archivedAt === undefined);

    const credits = [];
    for (const b of benefits) {
      const meta = cardMeta.get(b.userCardId);
      if (!meta) continue; // orphan guard (card removed mid-flight)
      const pk = periodKey(b.cycle, now);
      credits.push({
        id: b._id,
        title: b.title,
        cardKey: b.cardKey,
        cardName: meta.name,
        amount: b.amount,
        cycle: b.cycle,
        source: b.source,
        usedAmount: await currentPeriodUsage(ctx, b._id, pk),
        periodKey: pk,
        resetAt: periodEnd(b.cycle, now),
        snoozedUntil: b.snoozedUntil ?? null,
      });
    }

    return { credits, cards };
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

export const trackBenefit = mutation({
  args: {
    userCardId: v.id("userCards"),
    title: v.string(),
    amount: v.number(),
    cycle: cycleValidator,
    source: benefitSourceValidator,
    benefitTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const card = await ctx.db.get(args.userCardId);
    if (!card) throw new Error(`Card '${args.userCardId}' could not be found`);
    if (card.userId !== userId)
      throw new Error(`User '${userId}' cannot modify '${args.userCardId}'`);

    const title = args.title.trim();
    if (!title) throw new Error("Benefit title is required");
    assertValidAmount(args.amount);

    const existing = (
      await ctx.db
        .query("userBenefits")
        .withIndex("by_userId_and_cardKey", (q) =>
          q.eq("userId", userId).eq("cardKey", card.cardKey),
        )
        .take(MAX_BENEFITS_PER_USER + 1)
    ).filter((b) => b.archivedAt === undefined);

    // Idempotent re-track: same original benefit already tracked → return it.
    if (args.benefitTitle) {
      const dup = existing.find((b) => b.benefitTitle === args.benefitTitle);
      if (dup) return dup._id;
    }

    const total = await ctx.db
      .query("userBenefits")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_BENEFITS_PER_USER + 1);
    if (total.filter((b) => b.archivedAt === undefined).length >= MAX_BENEFITS_PER_USER)
      throw new Error("You've reached the maximum number of tracked benefits");

    return await ctx.db.insert("userBenefits", {
      userId,
      userCardId: args.userCardId,
      cardKey: card.cardKey,
      title,
      amount: roundCents(args.amount),
      cycle: args.cycle,
      source: args.source,
      benefitTitle: args.benefitTitle,
      createdAt: Date.now(),
    });
  },
});

export const updateBenefit = mutation({
  args: {
    userBenefitId: v.id("userBenefits"),
    title: v.optional(v.string()),
    amount: v.optional(v.number()),
    cycle: v.optional(cycleValidator),
  },
  handler: async (ctx, { userBenefitId, title, amount, cycle }) => {
    const userId = await requireUserId(ctx);
    await requireOwnedBenefit(ctx, userId, userBenefitId);

    const patch: Partial<{ title: string; amount: number; cycle: typeof cycle }> = {};
    if (title !== undefined) {
      const t = title.trim();
      if (!t) throw new Error("Benefit title is required");
      patch.title = t;
    }
    if (amount !== undefined) {
      assertValidAmount(amount);
      patch.amount = roundCents(amount);
    }
    // Cycle change: old usage rows keep their old-format periodKeys, so they
    // stop counting toward the new cycle's current period — history preserved,
    // current period restarts clean. No migration.
    if (cycle !== undefined) patch.cycle = cycle;

    await ctx.db.patch(userBenefitId, patch);
  },
});

export const untrackBenefit = mutation({
  args: { userBenefitId: v.id("userBenefits") },
  handler: async (ctx, { userBenefitId }) => {
    const userId = await requireUserId(ctx);
    await requireOwnedBenefit(ctx, userId, userBenefitId);

    // Hard delete (explicit per-benefit intent) — the only path that removes
    // usage history.
    let batch = await ctx.db
      .query("benefitUsages")
      .withIndex("by_userBenefitId_and_periodKey", (q) =>
        q.eq("userBenefitId", userBenefitId),
      )
      .take(200);
    while (batch.length > 0) {
      for (const u of batch) await ctx.db.delete(u._id);
      if (batch.length < 200) break;
      batch = await ctx.db
        .query("benefitUsages")
        .withIndex("by_userBenefitId_and_periodKey", (q) =>
          q.eq("userBenefitId", userBenefitId),
        )
        .take(200);
    }
    await ctx.db.delete(userBenefitId);
  },
});

export const logUsage = mutation({
  args: {
    userBenefitId: v.id("userBenefits"),
    amount: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { userBenefitId, amount, note }) => {
    const userId = await requireUserId(ctx);
    const benefit = await requireOwnedBenefit(ctx, userId, userBenefitId);
    assertValidAmount(amount);

    const now = Date.now();
    const pk = periodKey(benefit.cycle, now); // server-computed; client never supplies periods
    await ctx.db.insert("benefitUsages", {
      userId,
      userBenefitId,
      cardKey: benefit.cardKey,
      periodKey: pk,
      amount: roundCents(amount),
      usedAt: now,
      note,
    });
    return { periodKey: pk, usedAmount: await currentPeriodUsage(ctx, userBenefitId, pk) };
  },
});

// "Toggle used off": clear the current period's usage rows (never past periods).
export const clearCurrentPeriod = mutation({
  args: { userBenefitId: v.id("userBenefits") },
  handler: async (ctx, { userBenefitId }) => {
    const userId = await requireUserId(ctx);
    const benefit = await requireOwnedBenefit(ctx, userId, userBenefitId);
    const pk = periodKey(benefit.cycle, Date.now());

    let batch = await ctx.db
      .query("benefitUsages")
      .withIndex("by_userBenefitId_and_periodKey", (q) =>
        q.eq("userBenefitId", userBenefitId).eq("periodKey", pk),
      )
      .take(100);
    while (batch.length > 0) {
      for (const u of batch) await ctx.db.delete(u._id);
      if (batch.length < 100) break;
      batch = await ctx.db
        .query("benefitUsages")
        .withIndex("by_userBenefitId_and_periodKey", (q) =>
          q.eq("userBenefitId", userBenefitId).eq("periodKey", pk),
        )
        .take(100);
    }
  },
});

export const snoozeBenefit = mutation({
  args: { userBenefitId: v.id("userBenefits"), until: v.optional(v.number()) },
  handler: async (ctx, { userBenefitId, until }) => {
    const userId = await requireUserId(ctx);
    const benefit = await requireOwnedBenefit(ctx, userId, userBenefitId);
    const now = Date.now();
    const resetAt = periodEnd(benefit.cycle, now);
    // Never snooze past the reset — the credit reappears fresh next period.
    const snoozedUntil = Math.min(until ?? now + SEVEN_DAYS_MS, resetAt);
    await ctx.db.patch(userBenefitId, { snoozedUntil });
  },
});
