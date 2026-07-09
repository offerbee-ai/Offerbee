import { type Infer, v } from "convex/values";

// Shared validators reused across the schema and function argument lists so the
// data contract is defined exactly once.

export const platformValidator = v.union(
  v.literal("ios"),
  v.literal("android"),
  v.literal("web"),
);

export const deliveryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("skipped"),
);

// Bounded arrays nested inside a single card's detail document. A card has only a
// handful of each and they do not grow over time, so nesting is safe.
export const benefitValidator = v.object({
  benefitTitle: v.string(),
  benefitDesc: v.optional(v.string()),
  isBenefitCardNetworkTier: v.optional(v.boolean()),
});

export const spendBonusCategoryValidator = v.object({
  spendBonusCategoryType: v.optional(v.string()),
  spendBonusCategoryName: v.optional(v.string()),
  spendBonusDesc: v.optional(v.string()),
  earnMultiplier: v.optional(v.number()),
  isSpendBonusCategoryLimit: v.optional(v.boolean()),
  spendBonusCategoryLimit: v.optional(v.number()),
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
  cardType: v.optional(v.string()),
  cardUrl: v.optional(v.string()),
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
