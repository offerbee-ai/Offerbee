import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getUserId, requireUserId } from "./auth";
import { requireAccess } from "./billing";

// The user's owned cards, each joined with its cached detail (detail may be null
// briefly while it is being fetched after an add).
export const listMyCards = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const cards = await ctx.db
      .query("userCards")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);

    return await Promise.all(
      cards.map(async (userCard) => {
        const detail = await ctx.db
          .query("cardDetails")
          .withIndex("by_cardKey", (q) => q.eq("cardKey", userCard.cardKey))
          .unique();
        const catalog = detail
          ? null
          : await ctx.db
              .query("cardCatalog")
              .withIndex("by_cardKey", (q) => q.eq("cardKey", userCard.cardKey))
              .unique();
        return { userCard, detail, catalog };
      }),
    );
  },
});

export const addCard = mutation({
  args: {
    cardKey: v.string(),
    nickname: v.optional(v.string()),
    openedDate: v.optional(v.number()),
    signupBonusStartDate: v.optional(v.number()),
  },
  handler: async (ctx, { cardKey, nickname, openedDate, signupBonusStartDate }) => {
    const userId = await requireAccess(ctx); // subscription/trial gate + auth

    const existing = await ctx.db
      .query("userCards")
      .withIndex("by_userId_and_cardKey", (q) =>
        q.eq("userId", userId).eq("cardKey", cardKey),
      )
      .unique();
    // Idempotent: re-adding a card already in the wallet is a no-op, not an
    // error (a thrown Error surfaces as an opaque "Server Error" on the client,
    // and its message is redacted in production).
    if (existing) return existing._id;

    const userCardId = await ctx.db.insert("userCards", {
      userId,
      cardKey,
      nickname,
      addedAt: Date.now(),
      openedDate,
      signupBonusStartDate,
    });

    // Restore any benefits archived when this card was previously removed —
    // re-adding recovers the user's tracked credits + full usage history.
    const archived = await ctx.db
      .query("userBenefits")
      .withIndex("by_userId_and_cardKey", (q) =>
        q.eq("userId", userId).eq("cardKey", cardKey),
      )
      .take(400);
    for (const b of archived) {
      if (b.archivedAt !== undefined)
        await ctx.db.patch(b._id, { userCardId, archivedAt: undefined });
    }

    // Lazily cache detail if we've never fetched it; otherwise evaluate offers now.
    const detail = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .unique();
    if (detail) {
      await ctx.scheduler.runAfter(0, internal.offers.rescanCard, { cardKey });
      // Auto-track this card's credits now that detail is on hand. When it's
      // not cached yet, saveCardDetail seeds once the lazy fetch below lands.
      await ctx.scheduler.runAfter(0, internal.benefits.seedCardBenefits, {
        userCardId,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.rapidapi.fetchCardDetail, {
        cardKey,
      });
    }

    return userCardId;
  },
});

export const removeCard = mutation({
  args: { userCardId: v.id("userCards") },
  handler: async (ctx, { userCardId }) => {
    const userId = await requireUserId(ctx);
    const userCard = await ctx.db.get(userCardId);
    if (!userCard) throw new Error(`Card '${userCardId}' could not be found`);
    if (userCard.userId !== userId)
      throw new Error(`User '${userId}' cannot remove card '${userCardId}'`);

    // Archive (don't delete) tracked benefits so an accidental removal loses no
    // usage history — re-adding the card restores them (see addCard). Usage rows
    // are left untouched.
    const now = Date.now();
    const benefits = await ctx.db
      .query("userBenefits")
      .withIndex("by_userCardId", (q) => q.eq("userCardId", userCardId))
      .take(400);
    for (const b of benefits) {
      if (b.archivedAt === undefined)
        await ctx.db.patch(b._id, { archivedAt: now });
    }

    await ctx.db.delete(userCardId);
  },
});

// The user-supplied dates that power the deadline detectors.
export const updateCardDates = mutation({
  args: {
    userCardId: v.id("userCards"),
    openedDate: v.optional(v.number()),
    signupBonusStartDate: v.optional(v.number()),
    signupBonusMet: v.optional(v.boolean()),
    nickname: v.optional(v.string()),
    notificationsEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, { userCardId, ...patch }) => {
    const userId = await requireUserId(ctx);
    const userCard = await ctx.db.get(userCardId);
    if (!userCard) throw new Error(`Card '${userCardId}' could not be found`);
    if (userCard.userId !== userId)
      throw new Error(`User '${userId}' cannot update card '${userCardId}'`);

    await ctx.db.patch(userCardId, patch);
    await ctx.scheduler.runAfter(0, internal.offers.rescanCard, {
      cardKey: userCard.cardKey,
    });
  },
});
