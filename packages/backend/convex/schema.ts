import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  benefitSourceValidator,
  cardDetailContentFields,
  cycleValidator,
  deliveryStatusValidator,
  fieldProvenanceValidator,
  notificationCategoriesValidator,
  platformValidator,
  reminderPrefsValidator,
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
    name: v.optional(v.string()), // combined "First Last" — display + server (Brevo/emails)
    firstName: v.optional(v.string()), // captured in the onboarding name step
    lastName: v.optional(v.string()),
    notificationsEnabled: v.boolean(),
    enabledOfferTypes: v.optional(v.array(v.string())), // undefined = all types on
    timeZone: v.optional(v.string()), // IANA; quiet hours + anniversary math
    quietHoursStart: v.optional(v.number()), // 0-23 local hour, inclusive
    quietHoursEnd: v.optional(v.number()), // 0-23 local hour, exclusive
    lastOfferScanAt: v.optional(v.number()),
    // ── First-run onboarding (web wizard). Absent on rows that predate the
    //    wizard or came from native — those users are never gated into it. ──
    onboardingStep: v.optional(v.number()), // last reached step 1-4 (0 = Clerk, never stored)
    onboardingCompletedAt: v.optional(v.number()),
    onboardingCards: v.optional(v.array(v.string())), // curated onboardingCatalog ids
    spendingCategories: v.optional(v.array(v.string())), // feeds feed ranking
    reminderPrefs: v.optional(reminderPrefsValidator),
    // Unified notification-preference categories (Notifications v2). Additive
    // widen: reminderPrefs + enabledOfferTypes stay in place until a later
    // migration task consolidates onto this and a subsequent task drops them.
    notificationCategories: v.optional(notificationCategoriesValidator),
    // Idempotency guard for the transactional welcome email (email.ts).
    welcomeEmailSentAt: v.optional(v.number()),
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
    .index("by_issuer", ["cardIssuer"])
    // Instant, reactive local search over cards already known (prefill + past
    // name searches). Powers catalog.searchCatalogLocal; the API action stays
    // the completeness backstop and its upserts grow this index reactively.
    .searchIndex("search_cardName", { searchField: "cardName" }),

  // Term-keyed cache of live name-search results. A term's cached results are
  // the complete API answer for that term, so repeat searches skip the API
  // (and can serve stale results if the API is down). See rapidapi.searchCards.
  searchCache: defineTable({
    term: v.string(), // normalized: trimmed + lowercased
    results: v.array(
      v.object({
        cardKey: v.string(),
        cardName: v.string(),
        cardIssuer: v.string(),
      }),
    ),
    fetchedAt: v.number(),
  }).index("by_term", ["term"]),

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
    // Once-only guard: set when this card's catalog credits have been auto-seeded
    // into userBenefits. Prevents re-seeding a credit the user later untracked.
    benefitsSeededAt: v.optional(v.number()),
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
    // Plaid auto-logging: the source event + how it was created. Absent on rows
    // that predate Plaid (treated as manual). transactionId enables idempotency
    // (one usage per transaction) and reversal on refund/removal.
    source: v.optional(v.union(v.literal("manual"), v.literal("auto"))),
    transactionId: v.optional(v.string()), // Plaid transaction_id
  })
    // Prefix also serves per-benefit history + cascade delete.
    .index("by_userBenefitId_and_periodKey", ["userBenefitId", "periodKey"])
    .index("by_userId", ["userId"])
    .index("by_transactionId", ["transactionId"]), // auto-log dedup + reversal

  // ── Plaid: linked financial institutions (one row per Plaid Item) ──────────
  // accessToken is a long-lived secret — read only by internal functions, never
  // returned to a client.
  plaidItems: defineTable({
    userId: v.string(), // Clerk subject (ownership)
    itemId: v.string(), // Plaid item_id
    accessToken: v.string(), // SECRET — server-only
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
    cursor: v.optional(v.string()), // /transactions/sync delta cursor
    status: v.union(
      v.literal("active"),
      v.literal("login_required"),
      v.literal("error"),
    ),
    createdAt: v.number(),
    lastSyncedAt: v.optional(v.number()),
    lastManualRefreshAt: v.optional(v.number()), // user-requested /transactions/refresh (cooldown)
  })
    .index("by_userId", ["userId"])
    .index("by_itemId", ["itemId"]), // webhook resolves item_id → owner

  // Accounts within a Plaid Item; userCardId links a real account to a wallet card.
  plaidAccounts: defineTable({
    userId: v.string(),
    itemId: v.string(),
    accountId: v.string(), // Plaid account_id
    mask: v.optional(v.string()),
    name: v.optional(v.string()),
    officialName: v.optional(v.string()),
    subtype: v.optional(v.string()),
    userCardId: v.optional(v.id("userCards")), // linked wallet card (nullable)
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_itemId", ["itemId"])
    .index("by_accountId", ["accountId"]),

  // Processed-transaction ledger: idempotency, the suggestion feed, and a
  // per-card import list. One row per Plaid transaction_id.
  plaidTransactions: defineTable({
    userId: v.string(),
    itemId: v.string(),
    accountId: v.string(),
    transactionId: v.string(),
    merchantName: v.optional(v.string()),
    name: v.optional(v.string()),
    originalDescription: v.optional(v.string()), // raw statement text — keeps credit wording Plaid's cleaning strips
    amount: v.number(), // dollars; positive = spend (outflow)
    date: v.number(), // ms — effective/statement date (authorized_date ?? posting date)
    postedDate: v.optional(v.number()), // ms — raw posting date (can lag `date` by days)
    pfcPrimary: v.optional(v.string()), // personal_finance_category.primary
    pfcDetailed: v.optional(v.string()), // personal_finance_category.detailed
    pending: v.boolean(),
    userCardId: v.optional(v.id("userCards")), // resolved from account link
    matchedBenefitId: v.optional(v.id("userBenefits")),
    matchStatus: v.union(
      v.literal("auto"), // auto-logged (deterministic refund posting)
      v.literal("candidate"), // pre-LLM: plausible purchase / ambiguous refund
      v.literal("suggested"), // LLM-approved, awaiting confirm/dismiss
      v.literal("confirmed"), // user confirmed a suggestion → logged
      v.literal("dismissed"), // user dismissed
      v.literal("skipped"), // matched a benefit but its period is already used up
      v.literal("none"), // no benefit match
    ),
    createdAt: v.number(),
  })
    .index("by_transactionId", ["transactionId"]) // dedup
    .index("by_userId_and_matchStatus", ["userId", "matchStatus"]) // suggestion feed
    .index("by_userCardId", ["userCardId"]) // per-card import list
    .index("by_accountId", ["accountId"]) // re-match on account→card link
    .index("by_itemId", ["itemId"]),
});
