import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { isAdmin, requireAdmin } from "./auth";
import { applyItemDelta } from "./arrayDelta";

// Array fields whose reviews carry a single item delta (changeType + itemName)
// rather than a scalar value. Name keys mirror the stored item shapes.
const ARRAY_FIELD_NAME_KEYS: Record<string, string[]> = {
  spendBonusCategory: ["spendBonusCategoryName", "spendBonusCategoryType"],
  benefit: ["benefitTitle"],
};
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

    // Recording provenance means this field is now resolved (sources agree, or
    // web confirmed the current value) — retire any stale pending review for it
    // so a later verification can't be contradicted by an old queued proposal.
    const stale = await ctx.db
      .query("cardDataReview")
      .withIndex("by_cardKey_and_field", (q) =>
        q.eq("cardKey", cardKey).eq("field", entry.field),
      )
      .collect();
    for (const row of stale) {
      if (row.status === "pending") await ctx.db.delete(row._id);
    }
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

// Maintenance: clear pending review proposals (e.g. after changing the proposal
// shape). Internal — run via `convex run review:clearPendingReviews`.
export const clearPendingReviews = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("cardDataReview")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return rows.length;
  },
});

// ── Human review surface (web app) ───────────────────────────────────────────

// Pending proposals, newest first, joined with the card's display name.
// Whether the caller may use the admin review/verification surface.
export const amIAdmin = query({
  args: {},
  handler: async (ctx) => isAdmin(ctx),
});

export const listPendingReviews = query({
  args: {},
  handler: async (ctx) => {
    // Non-admins get an empty list (no leak, no render crash); writes below are
    // hard-gated with requireAdmin.
    if (!(await isAdmin(ctx))) return [];
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
    if (!(await isAdmin(ctx))) return 0;
    const pending = await ctx.db
      .query("cardDataReview")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(201);
    return pending.length;
  },
});

// Apply one pending review to cardDetails and close it. Shared by single-confirm
// and bulk auto-confirm. Assumes the row is still pending.
async function applyConfirmedReview(
  ctx: MutationCtx,
  review: Doc<"cardDataReview">,
  userId: string,
) {
  const detail = await ctx.db
    .query("cardDetails")
    .withIndex("by_cardKey", (q) => q.eq("cardKey", review.cardKey))
    .unique();
  if (detail) {
    const nameKeys = ARRAY_FIELD_NAME_KEYS[review.field];
    const isItemDelta =
      !!nameKeys && !!review.changeType && review.itemName !== undefined;

    // For an array item delta, apply just that delta to the live array;
    // otherwise write the scalar value verbatim.
    const newValue = isItemDelta
      ? applyItemDelta(
          [...(((detail as any)[review.field] as any[]) ?? [])],
          {
            changeType: review.changeType!,
            itemName: review.itemName!,
            item: review.proposedValue as Record<string, unknown> | undefined,
          },
          nameKeys!,
        )
      : review.proposedValue;

    const others = (detail.fieldProvenance ?? []).filter(
      (p) => p.field !== review.field,
    );
    const provenance = {
      field: review.field,
      value: newValue as any,
      source: "manual" as const,
      confidence: 1,
      sourceUrl: review.sourceUrl,
      verifiedAt: Date.now(),
    };
    // Dynamic field write — validated against the review's field name.
    await ctx.db.patch(detail._id, {
      [review.field]: newValue,
      fieldProvenance: [...others, provenance],
    } as Record<string, unknown>);
    await ctx.scheduler.runAfter(0, internal.offers.rescanCard, {
      cardKey: review.cardKey,
    });
    // Benefit changes drive credit seeding — keep owners in sync.
    if (review.field === "benefit") {
      await ctx.scheduler.runAfter(0, internal.benefits.seedOwnersForCard, {
        cardKey: review.cardKey,
      });
    }
  }

  await ctx.db.patch(review._id, {
    status: "confirmed",
    reviewedAt: Date.now(),
    reviewedBy: userId,
  });
}

// Accept a proposal: write the value to cardDetails, stamp manual provenance,
// close the review, and re-scan offers for the card since fees/bonuses changed.
export const confirmReview = mutation({
  args: { reviewId: v.id("cardDataReview") },
  handler: async (ctx, { reviewId }) => {
    const userId = await requireAdmin(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review) throw new Error(`Review '${reviewId}' not found`);
    if (review.status !== "pending")
      throw new Error(`Review '${reviewId}' is already ${review.status}`);
    await applyConfirmedReview(ctx, review, userId);
  },
});

// Bulk auto-confirm every pending proposal at or above a confidence threshold
// (default 0.9). Removals carry no confidence, so they are never bulk-confirmed
// and stay for manual review. Returns how many were applied.
export const confirmHighConfidence = mutation({
  args: { minConfidence: v.optional(v.number()) },
  handler: async (ctx, { minConfidence }) => {
    const userId = await requireAdmin(ctx);
    const threshold = minConfidence ?? 0.9;
    // Bounded scan so one mutation stays within Convex's read/time limits; a very
    // large queue just takes another click. Ordered oldest-first for stable
    // progress across calls.
    const SCAN_CAP = 400;
    const pending = await ctx.db
      .query("cardDataReview")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(SCAN_CAP);
    let applied = 0;
    for (const review of pending) {
      if ((review.confidence ?? 0) >= threshold) {
        await applyConfirmedReview(ctx, review, userId);
        applied++;
      }
    }
    return { applied, threshold, scanned: pending.length, more: pending.length === SCAN_CAP };
  },
});

// Reject a proposal: keep the current value, stamp its source as human-confirmed
// so the periodic sweep won't immediately re-flag it.
export const rejectReview = mutation({
  args: { reviewId: v.id("cardDataReview") },
  handler: async (ctx, { reviewId }) => {
    const userId = await requireAdmin(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review) throw new Error(`Review '${reviewId}' not found`);
    if (review.status !== "pending")
      throw new Error(`Review '${reviewId}' is already ${review.status}`);

    const detail = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", review.cardKey))
      .unique();
    // Only stamp field-level provenance for scalar rejects (pins the current
    // value so the sweep won't re-flag it). An array item delta carries a single
    // item, not the whole field, so pinning the field to it would be wrong —
    // just close the review.
    const isItemDelta =
      !!ARRAY_FIELD_NAME_KEYS[review.field] &&
      !!review.changeType &&
      review.itemName !== undefined;
    if (detail && !isItemDelta) {
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
