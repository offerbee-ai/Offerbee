# Handoff: OfferBee Mobile App — End-to-End (React Native)

## Overview
The complete OfferBee mobile app, from first launch to daily use, in one continuous flow: **Welcome → Sign up / Sign in → 4-step onboarding → notification-permission primer → the full app** (Review, Benefits, Expiring, Cards, Card detail, Credit detail, Add-a-card sheet, Settings). 16 screens total, in both themes (Honey light / Onyx dark).

OfferBee tracks premium-credit-card statement credits — what's still available, what's about to reset, and whether each annual fee is earning its keep. No bank login; credits are tracked manually.

> **⚠️ Supersedes earlier auth spec:** previous handoffs specified Clerk-hosted auth. This design replaces that with **custom native auth screens** (Welcome, Sign up, Sign in). Wire them to whatever auth backend the codebase uses (Clerk SDK headless, Supabase, Firebase, etc.) — the UI is now fully custom.

## About the Design Files
`OfferBee Mobile.dc.html` is a **design reference created in HTML** — a single clickable prototype that runs the entire flow with live state (mark-used recomputes every total, theme switch, onboarding counter, add-card, etc.). It is **not production code**. The task is to **recreate these designs in React Native** using the codebase's established patterns. `support.js` and `ios-frame.jsx` only exist to run the prototype in a browser — never ship them.

Open the HTML file in a browser: a screen-map rail on the left jumps to any of the 16 screens; the phone itself is fully clickable like a real app. Read the `data-dc-script` block for the exact data model and computation logic.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, copy, and interactions are final. Recreate pixel-close. All figures are sample data — wire to real data.

## Recommended RN Stack Mapping
- **Navigation:** React Navigation — native stack for auth/onboarding, bottom-tab navigator (custom floating glass tab bar) for the app, modal presentation for Add-a-card.
- **Glass surfaces** (tab bar, onboarding action bar): `expo-blur` / `@react-native-community/blur` with the tint colors below.
- **Theming:** one theme object per palette (Honey/Onyx) via context; bind to system appearance by default, overridable in Settings.
- **Fonts** (Google Fonts): Source Serif 4 (titles), Public Sans (UI/body), IBM Plex Mono (all numbers + small uppercase labels, tabular digits).

---

## Screens

Reference frame 402×874 (iPhone). Screen padding 16–20px. Scrollable content gets ~110px bottom inset to clear the floating tab bar.

### A. Auth

**01 · Welcome**
- Centered column: a fan of 3 card rectangles (150×94, r12, brand colors `#3A4048` center / `#127C6B` + `#B08A3E` behind, rotated ∓9°, soft shadows), bee logo 38px + "OfferBee" (Source Serif 28/600), headline "Every credit. Kept." (serif 33/600, center), sub copy 15px secondary.
- Bottom: **Get started** (accent fill, 16/600, padding 15, r14, CTA shadow) → Sign up; "I already have an account" (accent 14/600) → Sign in; mono caption "NO BANK LOGIN · TRACKED MANUALLY" (10px, letter-spacing .07em, tertiary).

**02 · Sign up**
- "‹ Back" (accent) → Welcome. Title "Create your account" (serif 28/600) + sub "Your first "aha" is about two minutes away."
- Card (surface, border, r16, pop shadow, padding 20/18): **Continue with Google** (outline button + Google G), "or" divider, labeled Email + Password inputs (13/600 labels; inputs border `--btnbrd`, r9, padding 12/13, bg `--bg`), **Continue** (accent, r11) → onboarding step 1, "Already have an account? **Sign in**".
- Below: "By continuing you agree to the Terms and Privacy Policy." (12px tertiary, centered).

**03 · Sign in**
- Same shell. Title "Welcome back" + sub. Adds right-aligned "Forgot password?" (accent 12.5/600) beside the Password label. **Sign in** → app (Review tab). "New to OfferBee? **Create account**".

### B. Onboarding (4 steps + primer)

**Shared shell:** header (padding 58/20/12, bottom hairline) = bee 24px + "OfferBee" serif 17/600, right "Step X of 4" (mono 11 tertiary). Below: **horizontal stepper** — 4 equal columns, 26px circle (done = accent fill + white ✓; current = accent fill + white mono number; todo = 1.5px border, tertiary number) over a 9.5/600 label. Tappable to jump.
**Floating action bar** (absolute, 16px from edges, r22, glass: theme tint @ ~62% + blur 20 + saturate 170%, hairline `--glassb`, shadow): left = live counter (mono 15/600 accent + "credits in play" 10px), right = Back (outline, hidden on step 1) + Continue (accent fill, 13.5/600, r12). Continue on step 4 reads "Enter OfferBee →".

**04 · Step 1 — Wallet** ("Which cards are in your wallet?", serif 26/600)
- 2-column grid of 6 popular card tiles (surface, padding 12, r14, border; selected → accent border + 3px `--accentsoft` ring): card-art block 62px r10 (brand color + `linear-gradient(140deg, rgba(255,255,255,.16), rgba(0,0,0,.2))` + chip rect), 24px accent check badge top-right when selected; name 14/600; meta 12px "$695/yr · $1,400 value".
- Search field (surface, border, r12) filters a full catalog (name OR issuer, case-insensitive); result rows = 34×23 swatch + name/issuer + Add / Added ✓ pill. Empty state: "No cards match — try an issuer name."
- Every toggle updates the action-bar counter = Σ selected cards' annual credit value.

**05 · Step 2 — Spending** ("What do you actually spend on?")
- 9 wrap-layout chips (14/600, padding 9/15, r11): Dining, Travel, Groceries, Streaming, Rideshare, Hotels, Airlines, Shopping, Wellness. Selected = accent fill/white; unselected = surface + border.
- Live feedback pill (accent-soft bg, r11, padding 11/16, plus-star icon): "Nice — {n} matching credits move to the top of your feed." / zero state "Pick a few — we'll rank every credit around them." Text color `--deep`.

**06 · Step 3 — Reminders** ("Never miss a reset.")
- "WHAT A NUDGE LOOKS LIKE" (mono 10/600 uppercase) + iOS-notification-style sample card (bee icon 30, "OFFERBEE"/"now", dynamic headline + body built from the soonest-expiring selected card). Dims to 35% opacity (250ms) when Expiry alerts is off.
- Toggle list (one card, hairline separators): Expiry alerts / Weekly digest / Renewal alerts / Smart reminders — defaults on/on/off/on. Switch: 44×26 track r14 (on = accent, off = `--track`), 20px white knob.

**07 · Notification primer** (interstitial after step 3, before the OS permission dialog)
- Centered: 84px accent-soft circle with bell icon, "Never miss a reset" (serif 28/600), copy "One nudge, a day or two before a credit resets — only when real money is about to expire.", the same sample notification card.
- Bottom: **Turn on notifications** (accent CTA — trigger the real OS prompt here) and **Not now** (plain, secondary). Both proceed to step 4. Mono caption "CHANGE ANYTIME IN SETTINGS".

**08 · Step 4 — Reveal** (the "aha")
- Eyebrow "YOU'RE ALL SET" (mono, accent). Headline "{$X} is about to slip away." (serif 30/600) — $X = Σ selected cards' credits expiring ≤7 days. Sub: "{n} credits reset within a week across your wallet…"
- Expiring list card: rows = 46px countdown tile (warn-soft/warn, mono days + "days") + 30×20 swatch + name/card + amount (mono 15/600 accent). Sorted by days, max 5. Empty state if no cards selected.
- Summary strip (surface2, r14): "{n} cards added" · "{$} tracked per year" (accent) · "{k} of 4 reminders on" — mono 16/600, 1px dividers.
- "Enter OfferBee →" → app.

### C. The app

**Floating glass tab bar** (all app screens): absolute, 16px from sides / 14px bottom, r30, glass tint + blur 22, 4 tabs (Review, Benefits, Expiring, Cards) — 25px line icons + 10/600 labels; active = accent, inactive = `--tabin`.

**09 · Review (home)**
- Header: mono eyebrow "JULY 2026" + large title "Review" (serif 34/600); right = 36px gradient avatar (`linear-gradient(135deg,#F5B14D,#E8680E)`, white initial) → **Settings**.
- Hero card (r18): "CAPTURED VALUE · 2026", figure mono 40/600 + net delta (accent when ≥0, warn when <0), sub "against $1,720 in annual fees · 4 cards", progress bar (8px, track/accent) + mono footer "BREAK-EVEN CLEARED / 74%".
- "AT A GLANCE" inset group: Remaining this month (accent-soft icon chip) → Benefits; Expiring in ≤ 3 days (warn) → Expiring. Trailing mono values + chevrons.
- "USE BEFORE THEY RESET" group: rows = 32px card swatch + name + "Card · $X · resets in Nd" + trailing accent **Use** (marks used instantly, row leaves the list). Row tap → Credit detail. Footer count line. Empty state: "Nothing at risk this week — you're all caught up."

**10 · Benefits**
- Large title + filter glass button (visual). Functional **search** ("Search credits"). Segmented **Monthly / Quarterly / Annual**.
- Progress summary card: "July · captured — $17 / $77" + bar (label switches to Q3/2026 per filter).
- "{CYCLE} CREDITS · N" group: rows = 30×20 swatch, name, sub ("Used this cycle" / "Card · $X · resets 3d", warn-colored ≤3d), trailing **Mark used** (accent fill) ↔ **Used ✓** (accent-soft). Row tap → Credit detail; button tap stops propagation. Footer: "$X still available across N credits."

**11 · Expiring**
- Large title + bell glass button. Segmented **This week / This month**.
- "THIS WEEK" (alert-colored label + "$X at risk"): rows = 42px warn-soft countdown tile, "Name · $X", card + reset date, trailing accent **Use**.
- "LATER THIS MONTH" (This-month range only): neutral countdown tiles, trailing outline **Snooze** (+30 days). In week range, a footer link "N more credits reset later this month →" switches range.

**12 · Cards**
- Large title + "+" glass button → **Add-a-card sheet**. Summary card: "NET ACROSS 4 CARDS", net mono 34/600 (accent/warn), "$1,919 captured · $1,720 in fees".
- "YOUR WALLET" group: rows = 44×29 card-art thumb, name, "$fee fee · $captured captured", trailing net (mono, signed, accent/warn) + Keep/Review verdict + chevron → Card detail.

**13 · Card detail** (push from Cards)
- Inline nav: "‹ Cards" (accent) · card name (serif 17/600) · ellipsis glass button.
- 172px card-art hero (brand color + diagonal gradient, r16): card name uppercase serif, chip, "•••• 2004", "Annual fee $695 · renews Mar 2027".
- "CAPTURED THIS YEAR" card: mono 30 figure "of $695", Keep/Review pill, progress bar (fill = net color), "+$130 over the fee · break-even cleared" (or "$X under the fee · worth a review", warn).
- "CREDITS · N" group: rows = name, status sub ("Monthly · used this cycle" / "$20 expires in 3 days" warn / "Annual · available"), trailing mono `$used/$total` (tertiary at $0, accent when full) + chevron → Credit detail.

**14 · Credit detail** (push from any credit row; back label reflects origin)
- Inline nav: "‹ {origin}" · credit name (serif 17/600).
- Status card (r18): row of 44×29 card swatch + card name + 46px countdown tile (warn-soft when ≤7d, else neutral); figure mono 38/600 + status ("resets in 3 days" warn / "used this cycle ✓" accent); year progress bar + "$160 of $240 captured in 2026 · 67%"; full-width **Mark used** CTA (accent) ↔ "Used this cycle ✓" (accent-soft).
- "DETAILS" group: Card (→ Card detail), Cycle, Resets in (mono, warn when urgent), Annual value. Footer: "Marking used updates every total instantly."

**15 · Settings** (push from Review avatar)
- Inline nav "‹ Review" · "Settings".
- Profile card: 54px gradient avatar, "Maya Okafor" (serif 19/600), "maya@okafor.co · member since 2024", outline **Edit**.
- APPEARANCE: "Theme" row + **Honey / Onyx** segmented control (drives the whole app's palette, 300ms fade).
- NOTIFICATIONS: same 4 toggles as onboarding — **same state**, persisted to user preferences.
- PLAN: "OfferBee Pro — $4/mo · unlimited cards · renews Aug 12" + accent-soft **Manage**.
- Footer: outline **Export data (CSV)** (secondary) + **Sign out** (alert color) → Welcome.

**16 · Add a card** (modal sheet over Cards, top inset 56px, r22 top corners, dimmed backdrop, slide-up ~320ms)
- Header: Cancel (tertiary) · "Add a card" (serif 30/600) · Import CSV (accent).
- Functional search ("Search 65+ premium cards") + issuer filter chips (All active = accent fill; others outline). "POPULAR" group: rows = 44×29 art thumb, name, "$fee fee · N credits", trailing **Add** (adds the card to the wallet — all totals recompute) ↔ **Added ✓**. Footer: "No bank login required — credits are tracked manually."

---

## Interactions & Behavior
- **Mark used / Use** toggles a credit's `used` flag and adds/subtracts its amount from that credit's year-to-date captured value. Everything derived recomputes instantly: hero figure, %, net, per-card captured/net/verdict, remaining-this-month, at-risk, expiring lists, benefits progress. This live recompute is the core delight — preserve it.
- **Snooze** adds 30 days to a credit's reset countdown.
- **Add card** appends the card (and its predefined credits) to the wallet.
- **Theme** flips Honey/Onyx from Settings; 300ms background/color fade.
- **Onboarding** Continue/Back are linear; stepper jumps anywhere; step 3 → primer → step 4; step 4 → app.
- Screen transitions: content fade/slide-up 6px, 350–400ms ease (`obfade`); sheet slides up 320ms; progress bars animate width 400ms; switches 200ms.
- All buttons in the prototype are styled Views — implement as `Pressable` with proper hit slop (≥44px) and pressed states.

## State Management
- `authed`, `onboarded` flags (onboarding shows once).
- Onboarding: `selCards: Set`, `cats: Set`, `notif: {expiry, digest, renewal, smart}` (defaults T/T/F/T) — persist; notif state is shared with Settings.
- App: `tab`, `push` (card/credit/settings), `cardId`, `creditId`, `sheet`, `benefitFilter`, `expiringRange`, `theme`.
- Data: `cards[] { id, name, artName, color, fee, last4, renew }`, `credits[] { id, cardId, name, amount, cycle (monthly|quarterly|annual), days, used, yUsed, yTotal }`. All totals are **derived** — see the prototype's logic class for exact formulas.
- Card-brand colors are content, not theme tokens: Platinum `#3A4048` · Gold `#B08A3E` · Sapphire Reserve `#127C6B` · Green `#5E7355` · Venture X `#1B1B1F` · Brilliant `#6B2F3A` · Aspire `#7A2E3B`.

## Design Tokens
Both palettes (all roles semantic — components never reference literal colors):

**Honey (light, default):** bg `#FBF8F0` · surface `#FFFEFB` · surface2 `#F5F1E8` · border `#E8E1D2` · sep `#ECE5D6` · ink `#211D16` · sec `#6F6757` · ter `#9A927F` · accent `#E8680E` · accent-soft `#FBEAD5` · on-accent `#FFF` · deep `#B4550B` · warn `#B4693A` · warn-soft `#F6E9DF` · alert `#C0503F` · track `#E4DECF` · tile `#EDE6D8` · seg `#E9E3D6` · field `#EDE7D9` · chevron `#C9C0AE` · tab-inactive `#A69C86` · glass `rgba(251,248,240,.62)`.

**Onyx (dark):** bg `#17181B` · surface `#212328` · surface2 `#26282C` · border `#2E3036` · sep `#282A2F` · ink `#ECEBE6` · sec `#9C9A93` · ter `#6E6C67` · accent `#F59E3C` · accent-soft `#3A2C17` · deep `#F0B375` · warn `#D18A4E` · warn-soft `#3A2E24` · alert `#DB6650` · track/tile `#2E3036` · seg `#2A2C31` · field `#26282C` · chevron `#54545B` · tab-inactive `#6E6C67` · glass `rgba(22,23,26,.62)`.

Full machine-readable tokens: `tokens.json`.

**Type scale:** large title 34 serif · screen title 26–30 serif · card name 17–19 serif · hero figure 40 mono · stat 30–38 mono · body 15 · sub 12.5–13.5 · mono labels 10–11 uppercase (.05–.07em tracking). All digits tabular.
**Spacing:** 4/8/12/16/20/24; screen inset 16–20; bottom content inset ~110.
**Radius:** pills/buttons 8–12 · inputs 9–11 · tiles 11–14 · cards 16–18 · action bar 22 · sheet 22 · tab bar 30.
**Shadows:** card `0 1px 2px rgba(33,29,22,.05)` · pop `0 10px 26px rgba(33,29,22,.09)` · CTA `0 6px 16px rgba(232,104,14,.22)` · bar `0 10px 30px rgba(33,29,22,.16)` + inner top highlight.

## Assets
- **Fonts:** Source Serif 4, Public Sans, IBM Plex Mono (Google Fonts / expo-google-fonts).
- **Bee logo + Google G:** inline SVGs in the prototype (extract, or use production assets; `react-native-svg`).
- **Icons:** 24px-grid line icons, 1.8–2.2 stroke, round caps (home, checklist, clock, credit-card, bell, search, plus, chevrons, ellipsis). Lucide/Feather match.
- **Card art:** flat brand-color blocks + diagonal gradient overlay + chip rect — no images needed.

## Files
- `OfferBee Mobile.dc.html` — the clickable end-to-end prototype (all 16 screens, both themes, all logic). **Primary reference.**
- `tokens.json` — design tokens (both themes).
- `support.js`, `ios-frame.jsx` — browser runtime for the prototype only. Do not ship.
