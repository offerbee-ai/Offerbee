import { type Infer, v } from "convex/values";

// Shared validators reused across the schema and function argument lists so the
// data contract is defined exactly once.

export const platformValidator = v.union(
  v.literal("ios"),
  v.literal("android"),
  v.literal("web"),
);

// The four onboarding reminder toggles (step 4 of the wizard).
export const reminderPrefsValidator = v.object({
  expiry: v.boolean(),
  digest: v.boolean(),
  renewal: v.boolean(),
  smart: v.boolean(),
});

export const deliveryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("skipped"),
);

// ── Benefit-usage tracking ──────────────────────────────────────────────────
// The reset cadence of a tracked credit. Calendar periods (UTC v1).
export const cycleValidator = v.union(
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("semiannual"),
  v.literal("annual"),
);
export type BenefitCycle = Infer<typeof cycleValidator>;

// How a tracked credit was created: parsed-and-confirmed vs hand-entered.
export const benefitSourceValidator = v.union(
  v.literal("suggested"),
  v.literal("manual"),
);

// ── Data-verification pipeline ──────────────────────────────────────────────
// Where a given field's value came from, in ascending order of trust.
export const dataSourceValidator = v.union(
  v.literal("rapidapi"), // the Rewards CC API (rapidapi.ts)
  v.literal("github"), // andenacitelli/credit-card-bonuses-api
  v.literal("web"), // LLM web verification against the issuer's page
  v.literal("manual"), // a human edit / confirmed review
);

// A scalar field value we cross-check and verify. Kept to the primitive shapes
// the tracked fields actually use (fees are numbers, bonus amounts number|string).
export const fieldValueValidator = v.union(v.number(), v.string(), v.boolean());

// Per-field provenance stored on a cardDetails row.
export const fieldProvenanceValidator = v.object({
  field: v.string(), // cardDetails key, e.g. "annualFee"
  value: v.optional(fieldValueValidator),
  source: dataSourceValidator,
  confidence: v.optional(v.number()), // 0-1; higher = more trusted
  sourceUrl: v.optional(v.string()),
  verifiedAt: v.number(),
});

export const reviewStatusValidator = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("rejected"),
);

// Why a field landed in the review queue.
export const reviewReasonValidator = v.union(
  v.literal("web-correction"), // web search found a value different from the API
  // Legacy reasons (kept so pre-existing review rows still validate):
  v.literal("source-mismatch"),
  v.literal("single-source"),
  v.literal("stale-recheck"),
);

// What each source reported for the field under review.
export const reviewObservationValidator = v.object({
  source: dataSourceValidator,
  value: v.optional(fieldValueValidator),
  sourceUrl: v.optional(v.string()),
});

// Bounded arrays nested inside a single card's detail document. A card has only a
// handful of each and they do not grow over time, so nesting is safe.
export const benefitValidator = v.object({
  benefitTitle: v.string(),
  benefitDesc: v.optional(v.string()),
  isBenefitCardNetworkTier: v.optional(v.boolean()),
});

// Full shape of a spendBonusCategory entry as the API actually returns it
// (field names verified against a live /creditcard-detail-bycard response).
export const spendBonusCategoryValidator = v.object({
  spendBonusCategoryType: v.optional(v.string()),
  spendBonusCategoryName: v.optional(v.string()),
  spendBonusCategoryId: v.optional(v.number()),
  spendBonusCategoryGroup: v.optional(v.string()),
  spendBonusSubcategoryGroup: v.optional(v.string()),
  spendBonusDesc: v.optional(v.string()),
  earnMultiplier: v.optional(v.number()),
  isDateLimit: v.optional(v.boolean()),
  limitBeginDate: v.optional(v.string()),
  limitEndDate: v.optional(v.string()),
  isSpendLimit: v.optional(v.boolean()),
  spendLimit: v.optional(v.number()),
  spendLimitResetPeriod: v.optional(v.string()),
});

export const annualSpendValidator = v.object({
  annualSpend: v.optional(v.number()),
  annualSpendDesc: v.optional(v.string()),
});

// The mapped, normalized content of one card's detail from the Rewards CC API.
// Excludes the bookkeeping fields (detailFetchedAt / detailHash) that the
// persistence layer sets itself.
export const cardDetailContentFields = {
  cardKey: v.string(),
  cardName: v.string(),
  cardIssuer: v.string(),
  cardNetwork: v.optional(v.string()),
  cardNetworkTierName: v.optional(v.string()), // e.g. "Visa Infinite®"
  cardType: v.optional(v.string()),
  cardUrl: v.optional(v.string()),
  cardImageUrl: v.optional(v.string()), // from /creditcard-card-image; host path rotates, refreshed with detail TTL
  creditRange: v.optional(v.string()), // e.g. "Good to Excellent"
  isActive: v.boolean(),
  // fees
  annualFee: v.optional(v.number()),
  fxFee: v.optional(v.number()),
  isFxFee: v.optional(v.boolean()),
  // base rewards
  baseSpendAmount: v.optional(v.number()),
  baseSpendEarnType: v.optional(v.string()),
  baseSpendEarnCategory: v.optional(v.string()),
  baseSpendEarnCurrency: v.optional(v.string()),
  baseSpendEarnValuation: v.optional(v.number()),
  baseSpendEarnIsCash: v.optional(v.boolean()),
  baseSpendEarnCashValue: v.optional(v.number()),
  // signup bonus
  isSignupBonus: v.optional(v.boolean()),
  signupBonusAmount: v.optional(v.union(v.number(), v.string())),
  signupBonusType: v.optional(v.string()),
  signupBonusCategory: v.optional(v.string()),
  signUpBonusItem: v.optional(v.string()),
  signupBonusSpend: v.optional(v.number()),
  signupBonusLength: v.optional(v.number()),
  signupBonusLengthPeriod: v.optional(v.string()),
  signupAnnualFee: v.optional(v.number()),
  isSignupAnnualFeeWaived: v.optional(v.boolean()),
  signupStatementCredit: v.optional(v.number()),
  signupBonusDesc: v.optional(v.string()),
  // travel perks (human-readable text + entitlement flag)
  trustedTraveler: v.optional(v.string()),
  isTrustedTraveler: v.optional(v.boolean()),
  loungeAccess: v.optional(v.string()),
  isLoungeAccess: v.optional(v.boolean()),
  freeHotelNight: v.optional(v.string()),
  isFreeHotelNight: v.optional(v.boolean()),
  freeCheckedBag: v.optional(v.string()),
  isFreeCheckedBag: v.optional(v.boolean()),
  // bounded arrays
  benefit: v.optional(v.array(benefitValidator)),
  spendBonusCategory: v.optional(v.array(spendBonusCategoryValidator)),
  annualSpend: v.optional(v.array(annualSpendValidator)),
};

export const cardDetailContentValidator = v.object(cardDetailContentFields);
export type CardDetailContent = Infer<typeof cardDetailContentValidator>;
