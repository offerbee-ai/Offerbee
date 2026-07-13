import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireUserId } from "./auth";
import { reminderPrefsValidator } from "./validators";
import {
  ONBOARDING_CARDS_BY_ID,
  ONBOARDING_CATEGORY_KEYS,
} from "./onboardingCatalog";

// The web wizard persists its progress here (debounced on every change) so a
// user who leaves mid-flow resumes exactly where they stopped — on any device.

const clampStep = (step: number) => Math.min(4, Math.max(1, Math.round(step)));

const validCardIds = (ids: string[]) =>
  [...new Set(ids)].filter((id) => ONBOARDING_CARDS_BY_ID.has(id));

const validCategories = (keys: string[]) =>
  [...new Set(keys)].filter((k) => ONBOARDING_CATEGORY_KEYS.has(k));

export const updateOnboarding = mutation({
  args: {
    step: v.optional(v.number()),
    cards: v.optional(v.array(v.string())),
    categories: v.optional(v.array(v.string())),
    reminders: v.optional(reminderPrefsValidator),
  },
  handler: async (ctx, { step, cards, categories, reminders }) => {
    const userId = await requireUserId(ctx);

    const patch: Record<string, unknown> = {};
    if (step !== undefined) patch.onboardingStep = clampStep(step);
    if (cards !== undefined) patch.onboardingCards = validCardIds(cards);
    if (categories !== undefined)
      patch.spendingCategories = validCategories(categories);
    if (reminders !== undefined) patch.reminderPrefs = reminders;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      // Never resurrect the wizard for someone who already finished it.
      if (existing.onboardingCompletedAt) return existing._id;
      if (Object.keys(patch).length > 0) await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      userId,
      notificationsEnabled: true,
      ...patch,
    });
  },
});

// Atomic finish: commit the selected curated cards to the real wallet, save
// categories + reminder prefs, and stamp completion so the wizard never shows
// again. Card ids are validated against the curated catalog server-side —
// clients never supply card names, so they can't poison the shared cardCatalog.
export const completeOnboarding = mutation({
  args: {
    cards: v.array(v.string()),
    categories: v.array(v.string()),
    reminders: reminderPrefsValidator,
  },
  handler: async (ctx, { cards, categories, reminders }) => {
    const userId = await requireUserId(ctx);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    // Idempotent: a double submit (or replayed request) is a no-op.
    if (existing?.onboardingCompletedAt) return existing._id;

    const now = Date.now();
    const selected = validCardIds(cards).map(
      (id) => ONBOARDING_CARDS_BY_ID.get(id)!,
    );

    for (const card of selected) {
      // Seed the catalog name so the wallet renders properly even if the
      // external detail fetch never resolves. Insert-only — never patch.
      const catalogRow = await ctx.db
        .query("cardCatalog")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", card.cardKey))
        .unique();
      if (!catalogRow) {
        await ctx.db.insert("cardCatalog", {
          cardKey: card.cardKey,
          cardName: card.name,
          cardIssuer: card.issuer,
          isActive: true,
          lastSyncedAt: now,
        });
      }

      // Same add semantics as wallet.addCard: idempotent insert, then either
      // rescan offers (detail cached) or fetch the detail lazily.
      const owned = await ctx.db
        .query("userCards")
        .withIndex("by_userId_and_cardKey", (q) =>
          q.eq("userId", userId).eq("cardKey", card.cardKey),
        )
        .unique();
      if (owned) continue;

      const userCardId = await ctx.db.insert("userCards", {
        userId,
        cardKey: card.cardKey,
        addedAt: now,
      });

      const detail = await ctx.db
        .query("cardDetails")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", card.cardKey))
        .unique();
      if (detail) {
        await ctx.scheduler.runAfter(0, internal.offers.rescanCard, {
          cardKey: card.cardKey,
        });
        // Auto-track the card's credits (see wallet.addCard); when detail isn't
        // cached yet, saveCardDetail seeds after the lazy fetch resolves.
        await ctx.scheduler.runAfter(0, internal.benefits.seedCardBenefits, {
          userCardId,
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.rapidapi.fetchCardDetail, {
          cardKey: card.cardKey,
        });
      }
    }

    const patch = {
      onboardingStep: 4,
      onboardingCompletedAt: now,
      onboardingCards: selected.map((c) => c.id),
      spendingCategories: validCategories(categories),
      reminderPrefs: reminders,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("users", {
      userId,
      notificationsEnabled: true,
      ...patch,
    });
  },
});
