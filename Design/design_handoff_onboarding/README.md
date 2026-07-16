# Handoff: OfferBee User Onboarding (Web + Mobile)

## Overview
First-run onboarding for OfferBee (offerbee.ai) — a premium-credit-card benefits tracker. The flow takes a new user from sign-up to their first "aha" moment (the dollar value of credits about to expire in their wallet) in 5 steps:

1. **Account** — the existing Clerk sign-up (unchanged)
2. **Wallet** — pick cards from a catalog (no bank login, ever)
3. **Spending** — pick spending categories to prioritize credits
4. **Reminders** — notification preferences, with a live sample push notification
5. **Review** — the reveal: "$X is about to slip away" + expiring-credits list + setup summary

Two implementations of the same flow are specified: **web** (sidebar wizard, option `1a` in the design file) and **iOS mobile** (horizontal stepper + floating action bar, option `2a`).

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, **not production code to copy directly**. The task is to **recreate these designs in the target codebase's existing environment** (e.g. the offerbee.ai web stack for web; SwiftUI/React Native for mobile) using its established patterns and libraries. If no environment exists for a surface yet, choose the most appropriate framework and implement the designs there.

Open `OfferBee Onboarding.dc.html` in a browser to click through both flows live. `support.js` and `ios-frame.jsx` are prototype runtime/frame helpers only — never ship them.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, copy, and interactions are final. Recreate pixel-perfectly, mapping values onto your design tokens where they already exist (this design uses the OfferBee "Kept/Honey" system already in production).

## Critical Integration Note: Auth Is Clerk
Step 1 is the **existing Clerk `<SignUp />` component, unchanged** (Google OAuth + email/password, "Secured by Clerk" footer). Do NOT rebuild it. Instead:
- Route: `/welcome` (or post-signup redirect) hosts the wizard shell; the Clerk component renders inside step 1 with the wizard chrome around it (sidebar on web / stepper header on mobile).
- Hide the wizard's own footer/action bar on step 1 — Clerk's Continue is the only CTA. On successful sign-up (Clerk `afterSignUp` / session created), advance to step 2.
- Style Clerk via its `appearance` prop to match: card radius 16px, primary button `#E8680E` (radius 9px), input borders `#E3DCCB`, radius 8px. On the prototype's card: heading 19px/700, subtitle 13.5px `#8A8272`.

## Screens / Views

### Shared wizard shell — Web (1280px+ desktop)
- App frame: full viewport, background `#FBF8F0`.
- **Left rail**: 296px fixed, background `#FFFEFB`, right border 1px `#E8E1D2`, padding 26/18/18.
  - Brand row: bee logo 30px + "OfferBee" in Source Serif 4, 20px/600, letter-spacing -0.01em.
  - **Step list** (5 items): each row = 28px circle + label (14.5px/600), padding 10px, radius 11px. States:
    - *Done*: circle filled `#E8680E`, white check icon; label ink `#211D16`.
    - *Current*: circle filled `#E8680E` with white number (IBM Plex Mono 11px/600); row background `#FBEAD5`; label ink.
    - *Todo*: circle 1.5px border `#E8E1D2`, number `#9A927F`; label `#9A927F`.
    - Rows are clickable → jump to that step.
  - **"Credits in play" counter** pinned to rail bottom: card background `#F5F1E8`, border `#E8E1D2`, radius 16px, padding 16px. Label "CREDITS IN PLAY" (IBM Plex Mono 10px/600, uppercase, letter-spacing .06em, `#9A927F`); value in IBM Plex Mono 28px/600 `#E8680E`; caption 12.5px `#6F6757`. **Updates live as cards are toggled in step 2.**
- **Content pane**: flex-1, scrollable, padding 44px 54px.
- **Footer bar** (hidden on step 1): top border `#E8E1D2`, background `#FFFEFB`, padding 16px 54px. Left: "Step X of 5" (IBM Plex Mono 12px `#9A927F`). Right: Back (outline: 1px `#E8E1D2`, `#6F6757`, 14px/600, padding 11/18, radius 11) + Continue (fill `#E8680E`, white, padding 11/22, radius 11, shadow `0 6px 16px rgba(232,104,14,.22)`). Continue label on final step: "Enter OfferBee →".

### Shared wizard shell — Mobile (iOS, 402×874 reference)
- Background `#FBF8F0`.
- **Header** (below status bar, padding 58/20/12, bottom border `#ECE5D6`): brand row (logo 24px + "OfferBee" Source Serif 17px/600) + right-aligned "Step X of 5" (IBM Plex Mono 11px `#9A927F`).
- **Horizontal stepper** under brand row: 5 equal-width columns, each a 24–28px circle (same three states as web rail) above a 9.5px/600 label. Tappable to jump.
- **Content**: scrollable, padding 20px, bottom padding 130px (clears action bar). Scrollbars hidden.
- **Floating action bar** (hidden on step 1): absolute, 16px from left/right/bottom, radius 22px, padding 12px 16px. Liquid-glass material: `rgba(251,248,240,.72)` + `backdrop-filter: blur(20px) saturate(170%)`, border `rgba(255,255,255,.55)`, shadow `0 10px 30px rgba(33,29,22,.16), inset 0 1px 0 rgba(255,255,255,.6)` (same recipe as the app's tab bar). Contents: left = live counter (IBM Plex Mono 15px/600 `#E8680E` + "credits in play" 10px `#6F6757`); right = Back (outline) + Continue (fill), 13.5px/600, radius 12px. Min touch height 44px.

### Step 1 — Account (Clerk)
- Web: Clerk card (400px wide) centered in the content pane; helper caption below in IBM Plex Mono 11px `#B4A88E`.
- Mobile: Clerk card full-width.
- See "Critical Integration Note" above. Card anatomy (for appearance mapping): white card, border `#EAE3D4`, radius 16, shadow `0 12px 44px rgba(33,29,22,.09)`; "Continue with Google" outline button; "or" divider; Email + Password labeled fields (13px/600 labels); orange Continue; "Already have an account? Sign in" row; "Secured by clerk" footer strip on `#FAF6EE`.

### Step 2 — Wallet ("Which cards are in your wallet?")
- Headline: Source Serif 4 — web 32px/600, mobile 26px/600, letter-spacing -0.02em. Eyebrow (web): "STEP 02 · YOUR WALLET" IBM Plex Mono 11px/600 uppercase `#9A927F`.
- **Popular card tiles**: grid — web 3 columns / mobile 2 columns, gap 14px/12px. Tile: background `#FFFEFB`, padding 12px, radius 14px, border 1px `#E8E1D2`; selected → border `#E8680E` + ring `0 0 0 3px #FBEAD5`.
  - Card art block: height 76px (web) / 62px (mobile), radius 10px, background = card brand color, gradient overlay `linear-gradient(140deg, rgba(255,255,255,.16), rgba(0,0,0,.2))`, EMV chip rect `rgba(255,255,255,.3)`.
  - Selected check: 24px circle `#E8680E` top-right of art with white check.
  - Below art: card name 14px/600; meta line 12px `#6F6757` — "$695/yr · $1,400 value".
- **Search field** below grid: icon + input, placeholder "Search Chase, Citi, Capital One…", border `#E8E1D2`, radius 12px, background `#FFFEFB`.
- **Search results**: card list (radius 14px container), rows: 34×23 color swatch + name (14px/600) + issuer/fee (12px `#6F6757`) + Add/Added button. Add = fill `#E8680E` white; Added = `#FBEAD5` bg, `#E8680E` text. Row separators 1px `#ECE5D6`. Empty state: "No cards match — try an issuer name."
- Toggling any card updates the live counter (rail on web, action bar on mobile) with the sum of that card's annual credit value.

### Step 3 — Spending ("What do you actually spend on?")
- Category chips (9): Dining, Travel, Groceries, Streaming, Rideshare, Hotels, Airlines, Shopping, Wellness. Chip: 14px/600, padding 9px 15px, radius 11px; unselected = `#FFFEFB` bg, `#E8E1D2` border, ink text; selected = `#E8680E` bg + border, white text. Wrap layout, gap ~10px.
- **Live feedback pill** below chips (updates on every toggle): background `#FBEAD5`, radius 11px, padding 11px 16px; plus-star icon `#E8680E`; text 14px/600 `#B4550B` — "Nice — {n} matching credits move to the top of your feed." When zero categories: "Pick a few — we'll rank every credit around them."

### Step 4 — Reminders ("Never miss a reset.")
- **Sample notification preview** ("WHAT A NUDGE LOOKS LIKE" label): iOS-notification-style card — bee app icon 30–32px, "OFFERBEE" (IBM Plex Mono 10px/600) + "now", headline 14px/600, body 12.5px `#6F6757`. Card: `#FFFEFB`, border `#E8E1D2`, radius 16px, shadow `0 10px 26px rgba(33,29,22,.09)`.
  - **Content is dynamic**: built from the user's soonest-expiring selected card, e.g. "Dining credit resets in 2 days" / "Use your $10 Amex Gold credit before it disappears."
  - Dims to 35% opacity (250ms transition) when "Expiry alerts" is toggled off.
- **Toggle list** (4 rows in one card container, separators `#ECE5D6`): Expiry alerts / Weekly digest / Renewal alerts / Smart reminders — title 15px/600 + description 12.5px `#6F6757`. Switch: 44×26 track, radius 14, on = `#E8680E`, off = `#E4DECF`; 20px white knob, shadow `0 1px 3px rgba(0,0,0,.25)`. Defaults: on, on, off, on.

### Step 5 — Review (the reveal)
- Eyebrow "YOU'RE ALL SET" in `#E8680E`. Headline: "{$X} is about to slip away." — Source Serif 38px/600 web, 30px mobile. `$X` = sum of the user's selected cards' credits expiring ≤7 days.
- Sub: "{n} credits reset within a week across your wallet. This is what OfferBee will surface the moment you sign in."
- **Expiring list** (card container): rows = countdown tile (46px square, radius 12; ≤7 days: bg `#F6E9DF`, text `#B4693A`; else bg `#E4DECF`, text `#6F6757`; days number IBM Plex Mono 16px/600 + "days" 8.5px) + card color swatch + credit name (15px/600) / card name (12.5px `#6F6757`) + amount (IBM Plex Mono 15px/600 `#E8680E`). Sorted by days ascending, max 5.
- **Summary strip** below list: background `#F5F1E8`, border `#E8E1D2`, radius 14px, padding 16px 24px; three stats separated by 1px vertical rules — "{n} cards added", "{$total} tracked per year" (value in `#E8680E`), "{k} of 4 reminders on". Numbers IBM Plex Mono 20px/600 (16px mobile).
- Footer Continue reads "Enter OfferBee →" and routes to the main app dashboard.

## Interactions & Behavior
- **Navigation**: Continue/Back move linearly; step list (web) and stepper (mobile) allow jumping to any step. Completed steps show checkmarks. Steps 1 & 5 hide Back; step 1 hides the whole footer/action bar (Clerk owns the CTA).
- **Live counter**: recomputed on every card toggle = Σ selected cards' annual credit value; formatted `$1,820`.
- **Card toggle**: instant visual state change (border, ring, check badge, Add→Added). No confirmation.
- **Search**: filters on substring match against card name OR issuer, case-insensitive; results appear only while query non-empty.
- **Category toggle**: instant chip fill + feedback-pill text update.
- **Notification toggle "Expiry alerts"**: dims the sample notification (opacity 1 → .35, 250ms ease).
- Step transition animation (web): content fades/slides up ~6px, 400ms ease (`obfade` keyframes in the file).
- All buttons are div-styled in the prototype — implement as real `<button>`s with focus states matching the hover treatments.

## State Management
- `step: 0–4`
- `selectedCards: Set<cardId>` — drives counter, reveal list, notification preview
- `categories: Set<categoryKey>` — drives feedback pill; persist for feed ranking
- `notifications: { expiry, digest, renewal, smart }: boolean` — defaults true/true/false/true; persist to user preferences
- Auth state from Clerk; onboarding completion flag on the user record so the wizard shows only once.
- Card catalog (id, name, issuer, annual fee, brand color, annual credit value, per-credit reset schedule) comes from the backend card database (prototype uses a 12-card sample).

## Design Tokens (Honey theme — matches existing OfferBee system)
Colors:
- Background `#FBF8F0` · Surface `#FFFEFB` · Surface-2 `#F5F1E8`
- Border `#E8E1D2` · Separator `#ECE5D6` · Track `#E4DECF`
- Ink `#211D16` · Secondary `#6F6757` · Tertiary `#9A927F`
- Accent `#E8680E` · Accent-soft `#FBEAD5` · Accent-deep (pill text) `#B4550B`
- Warning `#B4693A` · Warning-soft `#F6E9DF`

Typography:
- Source Serif 4 (600) — headlines/brand. 38/32/30/26px scale.
- Public Sans (400–700) — all UI text. 15/14/13.5/12.5/12px scale.
- IBM Plex Mono (500–600) — every number, step labels, eyebrows (11px/600, uppercase, letter-spacing .05–.07em).

Spacing: 4/8/12/16/20/24 scale; content padding 44×54 (web) / 20 (mobile).
Radius: inputs 8–12 · buttons/chips 9–12 · cards/tiles 14–16 · action bar 22.
Shadows: card `0 1px 2px rgba(33,29,22,.05)` · pop `0 10–12px 26–44px rgba(33,29,22,.09)` · CTA `0 6px 16px rgba(232,104,14,.22)`.
Glass (mobile bars): `rgba(251,248,240,.72)` + `blur(20px) saturate(170%)` + inner top highlight.

## Assets
- **Bee logo**: inline SVG in the design file (amber gradient rounded square + white bee). Use the production OfferBee logo asset.
- **Google G**: standard Google brand mark (rendered by Clerk in production — no asset needed).
- **Icons**: all inline stroke SVGs, 24px grid, 1.8–2.2 stroke, round caps (search, check, eye, lock, plus-star). Map to your icon library.
- **Card art**: flat brand-color blocks with gradient overlay + chip — no real card imagery required.

## Files
- `OfferBee Onboarding.dc.html` — the interactive prototype. Turn 2 / `2a` = mobile flow (iPhone frame); Turn 1 / `1a` = web sidebar wizard. All five steps clickable in both.
- `support.js` — prototype component runtime (reference only, do not ship).
- `ios-frame.jsx` — iPhone bezel used for presentation (reference only, do not ship).
