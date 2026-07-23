// Location-based offers: given the user's current coordinates, find tracked
// benefits they still have unclaimed value on this period AND that map to a
// physical brand with a store near them. This is the server half of the
// location-notifications design (foreground MVP): location in → usable benefits
// at nearby brands out.
//
// Flow: the action authenticates, reads usable benefits via an internal query,
// reduces them to ranked brand queries (nearbyMatch), asks the external geo
// service for store locations (geoService), then rejoins locations to the
// benefits that make them worth visiting.

import { action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUserId } from "./auth";
import { periodKey, periodEnd } from "./benefitCycles";
import { planBrandQueries, type UsableBenefit } from "./nearbyMatch";
import { fetchNearbyPlacesByBrand, type NearbyPlace } from "./geoService";

const MAX_BENEFITS_SCAN = 500;
// The geo service clamps to its own MaxSearchRadius (16 km); bound the caller
// here too so an arbitrarily large radius can't force a global per-brand scan.
const MAX_RADIUS_METERS = 16_000;
const roundCents = (n: number) => Math.round(n * 100) / 100;

// Internal: the user's non-archived, non-snoozed benefits that still have
// unclaimed dollars in the current period, with the card name for display.
// Trusts its userId arg — only reachable from server code (the action below).
export const usableBenefits = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }): Promise<UsableBenefit[]> => {
    const now = Date.now();

    const userCards = await ctx.db
      .query("userCards")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(200);
    // Resolve card names in parallel — sequential awaits here are an N+1 that a
    // power user could push into the query's wall-clock deadline.
    const cardName = new Map<Id<"userCards">, string>(
      await Promise.all(
        userCards.map(async (uc) => {
          const detail = await ctx.db
            .query("cardDetails")
            .withIndex("by_cardKey", (q) => q.eq("cardKey", uc.cardKey))
            .unique();
          return [
            uc._id,
            uc.nickname ?? detail?.cardName ?? uc.cardKey,
          ] as const;
        }),
      ),
    );

    const benefits = (
      await ctx.db
        .query("userBenefits")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(MAX_BENEFITS_SCAN)
    ).filter(
      (b) =>
        b.archivedAt === undefined &&
        !(b.snoozedUntil !== undefined && b.snoozedUntil > now),
    );

    // Per-benefit usage lookups in parallel, for the same reason.
    const usable = await Promise.all(
      benefits.map(async (b): Promise<UsableBenefit | null> => {
        const pk = periodKey(b.cycle, now);
        const rows = await ctx.db
          .query("benefitUsages")
          .withIndex("by_userBenefitId_and_periodKey", (q) =>
            q.eq("userBenefitId", b._id).eq("periodKey", pk),
          )
          .take(50);
        const used = rows.reduce((a, r) => a + r.amount, 0);
        const remaining = roundCents(b.amount - used);
        if (remaining <= 0) return null;
        return {
          id: b._id,
          cardKey: b.cardKey,
          benefitTitle: b.benefitTitle,
          title: b.title,
          cardName: cardName.get(b.userCardId) ?? b.cardKey,
          remaining,
          cycle: b.cycle,
          resetAt: periodEnd(b.cycle, now),
        };
      }),
    );
    return usable.filter((u): u is UsableBenefit => u !== null);
  },
});

// Public action: nearby usable benefits for the authenticated user at a point.
// `localTime` (RFC3339 with the caller's UTC offset) lets the geo service drop
// places closed today; omit to use server time.
export const nearbyBenefits = action({
  args: {
    lat: v.number(),
    lng: v.number(),
    radiusMeters: v.optional(v.number()),
    localTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    if (
      !Number.isFinite(args.lat) ||
      !Number.isFinite(args.lng) ||
      Math.abs(args.lat) > 90 ||
      Math.abs(args.lng) > 180
    ) {
      throw new Error("lat/lng out of range");
    }

    // Clamp the radius: drop invalid/non-positive values to the client default,
    // cap the rest so a caller can't request a global scan per brand.
    let radiusMeters = args.radiusMeters;
    if (radiusMeters !== undefined) {
      radiusMeters =
        !Number.isFinite(radiusMeters) || radiusMeters <= 0
          ? undefined
          : Math.min(radiusMeters, MAX_RADIUS_METERS);
    }

    const benefits = await ctx.runQuery(internal.nearby.usableBenefits, {
      userId,
    });
    const plans = planBrandQueries(benefits);
    if (plans.length === 0) return { brands: [] as NearbyBrandResult[] };

    const geo = await fetchNearbyPlacesByBrand({
      brands: plans.map((p) => p.query),
      lat: args.lat,
      lng: args.lng,
      radiusMeters,
      localTime: args.localTime,
    });
    const placesByQuery = new Map(geo.map((g) => [g.query, g.places]));

    // Rejoin locations to the benefits that justify them; drop brands with no
    // open store nearby. Plans are already ranked by unclaimed value.
    const brands: NearbyBrandResult[] = [];
    for (const plan of plans) {
      const places = placesByQuery.get(plan.query) ?? [];
      if (places.length === 0) continue;
      brands.push({
        brandKey: plan.brandKey,
        query: plan.query,
        value: roundCents(plan.value),
        places,
        benefits: plan.benefits.map((b) => ({
          id: b.id,
          title: b.title,
          cardName: b.cardName,
          remaining: b.remaining,
          cycle: b.cycle,
          resetAt: b.resetAt,
        })),
      });
    }
    return { brands };
  },
});

type NearbyBrandResult = {
  brandKey: string;
  query: string;
  value: number;
  places: NearbyPlace[];
  benefits: {
    id: string;
    title: string;
    cardName: string;
    remaining: number;
    cycle: string;
    resetAt: number;
  }[];
};
