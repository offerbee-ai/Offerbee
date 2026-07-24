# Location-Based Notifications — Design Doc

**Status:** Draft · July 2026
**Use case:** Notify a user when they are physically near a merchant where they hold an unused card benefit (e.g., walking past a Dunkin' with the $7 Dunkin' credit unspent this period).

---

## 1. What exists today (and what doesn't)

The notification pipeline is mature and reusable as-is. The `notifications` table (`packages/backend/convex/schema.ts`) is a generic feed + outbox with `type`, `dedupKey`, `deliveryStatus`, and a deep-link `data` payload; delivery goes through `@convex-dev/expo-push-notifications` (`convex/push.ts`), gated by quiet hours (`pushQuietHours.ts`) and the per-user `notificationCategories` prefs. Adding a new type (`credit_nearby`) slots into all of this with minimal change — new Android channel in `apps/native/src/lib/notifications.ts`, new route mapping in `usePushNotifications.routeFromData`, new toggle in both settings screens.

What is entirely greenfield:

- **Location capability.** `expo-location` / `expo-task-manager` are not installed; no permission strings, no `UIBackgroundModes`, no geofencing.
- **Merchant linkage.** `userBenefits` has no merchant, brand, or geo field. Benefits are parsed from card-detail prose (`benefitParser.ts`) into title/amount/cycle only. The only merchant data anywhere is free-text `plaidTransactions.merchantName`.
- **Merchant locations.** No lat/lng exists anywhere in this repo. We have an existing nearby-search service built on the Google Maps API **outside this repo**; this design reuses it behind a Convex action (see §4).

## 2. How geofencing works (clearing up the model)

This is OS-level region monitoring, not app-side polling. The app registers circular regions with the OS (`Location.startGeofencingAsync` + a `TaskManager.defineTask` handler at module scope). The OS monitors them using cell/Wi-Fi signals at negligible battery cost and wakes the app on region entry/exit — including relaunching a killed app into the background on iOS.

Hard constraint: **iOS allows 20 monitored regions per app** (Android: 100). So the client's real job is *choosing which ~19 merchant fences to monitor right now*, and refreshing that set as the user moves. The refresh scheme:

1. **Anchor fence.** Region #20 is a large fence (~5 km radius) centered on the user's current position. Exiting it means "user moved far enough that the monitored merchants are stale."
2. **On anchor exit, or on app foreground:** get one location fix, ask the server for the top ~19 merchant locations near that fix where the user has an *unused, unsnoozed* benefit, re-register the fence set, re-center the anchor.
3. **On merchant fence entry:** fire the notification flow (§5).

So yes — the fence set "stays the same for a while," but the OS does the watching; the app only wakes to re-select or to notify. No continuous GPS, no location history.

## 3. Architecture overview

```
apps/native                          packages/backend (Convex)          external
─────────────                        ──────────────────────────         ────────
expo-location + task-manager
  ├─ anchor-exit / foreground ──────▶ geo.selectRegions(lat,lng) ──────▶ nearby-search
  │     ◀── top-19 merchant fences ──┘   (joins benefitMerchants,         service
  │                                       delegates spatial query)       (Google Maps →
  └─ fence entry ───────────────────▶ geo.onRegionEnter(...)              Redis GEO index,
        ◀── notify? + payload ───────┘   dedup · quiet hours · prefs      existing, other
        └─ presents LOCAL notification;  inserts notifications row        repo)
           offline fallback: present     (type: credit_nearby)
           from cached payload
```

Key decision: on fence entry the app is already awake, so we **don't need a push round-trip**. The client calls `geo.onRegionEnter`; the server applies dedup/quiet-hours/prefs and inserts the feed row, and the client presents a *local* notification immediately. If offline, the client presents from a payload cached at fence-registration time and reconciles the feed row later. This keeps all policy (dedup, quiet hours, master toggle) server-side and consistent with existing types, while making delivery instant and offline-tolerant.

Privacy option worth keeping open: `selectRegions` can run without persisting coordinates — the fix is used transiently for the query and discarded. No location table, no history.

## 4. Data model changes (Convex)

**`benefitMerchants.json` + loader** — curated mapping from benefit to physical brand, following the exact pattern of `benefitOverrides.json`:

```jsonc
// keyed by (cardKey, benefitTitle), like benefitOverrides
{
  "amex-gold|Dunkin' Credit":   { "brandKey": "dunkin",  "query": "Dunkin'", "note": "..." },
  "amex-plat|Saks Credit":      { "brandKey": "saks",    "query": "Saks Fifth Avenue" },
  "amex-plat|Airline Fee Credit": { "brandKey": "airport", "query": null, "kind": "airport" }
}
```

Only benefits with a physical, walk-in redemption get an entry (Grubhub, streaming, etc. are excluded). Curation is cheap: the benefit catalog is small and the brand set smaller. This deliberately avoids trying to parse merchants out of benefit prose.

**Spatial index — external service, not Convex.** Convex has no native geo index, and we don't build one. All spatial queries go to the existing nearby-search service, which maintains a Redis-backed spatial index (`GEOSEARCH`) over merchant locations sourced from Google Maps. `geo.selectRegions` is a Convex **action** that calls it (base URL + key via Convex env vars) with `{brandKeys[], lat, lng, radius, limit}` and gets back ranked places with distances.

No `merchantLocations` table in Convex — Redis is the cache and the index. At most, Convex keeps the last `selectRegions` response per user (a small doc) so fence payloads can be re-served offline and `onRegionEnter` can re-validate against what was registered.

**No schema change to `userBenefits`.** The mapping stays external, exactly like overrides, so catalog churn never touches user rows.

**Prefs:** add `nearby: boolean` to `notificationCategoriesValidator` (`validators.ts`), `updateNotificationPrefs`, both settings screens, and the onboarding reminders step.

## 4a. The geo service: Vacation-Planner (Unwind) — gap analysis

The external service is `github.com/timwangmusic/Vacation-Planner` (Go/Gin + Redis + Google Maps). What it already provides matches the design's assumptions well:

- **Redis GEO cache-aside search:** `RedisClient.NearbySearch` runs `GeoRadius` over keys like `placeIDs:eatery:level{N}` / `placeIDs:visit` (radius auto-doubles until `MinNumResults`), hydrates full place JSON per placeId; on cache miss/staleness, `PoiSearcher` falls through to Google Maps NearbySearch and writes back via `SetPlacesAddGeoLocations` (`GeoAdd`). Freshness window: 14 days (`MinMapsResultRefreshDuration`).
- **Place model** has everything a fence needs: placeId, name, lat/lng, formatted address, business status (with `Operational` filtering), opening hours.
- **Auth:** PAT (personal access token) support exists (`/v1/create-token`) — the Convex action can authenticate with a provisioned PAT.

**Gaps to close (changes in the Vacation-Planner repo):**

1. **No brand/keyword search — the critical gap.** Search is by place *category* only (`Visit`/`Eatery` → 6 Google place types: cafe, restaurant, museum, gallery, park, amusement park). The Google request sets `Type` + `RankBy: prominence` and never uses `Keyword`; there is no TextSearch anywhere. "Dunkin' near me" is not expressible. Fix: add a `Brand`/`Keyword` field to `PlaceSearchRequest`, pass it as `Keyword` in the Maps request, and index results under brand-scoped Redis keys (`placeIDs:brand:{brandKey}`) so cached geo queries stay brand-pure. Post-hoc name filtering over category results is not a substitute — prominence ranking will miss target brands.
2. **No public nearby-places endpoint.** `NearbySearch` is internal to the planning APIs (`/v1/plans`, `/v1/optimal-plan`); no route returns raw places. Add e.g. `POST /v1/nearby-places` accepting `{brands[], lat, lng, radius, limit}` and fanning out per brand internally (concurrency + API semaphore machinery already exists).
3. **Category whitelist is leisure-oriented.** OfferBee brands span retail (Saks → department_store), airports, hotels, gas — none in the current 6-type list. Brand/keyword search mostly sidesteps this, but the type whitelist shouldn't constrain brand queries.
4. **Cold start per brand.** Brand-scoped Redis keys start empty everywhere; first query in a new area hits Google Maps live (10 s timeout budget). Acceptable for fence refresh, but Phase 1 should pre-warm the mapped brands in launch metros.
5. **Minor:** places with `userRatingsTotal == 0` are dropped (new locations disappear); `GeoRadius` is the pre-6.2 command (works fine; `GEOSEARCH` is the modern equivalent).

None of these are structural — item 1 + 2 are one focused PR; the Redis/geo/cache core is reused as-is.

## 5. Server functions

- `geo.selectRegions` (action): given `{lat, lng}`, load the user's active benefits, join through `benefitMerchants` to a `brandKeys[]` set, call the external service's geosearch with those brands + coordinate, rank results by distance × credit value, return ≤19 `{placeId, brandKey, benefitId, lat, lng, radius, payload}`. Payload includes everything needed to present offline. Note: because the spatial query lives in an action (Convex actions can `fetch`), no query-side geo logic is needed.
- `geo.onRegionEnter` (mutation): validates the benefit is still unused/unsnoozed this period, checks `notificationsEnabled` + `nearby` pref + quiet hours, dedups with `dedupKey = nearby:{benefitId}:{periodKey}` (once per benefit per cycle — a cooldown like `nearby:{benefitId}:{placeId}:{week}` is a tuning knob), inserts the `notifications` row with `type: "credit_nearby"` and deep-link `data: {route: "credit", benefitId}`, returns `{notify, title, body}`.

Both follow existing conventions: object syntax, `v.*` validators, sensitive logic in `internal*` helpers, `reminders.ts` as the structural model.

## 5a. Scaling to 100+ offers per user

The 20-fence iOS cap (19 merchant + 1 anchor) never sees the raw offer list; a funnel shrinks it at every stage, and each stage is cheap:

1. **Location-actionable only.** Join through `benefitMerchants.json`: only benefits with physical walk-in redemption survive (streaming, Grubhub, statement credits drop out). 100+ offers typically collapse to 10–25 brands.
2. **Active only.** Unused this period, unsnoozed, unarchived — the same predicate `reminders.ts` already uses.
3. **Brand dedupe.** Two cards with Dunkin' credits become one brand query; the fence payload carries *all* matching benefitIds, and a fence entry notifies once ("2 Dunkin' credits to use"), not per offer.
4. **Rank brands before querying.** `selectRegions` scores brands by (credit value × expiry proximity) and only sends the top ~20 to `/v1/nearby-places` (the endpoint caps `brands` at 25) — this also bounds Google Maps cost on cold caches. Chunking for larger sets is possible but shouldn't be needed after steps 1–3.
5. **Distance does the rest.** Of the surviving brands, only those with a location inside the search radius produce candidate places. Final fence selection ranks places by value × distance × expiry and takes 19 (Android allows 100, so the budget binds only on iOS). One place per brand within walking distance — no point fencing three adjacent Dunkin's.
6. **Rotation by re-anchoring.** Offers that don't make the cut aren't lost: every anchor-exit/app-open re-selection re-ranks from scratch, so as the user moves (or credits get redeemed and periods roll over), different offers win fences.
7. **Notification crowding control.** Independent of fence count: per-benefit-per-period dedup, plus a daily cap on `credit_nearby` notifications; if multiple fences fire in one outing, coalesce into a digest-style ping ("3 credits redeemable near you") rather than serial notifications.

## 6. Native app changes

- Add `expo-location`, `expo-task-manager`; plugin config in `app.config.ts` with iOS purpose strings (`NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`) and `UIBackgroundModes: ["location"]`; Android `ACCESS_BACKGROUND_LOCATION`.
- **Requires a dev client / EAS build** — like Plaid, these native modules don't run in Expo Go. Existing dev-client workflow covers this.
- New `src/features/geo/`: task definitions (module scope, imported from `_layout.tsx`), `useGeofences` hook (permission state, registration lifecycle), fence-payload cache.
- Permission UX is the make-or-break: ask **When-In-Use first**, in context, with the value prop ("get pinged when you're near an unused credit"); request the **Always** upgrade only after the foreground experience has shown value. iOS will independently re-confirm Always with the user weeks later — the notification needs to have earned its place by then.

## 7. Phased plan

**Phase 1 — data, no location.** Two halves: (a) in Vacation-Planner, brand/keyword search + the `POST /v1/nearby-places` endpoint (§4a items 1–2) and pre-warm mapped brands in launch metros; (b) in OfferBee, `benefitMerchants.json` + the `selectRegions` action with unit tests on the join. Ship silently; validates the API contract and mapping quality.

**Phase 2 — foreground MVP.** When-In-Use permission only. On app open, a "Near you" module on the credits screen shows redeemable benefits nearby. No background modes, no App Store friction, exercises `selectRegions` end to end, and produces data on whether nearby-ness correlates with redemption before we spend the Always-permission budget.

**Phase 3 — background geofencing.** Everything in §2/§5/§6: task manager, anchor fence, `credit_nearby` type, settings toggle, Always-permission upgrade flow. TestFlight via existing Xcode Cloud (touches `apps/native`, so it triggers builds correctly).

**Phase 4 — tuning.** Cooldown policy, ranking (value × distance × expiry proximity), airport detection for travel perks, analytics on notify→redeem conversion.

## 8. Risks and mitigations

- **Always-permission grant rates are low** (industry single-digit to ~20%). Mitigated by Phase 2 standing on its own and the staged permission ask.
- **iOS geofence latency/accuracy:** entry events can lag by minutes and need ~100–150 m minimum radii in dense areas; iOS may require the user to cross well into the region. Set radius ≥150 m; don't promise "at the door" precision.
- **App Store review:** background location must be visibly user-beneficial and described in the purpose string; the settings toggle plus in-app explanation covers the usual rejection reasons. Android background-location declaration needed on Play.
- **Merchant data quality:** wrong/closed locations cause trust-destroying false pings. Freshness is the external service's job (its Redis index refreshes from Google Maps); on our side, `onRegionEnter` re-validation + an easy "not near me" feedback action (reuse the notification action-category pattern) keep this bounded.
- **External-service dependency:** `selectRegions` now has a hard runtime dependency on the geo service. Failure mode is graceful — fences simply don't refresh and the last-registered set keeps working — but the service needs an SLO and the action needs timeout + retry.
- **20-region cap:** dense urban users may have more than 19 candidate locations; ranking by value×distance is the mitigation, and the anchor-fence refresh keeps the set current.

## 9. Testing

Simulate with `xcrun simctl location` / Xcode GPX routes and Android emulator routes; unit-test `selectRegions` ranking and `onRegionEnter` dedup in Convex; manual field test for fence latency before tuning radii.
