import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireUserId } from "./auth";
import {
  dataSourceValidator,
  fieldProvenanceValidator,
  fieldValueValidator,
  reviewObservationValidator,
  reviewReasonValidator,
} from "./validators";

// ── Internal writes used by the verification pipeline (verify.ts) ────────────

// Record where a cross-checked field's value came from, without changing the
// value itself. Upserts the entry for that field in cardDetails.fieldProvenance.
export const recordProvenance = internalMutation({
  args: {
    cardKey: v.string(),
    entry: fieldProvenanceValidator,
  },
  handler: async (ctx, { cardKey, entry }) => {
    const detail = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
      .unique();
    if (!detail) return;
    const others = (detail.fieldProvenance ?? []).filter(
      (p) => p.field !== entry.field,
    );
    await ctx.db.patch(detail._id, { fieldProvenance: [...others, entry] });
  },
});

// Queue a proposed correction for human confirmation. Idempotent per
// (cardKey, field): a still-pending item for the same field is replaced.
export const enqueueReview = internalMutation({
  args: {
    cardKey: v.string(),
    field: v.string(),
    currentValue: v.optional(fieldValueValidator),
    proposedValue: v.optional(fieldValueValidator),
    reason: reviewReasonValidator,
    observations: v.array(reviewObservationValidator),
    confidence: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    note: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cardDataReview")
      .withIndex("by_cardKey_and_field", (q) =>
        q.eq("cardKey", args.cardKey).eq("field", args.field),
      )
      .collect();
    for (const row of existing) {
      if (row.status === "pending") await ctx.db.delete(row._id);
    }
    await ctx.db.insert("cardDataReview", { ...args, status: "pending" });
  },
});

// ── Human review surface (web app) ───────────────────────────────────────────

// Pending proposals, newest first, joined with the card's display name.
export const listPendingReviews = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const pending = await ctx.db
      .query("cardDataReview")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(200);
    return await Promise.all(
      pending.map(async (row) => {
        const detail = await ctx.db
          .query("cardDetails")
          .withIndex("by_cardKey", (q) => q.eq("cardKey", row.cardKey))
          .unique();
        return {
          ...row,
          cardName: detail?.cardName ?? row.cardKey,
          cardIssuer: detail?.cardIssuer ?? null,
        };
      }),
    );
  },
});

export const pendingReviewCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) return 0;
    const pending = await ctx.db
      .query("cardDataReview")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(201);
    return pending.length;
  },
});

// Accept a proposal: write the value to cardDetails, stamp manual provenance,
// close the review, and re-scan offers for the card since fees/bonuses changed.
export const confirmReview = mutation({
  args: { reviewId: v.id("cardDataReview") },
  handler: async (ctx, { reviewId }) => {
    const userId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review) throw new Error(`Review '${reviewId}' not found`);
    if (review.status !== "pending")
      throw new Error(`Review '${reviewId}' is already ${review.status}`);

    const detail = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", review.cardKey))
      .unique();
    if (detail) {
      const others = (detail.fieldProvenance ?? []).filter(
        (p) => p.field !== review.field,
      );
      const provenance = {
        field: review.field,
        value: review.proposedValue,
        source: "manual" as const,
        confidence: 1,
        sourceUrl: review.sourceUrl,
        verifiedAt: Date.now(),
      };
      // Dynamic field write — validated against the review's field name.
      await ctx.db.patch(detail._id, {
        [review.field]: review.proposedValue,
        fieldProvenance: [...others, provenance],
      } as Record<string, unknown>);
      await ctx.scheduler.runAfter(0, internal.offers.rescanCard, {
        cardKey: review.cardKey,
      });
    }

    await ctx.db.patch(reviewId, {
      status: "confirmed",
      reviewedAt: Date.now(),
      reviewedBy: userId,
    });
  },
});

// Reject a proposal: keep the current value, stamp its source as human-confirmed
// so the periodic sweep won't immediately re-flag it.
export const rejectReview = mutation({
  args: { reviewId: v.id("cardDataReview") },
  handler: async (ctx, { reviewId }) => {
    const userId = await requireUserId(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review) throw new Error(`Review '${reviewId}' not found`);
    if (review.status !== "pending")
      throw new Error(`Review '${reviewId}' is already ${review.status}`);

    const detail = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", review.cardKey))
      .unique();
    if (detail) {
      const others = (detail.fieldProvenance ?? []).filter(
        (p) => p.field !== review.field,
      );
      await ctx.db.patch(detail._id, {
        fieldProvenance: [
          ...others,
          {
            field: review.field,
            value: review.currentValue,
            source: "manual" as const,
            confidence: 1,
            verifiedAt: Date.now(),
          },
        ],
      });
    }

    await ctx.db.patch(reviewId, {
      status: "rejected",
      reviewedAt: Date.now(),
      reviewedBy: userId,
    });
  },
});
