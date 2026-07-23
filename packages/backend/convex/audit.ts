// Admin read surface + rollback for the freshness pipeline's audit trail.
// cardDataAudit records every gated change (auto/shadow/suppressed/suspect);
// this module makes it visible (History view), measurable (shadow precision —
// the go/no-go signal for enabling AUTO_APPLY_ENABLED), and reversible
// (revertAudit undoes an auto-applied or reverted change).

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { isAdmin, requireAdmin } from "./auth";
import { applyItemDelta } from "./arrayDelta";
import { invertAuditDelta } from "./auditRevert";
import {
  ARRAY_FIELD_NAME_KEYS,
  namedToCategory,
  namedToBenefit,
} from "./cardFieldMap";
import type { NamedItem } from "./cardDataDiff";

const ARRAY_FIELDS = new Set(Object.keys(ARRAY_FIELD_NAME_KEYS));

// Named-shape → stored-shape converters (audit rows carry the diff's named
// shape; cardDetails stores the catalog shape).
const TO_STORED: Record<string, (n: NamedItem) => Record<string, unknown>> = {
  spendBonusCategory: namedToCategory,
  benefit: namedToBenefit,
};

// ── Reads (admin-gated like review.ts: empty results, hard-gated writes) ─────

// Paginated audit history, newest first, optionally filtered to one card.
export const listAudit = query({
  args: {
    cardKey: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { cardKey, paginationOpts }) => {
    if (!(await isAdmin(ctx)))
      return { page: [], isDone: true, continueCursor: "" };
    const page = cardKey
      ? await ctx.db
          .query("cardDataAudit")
          .withIndex("by_cardKey", (q) => q.eq("cardKey", cardKey))
          .order("desc")
          .paginate(paginationOpts)
      : await ctx.db
          .query("cardDataAudit")
          .withIndex("by_appliedAt")
          .order("desc")
          .paginate(paginationOpts);
    const named = await Promise.all(
      page.page.map(async (row) => {
        const detail = await ctx.db
          .query("cardDetails")
          .withIndex("by_cardKey", (q) => q.eq("cardKey", row.cardKey))
          .unique();
        return { ...row, cardName: detail?.cardName ?? row.cardKey };
      }),
    );
    return { ...page, page: named };
  },
});

// Recent pipeline runs (cron chains + manual wallet verifies), newest first.
export const listRecentRuns = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isAdmin(ctx))) return [];
    return await ctx.db
      .query("pipelineRuns")
      .withIndex("by_pipeline_and_startedAt", (q) => q.eq("pipeline", "freshness"))
      .order("desc")
      .take(30);
  },
});

// Shadow-mode precision: of the reviews the gate WOULD have auto-applied
// (wouldAutoApply:true), how many did a human reviewer confirm vs reject?
// precision = confirmed / (confirmed + rejected) — the go/no-go measurement
// for enabling AUTO_APPLY_ENABLED. Bounded reads; counts saturate at the cap.
export const shadowPrecision = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isAdmin(ctx))) return null;
    const CAP = 500;
    // capped must reflect the RAW rows fetched hitting the read bound — the
    // filtered wouldAutoApply counts are typically far below it even when the
    // window is saturated and older verdicts fell outside it.
    const countByStatus = async (
      status: "confirmed" | "rejected" | "stale" | "pending",
    ) => {
      const rows = await ctx.db
        .query("cardDataReview")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(CAP);
      return {
        count: rows.filter((r) => r.wouldAutoApply === true).length,
        sawCap: rows.length === CAP,
      };
    };
    const confirmed = await countByStatus("confirmed");
    const rejected = await countByStatus("rejected");
    const stale = await countByStatus("stale");
    // Pending gate-passing rows: verdict not in yet.
    const pending = await countByStatus("pending");
    const judged = confirmed.count + rejected.count;
    return {
      confirmed: confirmed.count,
      rejected: rejected.count,
      stale: stale.count,
      pending: pending.count,
      precision: judged > 0 ? confirmed.count / judged : null,
      capped:
        confirmed.sawCap || rejected.sawCap || stale.sawCap || pending.sawCap,
    };
  },
});

// ── Rollback ─────────────────────────────────────────────────────────────────

// Undo an auto-applied (or previously reverted) audit row: scalars restore
// `before`, array items apply the inverse delta. The revert is stamped with
// manual provenance (so the RapidAPI guard and the pipeline's pin precedence
// protect it) and audited as its own mode:"revert" row.
export const revertAudit = mutation({
  args: { auditId: v.id("cardDataAudit") },
  handler: async (ctx, { auditId }) => {
    await requireAdmin(ctx);
    const audit = await ctx.db.get(auditId);
    if (!audit) throw new Error(`Audit row '${auditId}' not found`);
    if (audit.mode !== "auto" && audit.mode !== "revert")
      throw new Error(
        `Only applied changes can be reverted (this row is '${audit.mode}')`,
      );

    const plan = invertAuditDelta(audit as Doc<"cardDataAudit">, ARRAY_FIELDS);
    if (!plan)
      throw new Error("This audit row lacks the data needed to revert it");

    const detail = await ctx.db
      .query("cardDetails")
      .withIndex("by_cardKey", (q) => q.eq("cardKey", audit.cardKey))
      .unique();
    if (!detail) throw new Error(`Card '${audit.cardKey}' no longer exists`);

    let newValue: unknown;
    if (plan.kind === "scalar") {
      newValue = plan.value;
    } else {
      const nameKeys = ARRAY_FIELD_NAME_KEYS[plan.field];
      const toStored = TO_STORED[plan.field];
      newValue = applyItemDelta(
        [...(((detail as any)[plan.field] as any[]) ?? [])],
        {
          changeType: plan.changeType,
          itemName: plan.itemName,
          item: plan.item ? toStored(plan.item as NamedItem) : undefined,
        },
        nameKeys,
      );
    }

    const others = (detail.fieldProvenance ?? []).filter(
      (p) => p.field !== audit.field,
    );
    await ctx.db.patch(detail._id, {
      [audit.field]: newValue,
      fieldProvenance: [
        ...others,
        {
          field: audit.field,
          value: newValue as any,
          source: "manual" as const,
          confidence: 1,
          verifiedAt: Date.now(),
        },
      ],
    } as Record<string, unknown>);

    // Record the op the revert actually performed: for array items that is the
    // INVERTED delta (reverting an "add" removes), so History labels it right
    // and a revert-of-revert inverts cleanly instead of failing on a mislabeled
    // row. Scalars keep their changeType (always "patch").
    await ctx.db.insert("cardDataAudit", {
      cardKey: audit.cardKey,
      field: audit.field,
      changeType: plan.kind === "item" ? plan.changeType : audit.changeType,
      before: audit.after,
      after: audit.before,
      mode: "revert",
      appliedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.offers.rescanCard, {
      cardKey: audit.cardKey,
    });
    if (audit.field === "benefit") {
      await ctx.scheduler.runAfter(0, internal.benefits.seedOwnersForCard, {
        cardKey: audit.cardKey,
      });
    }
    return { reverted: true };
  },
});
