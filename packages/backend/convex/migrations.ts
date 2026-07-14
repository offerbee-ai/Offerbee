import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// One-time backfill: populate users.notificationCategories from legacy reminderPrefs,
// preserving existing opt-outs. Idempotent (skips rows already backfilled).
export const backfillNotificationCategories = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("users").paginate({ numItems: 100, cursor });
    let updated = 0;
    for (const u of page.page) {
      if (u.notificationCategories) continue; // already backfilled
      const r = u.reminderPrefs;
      await ctx.db.patch(u._id, {
        notificationCategories: {
          expiry: r?.expiry ?? true,
          digest: r?.digest ?? true,
          renewal: r?.renewal ?? true,
          transactions: r?.smart ?? true,
        },
      });
      updated += 1;
    }
    console.log(`backfillNotificationCategories: page done, updated ${updated}`);
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillNotificationCategories, {
        cursor: page.continueCursor,
      });
    }
  },
});
