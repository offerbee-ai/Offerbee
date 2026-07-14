import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getUserId } from "./auth";

const ELEVATED_MULTIPLIER = 2;

type Item = { userCard: Doc<"userCards">; detail: Doc<"cardDetails"> | null };
type TipCandidate = {
  type: string;
  cardKey?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

function isFxCard(d: Doc<"cardDetails">): boolean {
  return Boolean(d.isFxFee && (d.fxFee ?? 0) > 0);
}

// Educational, read-only candidates derived from a single card (perks,
// entitlements, FX-fee awareness, elevated spend categories). Unlike
// offers.ts's financial detectors these are never persisted as notifications —
// they're recomputed on every `listTips` call.
function detectPerCard(item: Item): TipCandidate[] {
  const { userCard: uc, detail: d } = item;
  if (!d) return [];
  if (uc.notificationsEnabled === false) return [];
  const out: TipCandidate[] = [];
  const name = d.cardName;
  const link = { route: "card", cardKey: d.cardKey };

  if (d.isLoungeAccess)
    out.push({
      type: "perk_lounge",
      cardKey: d.cardKey,
      title: `${name} includes lounge access`,
      body: `Your ${name} includes airport lounge access — don't forget to use it.`,
      data: link,
    });
  if (d.isFreeCheckedBag)
    out.push({
      type: "perk_checked_bag",
      cardKey: d.cardKey,
      title: `${name} includes a free checked bag`,
      body: `Your ${name} gives you a free checked bag — use it on your next flight.`,
      data: link,
    });
  if (d.isFreeHotelNight)
    out.push({
      type: "perk_free_hotel_night",
      cardKey: d.cardKey,
      title: `Use your free hotel night`,
      body: `Don't forget your free hotel night on ${name} this year.`,
      data: link,
    });
  if (d.isTrustedTraveler)
    out.push({
      type: "perk_trusted_traveler",
      cardKey: d.cardKey,
      title: `${name} reimburses Global Entry / TSA PreCheck`,
      body: `Your ${name} reimburses Global Entry or TSA PreCheck — claim it if you haven't.`,
      data: link,
    });

  // FX fee warning.
  if (isFxCard(d))
    out.push({
      type: "fx_fee_warning",
      cardKey: d.cardKey,
      title: `${name} charges foreign transaction fees`,
      body: `${name} charges ${d.fxFee}% on foreign purchases — avoid using it abroad.`,
      data: link,
    });

  // Elevated spend categories (static — do not claim calendar rotation).
  for (const cat of d.spendBonusCategory ?? []) {
    if (!cat.earnMultiplier || cat.earnMultiplier < ELEVATED_MULTIPLIER) continue;
    const catName =
      cat.spendBonusCategoryName ?? cat.spendBonusCategoryType ?? "a category";
    out.push({
      type: "spend_bonus_category",
      cardKey: d.cardKey,
      title: `${name} earns ${cat.earnMultiplier}x on ${catName}`,
      body: `Use ${name} for ${catName} to earn ${cat.earnMultiplier}x.`,
      data: link,
    });
  }

  return out;
}

// Educational candidates that require comparing across the user's whole
// wallet (best card for travel, best card per shared spend category).
function detectCrossCard(items: Item[]): TipCandidate[] {
  const withDetail = items.filter(
    (i): i is { userCard: Doc<"userCards">; detail: Doc<"cardDetails"> } =>
      i.detail !== null && i.userCard.notificationsEnabled !== false,
  );
  const out: TipCandidate[] = [];

  // No-FX-fee alternative for travel.
  const fxCards = withDetail.filter((i) => isFxCard(i.detail));
  const noFxCards = withDetail.filter((i) => !isFxCard(i.detail));
  if (fxCards.length > 0 && noFxCards.length > 0) {
    const best = [...noFxCards].sort(
      (a, b) => (a.detail.annualFee ?? 0) - (b.detail.annualFee ?? 0),
    )[0];
    out.push({
      type: "no_fx_alternative",
      cardKey: best.detail.cardKey,
      title: `Use ${best.detail.cardName} abroad`,
      body: `For travel, use ${best.detail.cardName} (no foreign transaction fee) instead of ${fxCards[0].detail.cardName}.`,
      data: { route: "card", cardKey: best.detail.cardKey },
    });
  }

  // Best card per shared spend category.
  const byCategory = new Map<
    string,
    { display: string; cardKey: string; cardName: string; mult: number }[]
  >();
  for (const { detail } of withDetail) {
    for (const cat of detail.spendBonusCategory ?? []) {
      if (!cat.earnMultiplier) continue;
      const display =
        cat.spendBonusCategoryName ?? cat.spendBonusCategoryType ?? "";
      const norm = display.trim().toLowerCase();
      if (!norm) continue;
      const list = byCategory.get(norm) ?? [];
      list.push({
        display,
        cardKey: detail.cardKey,
        cardName: detail.cardName,
        mult: cat.earnMultiplier,
      });
      byCategory.set(norm, list);
    }
  }
  for (const [, list] of byCategory) {
    const distinctCards = new Set(list.map((l) => l.cardKey));
    if (distinctCards.size < 2) continue;
    const best = [...list].sort((a, b) => b.mult - a.mult)[0];
    out.push({
      type: "category_optimizer",
      cardKey: best.cardKey,
      title: `Best card for ${best.display}`,
      body: `Best card for ${best.display}: ${best.cardName} (${best.mult}x).`,
      data: { route: "card", cardKey: best.cardKey },
    });
  }

  return out;
}

async function loadItems(ctx: QueryCtx, userId: string): Promise<Item[]> {
  const cards = await ctx.db
    .query("userCards")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(200);
  return await Promise.all(
    cards.map(async (userCard) => {
      const detail = await ctx.db
        .query("cardDetails")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", userCard.cardKey))
        .unique();
      return { userCard, detail };
    }),
  );
}

// Read-only, derived "Tips" feed (web-only for now). Unlike offers.ts's
// financial detectors, these are educational and are recomputed fresh on
// every call — no dedup, no writes, no `notifications` rows, no cron.
export const listTips = query({
  args: {},
  handler: async (ctx): Promise<TipCandidate[]> => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const items = await loadItems(ctx, userId);
    return [...items.flatMap((i) => detectPerCard(i)), ...detectCrossCard(items)];
  },
});
