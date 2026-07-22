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
import { reviewIsStale } from "./reviewSuppress";
import { isIssuerAuthoritativeUrl } from "./cardSourceSelect";
import { issuerAllowlist } from "./freshnessConfig";

// Array fields whose reviews carry a single item delta (changeType + itemName)
// rather than a scalar value. Name keys mirror the stored item shapes. Also
// used by audit.ts to invert audited item changes for revert.
export const ARRAY_FIELD_NAME_KEYS: Record<string, string[]> = {
  spendBonusCategory: ["spendBonusCategoryName", "spendBonusCategoryType"],
  benefit: ["benefitTitle"],
};

// ── Internal maintenance ─────────────────────────────────────────────────────

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
// and bulk auto-confirm. Assumes the row is still pending. If the live data
// changed after the proposal was enqueued (concurrent RapidAPI refresh,
// auto-apply, or another admin), the row is closed as "stale" instead of
// applied — confirming it verbatim would clobber the newer value.
async function applyConfirmedReview(
  ctx: MutationCtx,
  review: Doc<"cardDataReview">,
  userId: string,
): Promise<{ applied: boolean; stale: boolean }> {
  const detail = await ctx.db
    .query("cardDetails")
    .withIndex("by_cardKey", (q) => q.eq("cardKey", review.cardKey))
    .unique();
  if (detail) {
    const nameKeys = ARRAY_FIELD_NAME_KEYS[review.field];
    const isItemDelta =
      !!nameKeys && !!review.changeType && review.itemName !== undefined;

    if (
      reviewIsStale(
        (detail as any)[review.field],
        review,
        isItemDelta ? nameKeys : undefined,
      )
    ) {
      await ctx.db.patch(review._id, {
        status: "stale",
        reviewedAt: Date.now(),
        reviewedBy: userId,
      });
      return { applied: false, stale: true };
    }

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
  return { applied: true, stale: false };
}

// Accept a proposal: write the value to cardDetails, stamp manual provenance,
// close the review, and re-scan offers for the card since fees/bonuses changed.
// Returns { applied, stale } — stale means the live data changed since the
// proposal and the row was closed without applying.
export const confirmReview = mutation({
  args: { reviewId: v.id("cardDataReview") },
  handler: async (ctx, { reviewId }) => {
    const userId = await requireAdmin(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review) throw new Error(`Review '${reviewId}' not found`);
    if (review.status !== "pending")
      throw new Error(`Review '${reviewId}' is already ${review.status}`);
    return await applyConfirmedReview(ctx, review, userId);
  },
});

// Bulk auto-confirm every pending proposal at or above a confidence threshold
// (default 0.9) whose citation is an issuer-authoritative domain — a confident
// extraction citing a blog/affiliate stays for manual review, as do removals
// (they carry no confidence). Rows whose live data changed since the proposal
// are closed as stale, not applied. Returns how many were applied.
export const confirmHighConfidence = mutation({
  args: { minConfidence: v.optional(v.number()) },
  handler: async (ctx, { minConfidence }) => {
    const userId = await requireAdmin(ctx);
    const threshold = minConfidence ?? 0.9;
    const allowlist = issuerAllowlist(process.env.ISSUER_DOMAIN_ALLOWLIST);
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
    let stale = 0;
    for (const review of pending) {
      if ((review.confidence ?? 0) < threshold) continue;
      const detail = await ctx.db
        .query("cardDetails")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", review.cardKey))
        .unique();
      if (
        !detail ||
        !review.sourceUrl ||
        !isIssuerAuthoritativeUrl(review.sourceUrl, detail.cardIssuer, allowlist)
      )
        continue;
      const res = await applyConfirmedReview(ctx, review, userId);
      if (res.applied) applied++;
      else if (res.stale) stale++;
    }
    return {
      applied,
      stale,
      threshold,
      scanned: pending.length,
      more: pending.length === SCAN_CAP,
    };
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
