# Handoff: OfferBee — Credit Benefits Tracker (mobile)

## Overview
OfferBee is an iOS app for tracking premium credit-card **benefits and statement credits** — what's still available this period, what's expiring, and whether each card's annual fee is earning its keep. The core loop is a calm **monthly review**: see captured value vs. fees, use credits before they reset, and make keep/downgrade renewal decisions. No bank login; credits are tracked manually or via CSV import.

## About the Design Files
The files in this bundle are **design references created in HTML** (Design Components — `.dc.html`, a small React runtime). They are prototypes showing the intended look and layout — **not production code to copy directly.**

The task is to **recreate these designs in the target codebase's environment**, using its established patterns and libraries. This is a native iOS app following iOS 26 (Liquid Glass) conventions, so **SwiftUI is the natural target** (`NavigationStack` large titles, `List` with `.insetGrouped` style, `.searchable`, `Picker(.segmented)`, `TabView`, `.ultraThinMaterial`). If building cross-platform (React Native / Flutter), replicate the same structures with the platform's grouped-list and blur primitives. Do not ship the HTML.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, and component states are specified below and in `tokens.json`. Recreate pixel-close using the codebase's native components. The two themes (Honey / Onyx) should map to light/dark appearance.

## Design Language (summary)
- **Layout:** iOS Human Interface Guidelines — large collapsing navigation titles, inset-grouped lists with leading-aligned hairline separators, uppercase mono section headers, a **floating Liquid-Glass tab bar** (content scrolls beneath), segmented controls, search fields.
- **Type system ("Ledger"):** Source Serif 4 for titles, Public Sans for all UI/body, IBM Plex Mono for every number and small label. All figures use tabular/monospaced digits so columns align like a statement. (On native iOS you may substitute New York for the serif and SF Mono for the mono if custom fonts aren't desired — but the shipped design uses the three families above.)
- **Themes:** Honey (light, warm off-white paper + amber accent) and Onyx (dark, amber accent). See `tokens.json` for the full two-theme palette.

## Screens / Views
All screens are 402×874 (iPhone). Screen padding 16px; inset groups full-width within padding; floating tab bar pinned ~14px from bottom.

### 1. Review (home)
- **Purpose:** The monthly-review landing — overall standing at a glance.
- **Layout:** Large title "Review" with a mono eyebrow date; trailing circular glass "+" button. Scrolling column: (a) hero **surface card** — mono eyebrow "CAPTURED VALUE · 2026", figure `$2,050` (mono 40) with `+$330` accent delta, subtext, then a full-width **progress bar** (84%, accent fill on `track`) with mono end-labels; (b) **inset group "AT A GLANCE"** — two rows (Remaining this month → `$285`; Expiring in ≤3 days → `$40` in warning), each with a soft-tinted leading icon chip + trailing value + chevron; (c) **inset group "USE BEFORE THEY RESET"** — rows with card-art swatch, title + subtitle, trailing "Use" text button; tertiary footer line.
- **Copy:** exact text as above.

### 2. Benefits
- **Purpose:** Every credit across cards, by reset cycle; mark used.
- **Layout:** Large title "Benefits" + trailing filter glass button. **Search field** ("Search credits"). **Segmented control** Monthly / Quarterly / Annual. A progress summary card ("July · captured — $185 / $285", 65%). Inset group "MONTHLY CREDITS · 5": rows = card-art swatch + title + subtitle (card · $amount · reset), trailing pill — accent **"Mark used"** (available) or soft **"Used ✓"** (done); warning subtitle for expiring. Footer: "$100 still available across 3 credits."

### 3. Card detail
- **Purpose:** One card's fee ROI + all its credits.
- **Layout:** Inline nav bar — back ("Cards"), centered card name, trailing ellipsis. Card-art hero (dark for Platinum) with fee + renewal date. "CAPTURED THIS YEAR" surface card: `$840` of `$695`, accent **Keep** badge, full progress bar, "+$145 over the fee". Inset group "CREDITS · 6": rows with title, subtitle (cycle · status), trailing mono `$used/$total` + chevron; some rows show a mini progress bar; expiring items in warning.

### 4. Expiring
- **Purpose:** Countdown reminders.
- **Layout:** Large title "Expiring" + trailing bell button. Segmented This week / This month. Section "THIS WEEK" (alert-colored label + "$40 at risk"): rows with a **countdown tile** (warning-soft, mono number + "days"), title + subtitle, trailing accent "Use". Section "LATER THIS MONTH": neutral countdown tiles, trailing outline "Snooze".

### 5. Cards wallet
- **Purpose:** All cards + portfolio net; entry to fee review.
- **Layout:** Large title "Cards" + trailing "+". Summary card: "NET ACROSS 4 CARDS" `+$330` (accent), "$2,050 captured · $1,720 in fees". Inset group "YOUR WALLET": rows = card-art thumb + name + subtitle (fee · captured), trailing net (accent if positive, warning if negative) + keep/review verdict + chevron.

### 6. Add a card
- **Purpose:** Add from catalog or CSV.
- **Layout:** Header with "Cancel" (tertiary) + "Import CSV" (accent), title "Add a card". Search field ("Search 65+ premium cards"). Brand **filter chips** (All active = accent, others outline). Inset group "POPULAR": rows = card-art thumb + name + subtitle (fee · N credits), trailing accent **"Add"** or soft **"Added ✓"**. Footer: "No bank login required — credits are tracked manually." (No tab bar — presented as a modal sheet.)

## Interactions & Behavior
- **Tab bar:** 4 tabs (Review, Benefits, Expiring, Cards) — selected uses `accent`, rest `tertiary`. Floating glass; content scrolls under it (bottom content inset ≈ 98px).
- **Mark used / Use:** toggles a credit's state available→used (updates progress + "captured" totals + the Review "use before reset" list). Snooze dismisses a reminder for the period.
- **Segmented controls:** filter the list in place (Monthly/Quarterly/Annual; This week/This month).
- **Add / Added:** adds a card to the wallet; button flips to soft "Added ✓".
- **Navigation:** Cards wallet row → Card detail (push). Add-a-card is a modal sheet. Standard iOS push/pop + large-title collapse on scroll.
- **Transitions:** native iOS defaults; progress bars animate width on state change (~250ms ease-out).

## State Management
- `cards[]`: { id, name, artColor, annualFee, renewalDate, credits[] }
- `credits[]`: { id, cardId, name, amount, cycle (monthly|quarterly|semiannual|annual|anniversary), resetDate, status (available|used), enrolled }
- Derived: capturedThisYear, feesTotal, netByCard, remainingThisPeriod, expiringSoon[], keep/review verdict per card (captured ≥ fee ⇒ Keep).
- `theme`: forest | onyx (bind to system light/dark).
- Actions: markUsed(creditId), snooze(creditId), addCard(catalogId), importCsv(file).
- Data is local/manual; CSV import parses a wallet sheet. No live transaction feed.

## Design Tokens
Full tokens (both themes, typography, spacing, radius, elevation, iconography) are in **`tokens.json`**. Key values — Honey: bg `#FBF8F0`, surface `#FFFEFB`, border `#E8E1D2`, ink `#211D16`, secondary `#6F6757`, tertiary `#9A927F`, accent `#E8680E`, accent-soft `#FBEAD5`, warning `#B4693A`, alert `#C0503F`. Radii: badge 8, chip/button 11, card 16–18, tab bar 30. Glass: surface @ 60% + blur 22 + inner top highlight + soft shadow. Type sizes: large title 34 (serif), title 24, figure 40/30 (mono), body 15, subtext 12.5, section label 11 (mono uppercase).

## Assets
- **Fonts (Google Fonts, open-license):** Source Serif 4, Public Sans, IBM Plex Mono.
- **Icons:** custom outlined set on a 24px grid, 1.8 stroke, round caps/joins (home, checklist, clock, credit-card, search, plus, chevron, ellipsis, bell). Reproduce with SF Symbols equivalents (house, checklist, clock, creditcard, magnifyingglass, plus, chevron.right, ellipsis, bell) or the inline SVGs in the HTML.
- **Card art:** solid brand-tone rectangles (placeholders) — replace with real card artwork. These colors are content, NOT theme tokens.
- No raster images; everything is CSS/SVG.

## Files
- `Rewards App.dc.html` — all six screens in both themes (Honey + Onyx) on a canvas. Primary visual reference.
- `Kept Design System.dc.html` — the design-system spec (foundations + components).
- `OfferBee Landing.dc.html` — the marketing landing page (desktop web), built on the same tokens.
- `tokens.json` — machine-readable design tokens.
- `ios-frame.jsx`, `doc-page.js`, `support.js` — runtime/scaffold for the HTML prototypes (reference only; not part of the app).
- `screenshots/honey.png`, `screenshots/onyx.png` — rendered overviews of all screens in each theme.

To view the prototypes: open the `.dc.html` files in a browser (they self-mount).
