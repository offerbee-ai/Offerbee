import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getUserId, requireUserId } from "./auth";
import {
  capturedThisYear,
  periodEnd,
  periodKey,
  periodsForYear,
} from "./benefitCycles";
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

// Usage summed per period for the calendar year containing `now`, keyed by
// periodKey. Every current-year key (annual `2026`, `2026-Q3`, `2026-H2`,
// `2026-07`) sorts within [`${y}`, `${y+1}`), so one range over the compound
// index covers them all. Powers the per-period grid.
async function yearPeriodUsage(
  ctx: QueryCtx,
  userBenefitId: Id<"userBenefits">,
  now: number,
): Promise<Map<string, number>> {
  const y = new Date(now).getUTCFullYear();
  const rows = await ctx.db
    .query("benefitUsages")
    .withIndex("by_userBenefitId_and_periodKey", (q) =>
      q
        .eq("userBenefitId", userBenefitId)
        .gte("periodKey", `${y}`)
        .lt("periodKey", `${y + 1}`),
    )
    .take(200);
  const sums = new Map<string, number>();
  for (const r of rows) sums.set(r.periodKey, (sums.get(r.periodKey) ?? 0) + r.amount);
  for (const [k, val] of sums) sums.set(k, roundCents(val));
  return sums;
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
      {
        userCardId: Id<"userCards">;
        cardKey: string;
        name: string;
        issuer: string;
        fee: number;
        imageUrl: string | null;
      }
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
          imageUrl: detail?.cardImageUrl ?? null,
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
      const usedAmount = await currentPeriodUsage(ctx, b._id, pk);

      // One year-of-usage read powers both the per-period grid and the
      // year-to-date captured total (below), for every cycle.
      const sums = await yearPeriodUsage(ctx, b._id, now);

      // Year-to-date captured: usage summed across ALL of this year's periods
      // (each capped at the per-period amount), not just the current one — so a
      // credit used in an elapsed period (last month, H1, an earlier quarter)
      // still counts toward the card's annual-fee ROI. The client derives every
      // captured/net/verdict aggregate from this.
      const capturedYtd = capturedThisYear(b.cycle, now, b.amount, usedAmount, sums);

      // Per-period grid cells for non-monthly credits (annual → 1 cell = a
      // checkbox; quarterly → 4; semiannual → 2). Monthly stays ungridded.
      let periods:
        | {
            key: string;
            label: string;
            usedAmount: number;
            used: boolean;
            status: "elapsed" | "current" | "upcoming";
          }[]
        | undefined;
      if (b.cycle !== "monthly") {
        periods = periodsForYear(b.cycle, now).map((p) => {
          // Current cell reuses the authoritative currentPeriodUsage so the grid
          // and the top-level usedAmount/aggregates can never disagree.
          const cellUsed = p.status === "current" ? usedAmount : (sums.get(p.key) ?? 0);
          return {
            key: p.key,
            label: p.label,
            usedAmount: cellUsed,
            used: cellUsed >= b.amount,
            status: p.status,
          };
        });
      }

      credits.push({
        id: b._id,
        title: b.title,
        cardKey: b.cardKey,
        cardName: meta.name,
        cardImageUrl: meta.imageUrl,
        amount: b.amount,
        cycle: b.cycle,
        source: b.source,
        usedAmount,
        capturedYtd,
        periodKey: pk,
        resetAt: periodEnd(b.cycle, now),
        snoozedUntil: b.snoozedUntil ?? null,
        periods,
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

// ── Auto-seed ────────────────────────────────────────────────────────────────
// Default-track model: adding a card auto-tracks every credit the parser detects
// from that card's benefits, so the wallet is populated without an opt-in step.
// The user untracks anything they don't get. Seeding is once-only per userCard
// (benefitsSeededAt) so an untracked credit is never resurrected on a later
// detail refresh. Requires the card's detail to be cached; when it isn't yet,
// saveCardDetail re-drives seeding for the card's owners once it arrives.

// Seed one owned card's credits from its cached detail. No-op if already seeded
// or the detail hasn't been fetched yet (left unstamped so a later save retries).
async function seedForUserCard(
  ctx: MutationCtx,
  userCard: Doc<"userCards">,
): Promise<void> {
  if (userCard.benefitsSeededAt !== undefined) return;

  const detail = await ctx.db
    .query("cardDetails")
    .withIndex("by_cardKey", (q) => q.eq("cardKey", userCard.cardKey))
    .unique();
  if (!detail) return; // not fetched yet — saveCardDetail will seed on arrival

  const now = Date.now();

  // Existing rows for this (user, card) — tracked OR archived — so a re-added
  // card (whose archived benefits addCard restores) isn't duplicated.
  const existing = await ctx.db
    .query("userBenefits")
    .withIndex("by_userId_and_cardKey", (q) =>
      q.eq("userId", userCard.userId).eq("cardKey", userCard.cardKey),
    )
    .take(MAX_BENEFITS_PER_USER + 1);
  const seenTitles = new Set(
    existing.map((b) => b.benefitTitle).filter((t): t is string => Boolean(t)),
  );

  // Global per-user budget across all cards (archived rows don't count).
  const allActive = (
    await ctx.db
      .query("userBenefits")
      .withIndex("by_userId", (q) => q.eq("userId", userCard.userId))
      .take(MAX_BENEFITS_PER_USER + 1)
  ).filter((b) => b.archivedAt === undefined);
  let budget = MAX_BENEFITS_PER_USER - allActive.length;

  for (const s of suggestCredits(detail.benefit ?? [])) {
    if (budget <= 0) break;
    if (seenTitles.has(s.benefitTitle)) continue;
    seenTitles.add(s.benefitTitle);
    await ctx.db.insert("userBenefits", {
      userId: userCard.userId,
      userCardId: userCard._id,
      cardKey: userCard.cardKey,
      title: s.title,
      amount: roundCents(s.amount),
      cycle: s.cycle,
      source: "suggested",
      benefitTitle: s.benefitTitle,
      createdAt: now,
    });
    budget -= 1;
  }

  // Stamp once detail exists (even if it yielded no credits) so we never rescan.
  await ctx.db.patch(userCard._id, { benefitsSeededAt: now });
}

// Seed a single owned card — scheduled by addCard / completeOnboarding.
export const seedCardBenefits = internalMutation({
  args: { userCardId: v.id("userCards") },
  handler: async (ctx, { userCardId }) => {
    const userCard = await ctx.db.get(userCardId);
    if (!userCard) return; // removed before the scheduler ran
    await seedForUserCard(ctx, userCard);
  },
});

// Seed every owner of a card whose credits haven't been seeded yet — scheduled
// by saveCardDetail so lazily-fetched adds (and existing wallets predating this
// feature) populate the moment the card's detail lands.
export const seedOwnersForCard = internalMutation({
  args: { cardKey: v.string() },
  handler: async (ctx, { cardKey }) => {
    const owners = await ctx.db
      .query("userCards")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .take(500);
    for (const uc of owners) {
      if (uc.benefitsSeededAt === undefined) await seedForUserCard(ctx, uc);
    }
  },
});

// One-shot backfill for wallets that predate auto-seeding. Run once per
// deployment: `convex run benefits:seedAllUnseeded '{}'`.
export const seedAllUnseeded = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cards = await ctx.db.query("userCards").take(2000);
    let seeded = 0;
    for (const uc of cards) {
      if (uc.benefitsSeededAt !== undefined) continue;
      const before = uc.benefitsSeededAt;
      await seedForUserCard(ctx, uc);
      const after = await ctx.db.get(uc._id);
      if (before === undefined && after?.benefitsSeededAt !== undefined) seeded += 1;
    }
    return { scanned: cards.length, seeded };
  },
});
