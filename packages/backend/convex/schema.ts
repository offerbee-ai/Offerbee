import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  cardDetailContentFields,
  deliveryStatusValidator,
  platformValidator,
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

  // ── Catalog: every card, cheaply searchable ──
  cardCatalog: defineTable({
    cardKey: v.string(),
    cardName: v.string(),
    cardIssuer: v.string(),
    isActive: v.boolean(),
    lastSyncedAt: v.number(), // rows older than the run start => delisted upstream
  })
    .index("by_cardKey", ["cardKey"])
    .index("by_issuer", ["cardIssuer"])
    .searchIndex("search_cardName", {
      searchField: "cardName",
      filterFields: ["cardIssuer", "isActive"],
    }),

  // ── Full card detail, cached only for owned/viewed cards ──
  cardDetails: defineTable({
    ...cardDetailContentFields,
    detailFetchedAt: v.number(),
    detailHash: v.optional(v.string()), // change detection
  })
    .index("by_cardKey", ["cardKey"])
    .index("by_detailFetchedAt", ["detailFetchedAt"]), // oldest-first refresh

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

  // ── Sync bookkeeping (one row per pipeline key) ──
  syncState: defineTable({
    key: v.string(), // "catalog" | "details" | "offers"
    status: v.union(
      v.literal("idle"),
      v.literal("running"),
      v.literal("error"),
    ),
    lastRunStartedAt: v.optional(v.number()),
    lastRunFinishedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    cardsSeen: v.optional(v.number()),
    cardsUpserted: v.optional(v.number()),
  }).index("by_key", ["key"]),
});
