import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { missingEnvVariableUrl } from "./utils";
import { POPULAR_CARD_KEYS } from "./catalog";
import type { CardDetailContent } from "./validators";

// The Rewards Credit Card API. fetch() works in Convex's default runtime, so no
// "use node" directive is needed here.
const RAPIDAPI_HOST = "rewards-credit-card-api.p.rapidapi.com";
const BASE_URL = `https://${RAPIDAPI_HOST}`;
const RAPIDAPI_SIGNUP_URL =
  "https://rapidapi.com/rewardsccapi/api/rewards-credit-card-api";

const MAX_DETAILS_PER_RUN = 25;
const DETAIL_RUN_SPACING_MS = 60_000;
const SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // card lists change rarely

function headers(key: string) {
  return { "X-RapidAPI-Key": key, "X-RapidAPI-Host": RAPIDAPI_HOST };
}

// ── Coercion helpers (the API is loosely typed; be defensive) ───────────────────

function toNum(x: unknown): number | undefined {
  if (typeof x === "number") return Number.isFinite(x) ? x : undefined;
  if (typeof x === "string") {
    const n = parseFloat(x.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function toBool(x: unknown): boolean | undefined {
  if (typeof x === "boolean") return x;
  if (x === 1 || x === "1" || x === "true") return true;
  if (x === 0 || x === "0" || x === "false") return false;
  return undefined;
}

function toStr(x: unknown): string | undefined {
  if (typeof x === "string") return x.length ? x : undefined;
  if (x === null || x === undefined) return undefined;
  return String(x);
}

function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

// ── Catalog search (live name search) ───────────────────────────────────────────

// The API has no bulk card-list endpoint, so the add-card flow searches by name
// on demand. Results are cached into cardCatalog so listMyCards has a name
// fallback and detail refresh has a reference.
export const searchCards = action({
  args: { term: v.string() },
  handler: async (
    ctx,
    { term },
  ): Promise<{ cardKey: string; cardName: string; cardIssuer: string }[]> => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) return [];

    const t = term.trim();
    if (t.length < 2) return [];
    const norm = t.toLowerCase();

    // Cache hit: a term's cached results are the complete API answer for that
    // term, so we can serve them without touching the API.
    const cached = await ctx.runQuery(internal.catalogSync.getCachedSearch, {
      term: norm,
    });
    if (cached && Date.now() - cached.fetchedAt < SEARCH_CACHE_TTL_MS)
      return cached.results;

    const key = process.env.RAPIDAPI_KEY;
    if (!key) {
      console.error(missingEnvVariableUrl("RAPIDAPI_KEY", RAPIDAPI_SIGNUP_URL));
      return cached?.results ?? []; // serve stale rather than nothing
    }

    try {
      const res = await fetch(
        `${BASE_URL}/creditcard-detail-namesearch/${encodeURIComponent(t)}`,
        { headers: headers(key) },
      );
      if (!res.ok) return cached?.results ?? [];
      const body = await res.json();
      const rows = Array.isArray(body) ? body : [];
      const results = rows
        .map((r: any) => ({
          cardKey: toStr(r?.cardKey) ?? "",
          cardName: toStr(r?.cardName) ?? "",
          cardIssuer: toStr(r?.cardIssuer) ?? "Unknown",
        }))
        .filter((r) => r.cardKey);

      // Cache the term's answer (even empty, to avoid re-hitting the API for
      // no-match terms) and keep the catalog rows for the wallet name fallback.
      await ctx.runMutation(internal.catalogSync.saveSearchCache, {
        term: norm,
        results,
      });
      if (results.length > 0) {
        await ctx.runMutation(internal.catalogSync.upsertCatalogBatch, {
          cards: results.map((r) => ({ ...r, isActive: true })),
          runStartedAt: Date.now(),
        });
      }
      return results;
    } catch (e) {
      console.error("Card search failed", e);
      return cached?.results ?? []; // serve stale on transient API failure
    }
  },
});

// ── Card detail ───────────────────────────────────────────────────────────────

function mapDetail(raw: any, cardKey: string): CardDetailContent {
  // Only assign defined values — undefined is not a valid Convex value.
  const content: Record<string, unknown> = {
    cardKey,
    cardName: toStr(raw?.cardName) ?? cardKey,
    cardIssuer: toStr(raw?.cardIssuer) ?? "Unknown",
    isActive: toBool(raw?.isActive) ?? true,
  };
  const set = (k: string, val: unknown) => {
    if (val !== undefined) content[k] = val;
  };

  set("cardNetwork", toStr(raw?.cardNetwork));
  set("cardNetworkTierName", toStr(raw?.cardNetworkTierName));
  set("cardType", toStr(raw?.cardType));
  set("cardUrl", toStr(raw?.cardUrl));
  set("creditRange", toStr(raw?.creditRange));
  // fees
  set("annualFee", toNum(raw?.annualFee));
  set("fxFee", toNum(raw?.fxFee));
  set("isFxFee", toBool(raw?.isFxFee));
  // base rewards
  set("baseSpendAmount", toNum(raw?.baseSpendAmount));
  set("baseSpendEarnType", toStr(raw?.baseSpendEarnType));
  set("baseSpendEarnCategory", toStr(raw?.baseSpendEarnCategory));
  set("baseSpendEarnCurrency", toStr(raw?.baseSpendEarnCurrency));
  set("baseSpendEarnValuation", toNum(raw?.baseSpendEarnValuation));
  set("baseSpendEarnIsCash", toBool(raw?.baseSpendEarnIsCash));
  set("baseSpendEarnCashValue", toNum(raw?.baseSpendEarnCashValue));
  // signup bonus
  set("isSignupBonus", toBool(raw?.isSignupBonus));
  if (typeof raw?.signupBonusAmount === "number")
    set("signupBonusAmount", raw.signupBonusAmount);
  else set("signupBonusAmount", toStr(raw?.signupBonusAmount));
  set("signupBonusType", toStr(raw?.signupBonusType));
  set("signupBonusCategory", toStr(raw?.signupBonusCategory));
  set("signUpBonusItem", toStr(raw?.signUpBonusItem));
  set("signupBonusSpend", toNum(raw?.signupBonusSpend));
  set("signupBonusLength", toNum(raw?.signupBonusLength));
  set("signupBonusLengthPeriod", toStr(raw?.signupBonusLengthPeriod));
  set("signupAnnualFee", toNum(raw?.signupAnnualFee));
  set("isSignupAnnualFeeWaived", toBool(raw?.isSignupAnnualFeeWaived));
  set("signupStatementCredit", toNum(raw?.signupStatementCredit));
  set("signupBonusDesc", toStr(raw?.signupBonusDesc));
  // travel perks
  set("trustedTraveler", toStr(raw?.trustedTraveler));
  set("isTrustedTraveler", toBool(raw?.isTrustedTraveler));
  set("loungeAccess", toStr(raw?.loungeAccess));
  set("isLoungeAccess", toBool(raw?.isLoungeAccess));
  set("freeHotelNight", toStr(raw?.freeHotelNight));
  set("isFreeHotelNight", toBool(raw?.isFreeHotelNight));
  set("freeCheckedBag", toStr(raw?.freeCheckedBag));
  set("isFreeCheckedBag", toBool(raw?.isFreeCheckedBag));
  // bounded arrays
  if (Array.isArray(raw?.benefit)) {
    content.benefit = raw.benefit.map((b: any) => {
      const o: Record<string, unknown> = {
        benefitTitle: toStr(b?.benefitTitle) ?? "",
      };
      const d = toStr(b?.benefitDesc);
      if (d !== undefined) o.benefitDesc = d;
      const t = toBool(b?.isBenefitCardNetworkTier);
      if (t !== undefined) o.isBenefitCardNetworkTier = t;
      return o;
    });
  }
  if (Array.isArray(raw?.spendBonusCategory)) {
    content.spendBonusCategory = raw.spendBonusCategory.map((s: any) => {
      const o: Record<string, unknown> = {};
      const assign = (k: string, val: unknown) => {
        if (val !== undefined) o[k] = val;
      };
      assign("spendBonusCategoryType", toStr(s?.spendBonusCategoryType));
      assign("spendBonusCategoryName", toStr(s?.spendBonusCategoryName));
      assign("spendBonusCategoryId", toNum(s?.spendBonusCategoryId));
      assign("spendBonusCategoryGroup", toStr(s?.spendBonusCategoryGroup));
      assign("spendBonusSubcategoryGroup", toStr(s?.spendBonusSubcategoryGroup));
      assign("spendBonusDesc", toStr(s?.spendBonusDesc));
      assign("earnMultiplier", toNum(s?.earnMultiplier));
      assign("isDateLimit", toBool(s?.isDateLimit));
      assign("limitBeginDate", toStr(s?.limitBeginDate));
      assign("limitEndDate", toStr(s?.limitEndDate));
      assign("isSpendLimit", toBool(s?.isSpendLimit));
      assign("spendLimit", toNum(s?.spendLimit));
      assign("spendLimitResetPeriod", toStr(s?.spendLimitResetPeriod));
      return o;
    });
  }
  if (Array.isArray(raw?.annualSpend)) {
    content.annualSpend = raw.annualSpend.map((a: any) => {
      const o: Record<string, unknown> = {};
      const val = toNum(a?.annualSpend);
      if (val !== undefined) o.annualSpend = val;
      const desc = toStr(a?.annualSpendDesc);
      if (desc !== undefined) o.annualSpendDesc = desc;
      return o;
    });
  }

  return content as unknown as CardDetailContent;
}

// Best-effort card-image lookup. The image host's path rotates periodically, so
// the URL is re-fetched alongside each detail refresh; failures never block the
// detail save.
async function fetchImageUrl(
  key: string,
  cardKey: string,
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${BASE_URL}/creditcard-card-image/${encodeURIComponent(cardKey)}`,
      { headers: headers(key) },
    );
    if (!res.ok) return undefined;
    const body = await res.json();
    const raw = Array.isArray(body) ? body[0] : body;
    return toStr(raw?.cardImageUrl);
  } catch (e) {
    console.error(`Image fetch failed for '${cardKey}'`, e);
    return undefined;
  }
}

async function fetchDetail(
  key: string,
  cardKey: string,
): Promise<{ content: CardDetailContent; hash: string } | null> {
  const res = await fetch(
    `${BASE_URL}/creditcard-detail-bycard/${encodeURIComponent(cardKey)}`,
    { headers: headers(key) },
  );
  if (!res.ok) throw new Error(`detail ${cardKey} HTTP ${res.status}`);
  const body = await res.json();
  const raw = Array.isArray(body) ? body[0] : body;
  if (!raw) return null;
  const content = mapDetail(raw, cardKey);
  // Include the image URL before hashing so a rotated path counts as a change
  // and gets persisted by the hash-gated saveCardDetail.
  const imageUrl = await fetchImageUrl(key, cardKey);
  if (imageUrl) content.cardImageUrl = imageUrl;
  return { content, hash: djb2(JSON.stringify(content)) };
}

// Refresh cached details that have gone stale, capped and spaced across runs.
export const refreshStaleDetails = internalAction({
  args: { processed: v.optional(v.number()) },
  handler: async (ctx, { processed }) => {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) {
      console.error(missingEnvVariableUrl("RAPIDAPI_KEY", RAPIDAPI_SIGNUP_URL));
      return;
    }

    const stale = await ctx.runQuery(
      internal.catalogSync.getStaleDetailCards,
      { limit: MAX_DETAILS_PER_RUN },
    );
    if (stale.length === 0) return;

    for (const { cardKey } of stale) {
      try {
        const detail = await fetchDetail(key, cardKey);
        if (detail) {
          await ctx.runMutation(internal.catalogSync.saveCardDetail, {
            cardKey,
            content: detail.content,
            hash: detail.hash,
          });
        }
      } catch (e) {
        console.error(`Detail refresh failed for '${cardKey}'`, e);
      }
    }

    if (stale.length === MAX_DETAILS_PER_RUN) {
      await ctx.scheduler.runAfter(
        DETAIL_RUN_SPACING_MS,
        internal.rapidapi.refreshStaleDetails,
        { processed: (processed ?? 0) + stale.length },
      );
    }
  },
});

// Pre-warm the curated "popular cards" details (image + fee) one at a time,
// self-scheduling with a delay so the BASIC-plan per-second rate limit isn't
// tripped. Kick off with `convex run rapidapi:warmPopularCards {}` after a
// deploy (dev and prod). Idempotent (hash-gated saves).
const WARM_SPACING_MS = 2500;
export const warmPopularCards = internalAction({
  args: { index: v.optional(v.number()) },
  handler: async (ctx, { index }) => {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) {
      console.error(missingEnvVariableUrl("RAPIDAPI_KEY", RAPIDAPI_SIGNUP_URL));
      return;
    }
    const i = index ?? 0;
    if (i >= POPULAR_CARD_KEYS.length) return;
    const cardKey = POPULAR_CARD_KEYS[i];
    try {
      const detail = await fetchDetail(key, cardKey);
      if (detail) {
        await ctx.runMutation(internal.catalogSync.saveCardDetail, {
          cardKey,
          content: detail.content,
          hash: detail.hash,
        });
      }
    } catch (e) {
      console.error(`Warm failed for '${cardKey}'`, e);
    }
    if (i + 1 < POPULAR_CARD_KEYS.length) {
      await ctx.scheduler.runAfter(
        WARM_SPACING_MS,
        internal.rapidapi.warmPopularCards,
        { index: i + 1 },
      );
    }
  },
});

// Reusable catalog prefill: walk cardCatalog and fetch any missing/stale
// cardDetails (image + fee), one card per tick. Spaces only when it actually
// hits the API (fresh cards zip by), so it respects the BASIC per-second limit
// and re-runs are cheap. Idempotent. Kick off with
//   convex run rapidapi:prefillCatalog {} [--deployment X]
// (or use scripts/prefill-card-details.sh). See also warmPopularCards for just
// the curated set.
const PREFILL_FETCH_SPACING_MS = 2500; // between real API fetches
const PREFILL_SKIP_SPACING_MS = 100; // between already-fresh cards
export const prefillCatalog = internalAction({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    fetched: v.optional(v.number()),
  },
  handler: async (ctx, { cursor, fetched }) => {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) {
      console.error(missingEnvVariableUrl("RAPIDAPI_KEY", RAPIDAPI_SIGNUP_URL));
      return;
    }
    const page = await ctx.runQuery(internal.catalogSync.getCatalogPageForWarm, {
      cursor: cursor ?? null,
      limit: 1,
    });

    let total = fetched ?? 0;
    let didFetch = false;
    for (const item of page.items) {
      if (!item.needsFetch) continue;
      didFetch = true;
      try {
        const detail = await fetchDetail(key, item.cardKey);
        if (detail) {
          await ctx.runMutation(internal.catalogSync.saveCardDetail, {
            cardKey: item.cardKey,
            content: detail.content,
            hash: detail.hash,
          });
          total += 1;
        }
      } catch (e) {
        console.error(`Prefill failed for '${item.cardKey}'`, e);
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        didFetch ? PREFILL_FETCH_SPACING_MS : PREFILL_SKIP_SPACING_MS,
        internal.rapidapi.prefillCatalog,
        { cursor: page.continueCursor, fetched: total },
      );
    } else {
      console.log(`prefillCatalog complete — fetched ${total} card details`);
    }
  },
});

// Lazy single fetch triggered when a user adds a not-yet-cached card.
export const fetchCardDetail = internalAction({
  args: { cardKey: v.string() },
  handler: async (ctx, { cardKey }) => {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) {
      console.error(missingEnvVariableUrl("RAPIDAPI_KEY", RAPIDAPI_SIGNUP_URL));
      return;
    }
    try {
      const detail = await fetchDetail(key, cardKey);
      if (detail) {
        await ctx.runMutation(internal.catalogSync.saveCardDetail, {
          cardKey,
          content: detail.content,
          hash: detail.hash,
        });
      }
    } catch (e) {
      console.error(`Detail fetch failed for '${cardKey}'`, e);
    }
  },
});
