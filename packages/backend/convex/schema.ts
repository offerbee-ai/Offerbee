import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  benefitSourceValidator,
  cardDetailContentFields,
  cycleValidator,
  deliveryStatusValidator,
  fieldProvenanceValidator,
  platformValidator,
  reviewObservationValidator,
  reviewReasonValidator,
  reviewStatusValidator,
  fieldValueValidator,
} from "./validators";

export default defineSchema({
  // ── Users: populated from the Clerk subject; home for notification prefs ──
  users: defineTable({
    userId: v.string(), // Clerk subject — same value used for ownership everywhere
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    notificationsEnabled: v.boolean(),
    enabledOfferTypes: v.optional(v.array(v.string())), // undefined = all types on
    timeZone: v.optional(v.string()), // IANA; quiet hours + anniversary math
    quietHoursStart: v.optional(v.number()), // 0-23 local hour, inclusive
    quietHoursEnd: v.optional(v.number()), // 0-23 local hour, exclusive
    lastOfferScanAt: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  // ── Catalog cache: cards seen via live name search (name fallback for the
  //    wallet + a reference for detail refresh). Search itself hits the API. ──
  cardCatalog: defineTable({
    cardKey: v.string(),
    cardName: v.string(),
    cardIssuer: v.string(),
    isActive: v.boolean(),
    lastSyncedAt: v.number(),
  })
    .index("by_cardKey", ["cardKey"])
    .index("by_issuer", ["cardIssuer"]),

  // ── Full card detail, cached only for owned/viewed cards ──
  cardDetails: defineTable({
    ...cardDetailContentFields,
    detailFetchedAt: v.number(),
    detailHash: v.optional(v.string()), // change detection
    // Per-field provenance for cross-checked/verified fields (annualFee, bonus…).
    // Absent until the verification pipeline has run for that field.
    fieldProvenance: v.optional(v.array(fieldProvenanceValidator)),
  })
    .index("by_cardKey", ["cardKey"])
    .index("by_detailFetchedAt", ["detailFetchedAt"]), // oldest-first refresh

  // ── Data-verification review queue: proposed field corrections awaiting a
  //    human one-click confirm before they are written to cardDetails. ──
  cardDataReview: defineTable({
    cardKey: v.string(),
    field: v.string(), // cardDetails key under review
    currentValue: v.optional(fieldValueValidator), // what cardDetails holds now
    proposedValue: v.optional(fieldValueValidator), // web-verified candidate
    reason: reviewReasonValidator,
    observations: v.array(reviewObservationValidator), // what each source said
    confidence: v.optional(v.number()), // 0-1 from the web-verify step
    sourceUrl: v.optional(v.string()), // issuer page the proposal came from
    note: v.optional(v.string()), // model's short justification
    status: reviewStatusValidator,
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()), // Clerk subject of the confirmer
  })
    .index("by_status", ["status"])
    .index("by_cardKey", ["cardKey"])
    .index("by_cardKey_and_field", ["cardKey", "field"]),

  // ── User wallet: the cards a user owns ──
  userCards: defineTable({
    userId: v.string(),
    cardKey: v.string(),
    nickname: v.optional(v.string()),
    addedAt: v.number(),
    openedDate: v.optional(v.number()), // annual-fee anniversary basis
    signupBonusStartDate: v.optional(v.number()), // min-spend window start
    signupBonusMet: v.optional(v.boolean()), // user marks bonus done => stop nudges
    notificationsEnabled: v.optional(v.boolean()), // per-card mute
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_cardKey", ["userId", "cardKey"])
    .index("by_cardKey", ["cardKey"]), // reverse lookup for rescanCard

  // ── Expo (or web) push tokens, one row per device token ──
  pushTokens: defineTable({
    userId: v.string(),
    token: v.string(), // "ExponentPushToken[...]"
    deviceId: v.optional(v.string()),
    platform: v.optional(platformValidator),
    lastSeenAt: v.number(),
    isValid: v.boolean(), // flipped false on DeviceNotRegistered
  })
    .index("by_userId", ["userId"])
    .index("by_token", ["token"]),

  // ── Notification records: feed + delivery tracking + dedup ──
  notifications: defineTable({
    userId: v.string(),
    type: v.string(), // offer type code (see offers.ts)
    cardKey: v.optional(v.string()),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()), // deep-link payload { route, cardKey, ... }
    dedupKey: v.string(), // stable per (user, type, card, period/milestone)
    isRead: v.boolean(),
    createdAt: v.number(),
    deliveryStatus: deliveryStatusValidator,
    sentAt: v.optional(v.number()),
    expoTicketId: v.optional(v.string()),
    deliveryError: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_isRead", ["userId", "isRead"])
    .index("by_userId_and_dedupKey", ["userId", "dedupKey"])
    .index("by_deliveryStatus", ["deliveryStatus"]),

  // ── Benefit-usage tracking ──────────────────────────────────────────────
  // A credit the user chose to track on one of their cards (e.g. "$200 Airline
  // Fee Credit", $200 annual). `amount` is dollars PER cycle period.
  userBenefits: defineTable({
    userId: v.string(), // Clerk subject (ownership)
    userCardId: v.id("userCards"),
    cardKey: v.string(), // denormalized: card-detail listing + suggestion dedup
    title: v.string(), // user-editable display name
    amount: v.number(), // dollars per cycle period (> 0)
    cycle: cycleValidator,
    source: benefitSourceValidator,
    benefitTitle: v.optional(v.string()), // original API title: provenance + idempotent re-track
    snoozedUntil: v.optional(v.number()), // ms; hide from expiring until then
    archivedAt: v.optional(v.number()), // ms; set when the card is removed (recoverable)
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userCardId", ["userCardId"]) // archive/cascade on card removal
    .index("by_userId_and_cardKey", ["userId", "cardKey"]), // card page + dedup + restore

  // Append-only usage events. Many rows per (benefit, period) support partial
  // dollar logging; the current-period sum is what "used" derives from.
  benefitUsages: defineTable({
    userId: v.string(),
    userBenefitId: v.id("userBenefits"),
    cardKey: v.string(), // denormalized for CSV/reporting without a double join
    periodKey: v.string(), // "2026-07" | "2026-Q3" | "2026-H2" | "2026"
    amount: v.number(), // dollars (> 0)
    usedAt: v.number(),
    note: v.optional(v.string()),
  })
    // Prefix also serves per-benefit history + cascade delete.
    .index("by_userBenefitId_and_periodKey", ["userBenefitId", "periodKey"])
    .index("by_userId", ["userId"]),
});
