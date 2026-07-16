# OfferBee Native App — Session Handoff

_Last updated: 2026-07-12. Branch: `feat/native-app-rebuild` (off `preview`). Nothing committed yet._

## TL;DR

The Expo native app was rebuilt from scratch (replacing the notes-app template) into the real
OfferBee app: Honey/Onyx themed design system, iOS 26 Liquid Glass, 4 tabs + card detail +
add-card + 5-step onboarding + settings + notifications inbox, all on the **existing Convex
backend with zero backend changes**. It **builds and runs on the iOS Simulator** (SDK 57,
iOS 26.4, iPhone 17 Pro). Typecheck is green.

**The user is NOT happy with the design/UI-UX.** The infrastructure is done; the next session's
job is a **visual polish pass**, screen by screen, against the design handoff. Get the user's
specific hit list before starting. See "NEXT: design polish" below.

## How to run (simulator loop — this replaced Expo Go)

Expo Go on a physical phone was abandoned: App Store Expo Go only ships SDK 54, the project is
now SDK 57. Simulator is the dev loop.

```sh
# 1. boot the sim (already downloaded: iOS 26.4 runtime, iPhone 17 Pro)
xcrun simctl boot 9B007D93-0C0D-4552-A0A8-3D036EEBC79D ; open -a Simulator
# 2. start Metro (dev env → Convex agreeable-labrador-799)
cd apps/native && pnpm dev            # runs on 8081; use --port 8082 if Docker holds 8081
# 3. open the app in the sim's Expo Go
xcrun simctl openurl booted "exp://127.0.0.1:8081"
# screenshot for inspection:
xcrun simctl io booted screenshot /tmp/sim.png
```

`pnpm dev` / `dev:preview` / `dev:prod` select env via `APP_ENV` + `.env.<env>`. Sign in with
Google/Apple SSO; the account `ronak@uare.ai` already exists on the dev deployment (skips
onboarding). A fresh account lands in the 5-step onboarding.

Glass effect: real Liquid Glass renders on the iOS 26 simulator (SDK 54+ feature). Older iOS
falls back to BlurView, then a translucent view.

## What's built (inventory)

**Config**: `app.config.ts` (dynamic, replaces app.json — per-env name/scheme/bundleId from
`APP_ENV`), `eas.json` (3 build profiles, future use), `.env.development|preview|production`,
`metro.config.js` (React-singleton resolver — see gotchas).

**Theme** (`src/theme/`): `tokens.ts` (from `Design/design_handoff_kept/tokens.json` — Honey +
Onyx), `typography.ts` (Source Serif 4 / Public Sans / IBM Plex Mono via `@expo-google-fonts`),
`ThemeProvider.tsx` (system|light|dark, persisted in AsyncStorage), `fonts.ts`.

**UI kit** (`src/components/ui/`): GlassSurface, Text, Screen, Card, Button/PillButton/IconButton,
Chip, Badge, SegmentedControl, ProgressBar, SearchField, ListRow, CardArt, Skeleton, EmptyState,
SectionLabel, Icon (Feather-backed). Nav: `ScreenHeader`, `TabBar` (custom floating glass bar —
NOT expo-router NativeTabs, which is still alpha).

**Screens** (`src/app/`): `(auth)/sign-in`, `(tabs)/{index=Review,benefits,expiring,cards}`,
`card/[cardKey]`, `add-card` (modal), `settings`, `notifications`,
`(onboarding)/{wallet,spending,reminders,review}`. Root `_layout.tsx` gates via
`Stack.Protected`: signed-out → auth, no `onboardingCompletedAt` → onboarding, else tabs.

**Data** (`src/features/`): `credits/derive.ts` is a **verbatim port of
`apps/web/src/components/app/data.ts`** (captured/net/verdict/expiring math — keep in sync).
`credits/CreditsProvider.tsx` = one `listMyCredits` subscription + optimistic mutations, feeds
Review/Benefits/Expiring/Cards. `onboarding/OnboardingProvider.tsx` mirrors the web wizard's
debounced-save + completeOnboarding contract.

**Backend**: untouched. Consumed via `@packages/backend/convex/_generated/api`. Curated
onboarding cards + categories imported from `convex/onboardingCatalog.ts`.

## Gotchas / hard-won fixes (don't re-break these)

1. **metro.config.js React-singleton resolver.** The monorepo has React 19.2 (web) + RN's React;
   pnpm nests spare React copies inside shared deps. Without the resolver, Metro bundles two
   Reacts → "Invalid hook call" / "Cannot read property useRef of null". The config resolves
   react/react-dom/react-native/scheduler from the app's own graph **dynamically** (survives
   pnpm re-hoisting). If you see hook-null errors after any `pnpm add`, this is why — restart
   Metro with `--clear`.
2. **`@expo/metro-runtime`** is a required direct dep for expo-router (added). Missing → "Unable
   to resolve @expo/metro-runtime/error-overlay".
3. **TabBar uses structural prop types**, not `BottomTabBarProps` from `@react-navigation/bottom-tabs`
   — expo-router vendors its own react-navigation copy, so the imported type clashes nominally.
   Runtime shape is identical. Don't "fix" it back to the import.
4. **Remote push doesn't work in Expo Go** (SDK 53+). `usePushNotifications` no-ops unless it's a
   dev/EAS build with an eas projectId. Onboarding "sample notification" uses a LOCAL notification.
5. **`newArchEnabled` is not a valid key** in the SDK 55+ ExpoConfig type (new arch always on).

## Outstanding TODOs

- **Staging/prod Clerk keys**: `.env.preview` / `.env.production` reuse the dev Clerk publishable
  key with TODO comments — those Clerk instances don't exist yet.
- **`eas init` not run**: no eas projectId → remote push registration silently no-ops. Do this
  when starting real builds.
- **Per-env app icons**: single `icon.png` used for all 3 bundle ids. No bee-mark logo yet — the
  sign-in screen still shows the template placeholder logo (`src/assets/icons/logo.png`).
- **Nothing committed.** ~50 new files staged as untracked + template deletions. Commit when the
  design pass is done (or before, if you want a checkpoint).

## NEXT: design polish (the actual ask)

The user rebuilt correctly but doesn't like how it looks/feels. Before touching code:

1. **Get the user's specific hit list** — which screens, what's wrong (spacing? color too beige?
   type scale? tab bar? density? motion?). Don't guess-refactor everything.
2. Reference targets: `Design/design_handoff_kept/screenshots/{honey,onyx}.png` (all 6 mobile
   screens rendered) + the `.dc.html` prototypes in `Design/design_handoff_kept/` and
   `Design/design_handoff_onboarding/`.
3. Known obvious gap: **placeholder logo** (ruler+pencil) on sign-in — needs the real OfferBee
   bee-mark asset.
4. Loop: edit → `xcrun simctl io booted screenshot` → compare to handoff → iterate. Metro
   hot-reloads, no restart needed for component edits.

## Verify commands

```sh
pnpm --filter native-app typecheck   # green as of handoff
cd apps/native && pnpm exec expo export --platform ios --output-dir /tmp/exp  # bundle smoke test
```
