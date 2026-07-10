# Handoff: OfferBee Web App (post–sign-in)

## Overview
This is the **authenticated web application** for OfferBee — a premium-credit-card benefits tracker. After a user signs in from the marketing site, they land here. The app helps a cardholder see how much statement-credit value they've captured, which credits are about to reset, and whether each card's annual fee is still worth paying.

Scope of this handoff = **the web app only**. The marketing/landing page and the mobile app already exist and are **not** part of this task.

The design ships as a single interactive prototype: `OfferBee Web.dc.html`.

## About the Design Files
The files in this bundle are **design references authored in HTML** — a working prototype that demonstrates the intended look, layout, and interaction behavior. They are **not production code to copy directly**.

`OfferBee Web.dc.html` is a "Design Component" (a proprietary HTML prototype format that depends on the bundled `support.js` runtime). Treat it as a **spec you read and run**, not a source file to lift. It uses:
- An HTML template with lightweight `<sc-for>` / `<sc-if>` control-flow tags for lists and conditional screens.
- A `class Component extends DCLogic { … }` block holding all state and computed values (this is the clearest place to read the data model and business logic).

**The task:** recreate these designs in the target codebase's existing environment (React, Vue, Svelte, etc.) using its established component library, routing, and styling patterns. If no front-end environment exists yet, React + CSS variables (or Tailwind) is a natural fit — the design is already structured around CSS custom properties for theming. Do not ship the `.dc.html` file or `support.js` to production.

To preview the prototype: open `OfferBee Web.dc.html` in a browser (it self-loads `support.js`).

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, and interactions are all specified below and present in the prototype. Recreate the UI faithfully. All copy in the prototype is placeholder-realistic sample data — wire it to real data in implementation.

---

## Global Structure

The app is a classic two-pane shell:

```
┌───────────┬─────────────────────────────────────────┐
│           │  TOPBAR (sticky): eyebrow + page title,  │
│  SIDEBAR  │  search field, "Add card" button         │
│  (248px,  ├─────────────────────────────────────────┤
│  sticky,  │  PAGE CONTENT (padding 30px 34px 56px,   │
│  full     │  max-width 1180px)                        │
│  height)  │  → one of 6 views renders here            │
└───────────┴─────────────────────────────────────────┘
```

- Root: `display:flex; min-height:100vh`. Font family `'Public Sans', sans-serif`. Background `var(--bg)`, text `var(--ink)`. A `transition: background .3s, color .3s` makes theme switches fade.
- **Theming is driven by a `data-theme` attribute** on the root wrapper (`honey` = light default, `onyx` = dark). All component colors reference CSS variables (see Design Tokens), so the entire app re-themes by flipping that one attribute. **Implement theming the same way** (a `data-theme` / `class` on `<html>` or a top wrapper + CSS variables).

### Sidebar (width 248px, `background:var(--surface)`, `border-right:1px solid var(--border)`, sticky, `height:100vh`)
Top → bottom:
1. **Logo lockup** (padding `22px 20px 16px`): 32×32 bee-mark SVG + wordmark "OfferBee" in `'Source Serif 4'` 21px/600, letter-spacing −.01em.
2. **Nav** (padding `8px 12px`, vertical flex, `gap:3px`). Five items: Dashboard, Benefits, Expiring, Cards, Settings.
   - Each row: `display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-radius:11px; font-size:14.5px; cursor:pointer`.
   - Left group: 19px stroke icon (`stroke:currentColor`) + label, `gap:12px`.
   - **Active** state: `color:var(--accent); background:var(--accent-soft); font-weight:600`.
   - **Inactive**: `color:var(--sec); font-weight:500; background:transparent`.
   - Expiring shows a **count badge** (number of credits expiring ≤7d) on the right: `'IBM Plex Mono'` 11px/600, `background:var(--accent-soft); color:var(--accent); padding:2px 7px; border-radius:7px`.
   - Cards item is also "active" when the Card-Detail sub-view is open.
3. **Spacer** (`margin-top:auto`), then a footer block (padding `14px 16px`):
   - **"Net this year" mini-card**: `background:var(--surface2); border:1px solid var(--border); border-radius:14px; padding:13px 14px`. Mono label (10px/600 uppercase, letter-spacing .06em, `var(--ter)`), figure in `'IBM Plex Mono'` 22px/600 `var(--accent)`, caption 11.5px `var(--sec)` ("beating $X in fees").
   - **User row**: 34px circular avatar (gradient `linear-gradient(135deg,#F5B14D,#E8680E)`, white initial), name 13.5px/600 + "Pro · 4 cards" 11.5px `var(--ter)`, and a **theme-toggle button** on the right (34×34, `border-radius:10px; border:1px solid var(--border); background:var(--bg)`, shows a moon icon in Honey / sun icon in Onyx).

### Topbar (sticky, `z-index:20`, padding `16px 34px`, `border-bottom:1px solid var(--border)`)
Glass background: `background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: blur(14px) saturate(160%)`.
- **Title block** (flex:1): mono eyebrow (11px/500, letter-spacing .04em, `var(--ter)`) over the page title in `'Source Serif 4'` 26px/600, letter-spacing −.02em.
- **Search field** (visual only in prototype): `background:var(--surface); border:1px solid var(--border); border-radius:11px; padding:9px 13px; width:250px`, search icon + "Search credits…" placeholder in `var(--ter)`.
- **"Add card" button**: `background:var(--accent); color:var(--on-accent); font-size:14px/600; padding:10px 16px; border-radius:11px; box-shadow:0 6px 16px rgba(232,104,14,.22)`, plus-icon + label.

---

## Screens / Views
The content pane renders exactly one of six views based on a single `page` state value (`dashboard | benefits | expiring | cards | cardDetail | settings`). Each view fades in with `@keyframes obfade { from{opacity:0; transform:translateY(6px)} to{opacity:1; transform:none} }`, `.4s ease`.

Page titles / eyebrows:
- dashboard → eyebrow "Wednesday, July 8", title "Good morning, Maya"
- benefits → "All credits" / "Benefits"
- expiring → "Act before they reset" / "Expiring soon"
- cards → "Fee vs. value" / "Your cards"
- cardDetail → "Card detail" / (card name)
- settings → "Preferences" / "Settings"

### 1. Dashboard
**Purpose:** at-a-glance health of the whole wallet + the most urgent actions.

Includes a **layout switcher** at the top (mono "LAYOUT" label + a segmented control with "A · Focus" / "B · Grid" + helper text). This exists so stakeholders can compare two directions — **in production, pick ONE** (recommend **A · Focus** as the default; B is an alternative). Both render the same data.

**Segmented control** pattern (reused across the app): `background:var(--surface2); border:1px solid var(--border); border-radius:10px; padding:3px`. Selected segment: `background:var(--surface); color:var(--ink); box-shadow:var(--shadow-sm); border-radius:8px; padding:7px 14px; font-size:13px/600`. Unselected: `color:var(--sec); transparent`.

**Layout A — Focus** (`grid-template-columns:1.55fr 1fr; gap:20px`):
- Left column:
  - **Hero "Captured value · 2026" card** (`background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:26px 28px; box-shadow:var(--shadow)`). Mono uppercase label; a "% captured" pill top-right (`background:var(--accent-soft); color:var(--accent); padding:4px 10px; border-radius:8px`); big figure in `'IBM Plex Mono'` 52px/600, letter-spacing −.03em, with "of $X total" beside it in `var(--accent)`; caption line; then a **progress bar** (`height:10px; border-radius:6px; background:var(--track)`, fill `var(--accent)`, `transition:width .5s`).
  - **"Use before they reset" list card**: header (serif 19px/600) + "See all →" link (13px/600 accent, → Expiring). Rows: a 46×46 rounded "days" tile (`background:var(--warn-soft); color:var(--warn)`, mono number + "days"), a 32×22 card-brand color chip, name (14.5px/600) + sub (12.5px `var(--sec)`), and a **Mark used / Used ✓ button** (see button spec).
- Right column:
  - **Two stat tiles** (`grid 1fr 1fr; gap:14px`), each `border-radius:18px; padding:18px`: a 34×34 rounded icon chip, a mono 24px figure, caption. Tile 1 = "$X left this month" (accent icon), Tile 2 = "$X expiring ≤7 days" (warn colored figure + icon).
  - **"Your wallet" summary card**: header + "Manage →" (→ Cards). Rows: 34×23 brand chip, card name + "$fee fee · $captured captured", and right-aligned net (mono 13.5px/600) + verdict label — colored `var(--accent)` for Keep, `var(--warn)` for Review. Whole row clickable → Card Detail.

**Layout B — Grid** (`display:flex; flex-direction:column; gap:20px`):
- **Stat row** of 4 tiles (`grid-template-columns:repeat(4,1fr); gap:16px`). First tile is filled `background:var(--accent); color:var(--on-accent)` ("Captured 2026"); the other three are surface tiles (Net vs fees, This month, At risk ≤7d) with mono 32px figures.
- **Two columns** (`grid 1fr 1fr; gap:20px`): "Use before they reset" list (same rows, 42px tiles) + "Your wallet" list.

### 2. Benefits
**Purpose:** browse and mark every credit, filtered by reset cycle.
- **Filter bar**: segmented control (Monthly / Quarterly / Annual / All) on the left; on the right, "$X still available across N credits" (figure in `var(--ink)` mono, rest `var(--sec)`).
- **Table card** (`border-radius:20px; overflow:hidden; box-shadow:var(--shadow)`): a header row and data rows share `grid-template-columns:1.6fr 1fr .8fr auto; gap:14px; padding:… 24px`.
  - Header: mono 10.5px/600 uppercase `var(--ter)` — "Credit / Card / Cycle / Status".
  - Data row: **col 1** brand chip + name (14.5px/600) + reset sub-line; **col 2** card name (`var(--sec)`); **col 3** amount (mono 13px/600); **col 4** right-aligned Mark used / Used ✓ button.
  - Reset sub-line: if used → "Used this cycle"; if monthly → "$X · resets in Nd"; else "$X · Monthly/Quarterly/Annual". Color turns `var(--alert)` when unused and days ≤ 3, else `var(--sec)`.

### 3. Expiring soon
**Purpose:** triage credits about to reset.
- **Range segmented control** (This week / This month) + "$X at risk" in `var(--alert)` mono/600.
- **Grouped lists.** Groups: "Next 7 days" (label color `var(--alert)`) and "Also soon" / "Later this month" (label `var(--ter)`). Each group has a header (mono uppercase label + right-aligned sum) and a list card.
  - Row: 48×48 "days" tile (urgent ≤7d → `background:var(--warn-soft); color:var(--warn)`; else `background:var(--track); color:var(--sec)`), brand chip (36×24), name (15px/600) + sub, a **Mark used** button, and a **Snooze** button (`font-size:12.5px/600; color:var(--sec); border:1px solid var(--border); padding:8px 13px; border-radius:9px`). Snooze pushes the credit's reset out by 30 days.

### 4. Cards
**Purpose:** fee-vs-value verdict per card.
- **Summary banner** (`border-radius:20px; padding:24px 26px`): "Net across 4 cards" mono label + big net figure (mono 38px/600 `var(--accent)`) + "$X captured · $Y in fees"; on the right, two stats separated by a 1px divider — "3 worth keeping" (accent) and "1 to review" (warn).
- **Card grid** (`grid-template-columns:repeat(2,1fr); gap:18px`). Each card (`border-radius:20px; padding:22px; box-shadow:var(--shadow-sm); cursor:pointer`):
  - Top row: an 88×56 rounded "card art" rectangle filled with the brand color + a `linear-gradient(140deg,rgba(255,255,255,.18),rgba(0,0,0,.15))` overlay, and a **verdict pill** top-right (Keep → accent ink on `--accent-soft`; Review → warn ink on `--warn-soft`).
  - Card name (serif 20px/600) + "$fee / yr" sub.
  - Progress bar (`height:8px`, fill = net color) at `min(100%, captured/fee)`.
  - Footer: "$X captured" (`var(--sec)`) + net figure (mono, net color).
  - Click → Card Detail.

### 5. Card Detail (sub-view of Cards)
**Purpose:** everything about one card.
- **Back link** "‹ All cards" (accent) → Cards.
- **Two columns** (`grid 1fr 1.4fr; gap:22px`):
  - Left: a **172px card visual** (brand color + diagonal gradient overlay, `border-radius:18px; padding:22px`) showing card name (serif, `#F1ECE0`) + a 34×26 chip + terms line (`#DED9CD`). Below it, a **"Captured this year" card**: mono uppercase label + verdict pill; mono 34px figure; progress bar (fill = net color); a net line "+$X over / −$X under the $fee fee" in the net color.
  - Right: **"Credits · N" list card**. Rows: name (14.5px/600) + "Cycle · used/available" sub, a mono progress string ("$X/$X" or "$0/$X"), and a Mark used / Used ✓ button.

### 6. Settings
**Purpose:** account, plan, appearance, notifications.
- **Profile card** (flex): 64px gradient avatar, name (serif 22px/600) + "email · member since 2024", and an "Edit profile" outline button.
- **Plan card**: filled `background:var(--ink); color:var(--bg); border-radius:20px`. Mono uppercase "Current plan", serif 22px "OfferBee Pro", "$4/mo · unlimited cards · renews …", and a **"Manage billing"** accent button.
- **Appearance card**: section label, then a row "Theme / Switch between Honey and Onyx." with a **Honey / Onyx segmented control** (drives the same `theme` state as the sidebar toggle).
- **Notifications card**: section label + rows, each with label + description and a **toggle switch** (see spec). Toggles: Smart reminders, Expiry alerts, Weekly digest, Renewal alerts.
- **Footer actions**: two equal outline buttons — "Export data (CSV)" (`var(--sec)`) and "Sign out" (`var(--alert)`).

---

## Reusable Components & Specs

**Mark used / Used ✓ button**
- Unused: `color:var(--on-accent); background:var(--accent); padding:7px 13px; border-radius:9px; font-size:12.5px/600`. Label "Mark used".
- Used: `color:var(--accent); background:var(--accent-soft); padding:7px 12px; border-radius:9px`. Label "Used ✓".
- Toggling flips the credit's `used` flag; this recomputes all totals live (see State).

**Toggle switch** (Settings)
- Track: `width:44px; height:26px; border-radius:14px; padding:3px; display:flex; transition:background .2s`. On → `background:var(--accent); justify-content:flex-end`; Off → `background:var(--track); justify-content:flex-start`.
- Knob: `width:20px; height:20px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.25)`.

**Segmented control** — spec under Dashboard above; reused for layout switch, benefit filters, expiring range, and theme.

**"Days" tile** — square, rounded 11–12px, centered mono number over an 8–8.5px "days" caption. Urgent (≤7d) uses warn colors; otherwise track/secondary.

**Card-brand color chips** — small rounded rects filled with the card's brand color. Brand colors are **outside the theme** and never change: Amex Platinum `#3A4048`, Amex Gold `#B08A3E`, Sapphire Reserve `#1E6FB8`, Hilton Aspire `#7A2E3B`.

**Icons** — 19px line icons, 1.8 stroke width, `stroke:currentColor`, rounded caps/joins (Feather-style). Nav: home, list-check, clock, credit-card, gear. Also: sun/moon (theme), plus (add), search, chevron-left (back). Use the codebase's existing icon set (e.g. lucide/feather) — do not ship raw SVG unless needed.

---

## Interactions & Behavior
- **Navigation:** clicking a sidebar item, a "See all →" / "Manage →" link, or the "Add card" button sets `page`. "Add card" currently routes to Cards (no picker modal yet — see Open Items).
- **Mark used:** toggles a credit's `used` flag. Immediately recomputes: captured total, % captured, net-vs-fees, "left this month", "at risk ≤7d", each card's captured/net/verdict, and the expiring lists. This live recompute is the core delight — preserve it.
- **Snooze** (Expiring): adds 30 to the credit's `days` (pushes it out of the urgent window).
- **Theme toggle:** flips `theme` between `honey`/`onyx` (from sidebar button OR Settings segmented control). Drives the `data-theme` attribute; CSS variables do the rest. The `.3s` background/color transition applies.
- **Layout switch** (Dashboard): `dashLayout` `A`/`B`. Production should keep one.
- **Card row / card tile click:** sets `selectedCardId` and opens Card Detail.
- **Filters:** `benefitFilter` (monthly/quarterly/annual/all) filters the Benefits table; `expiringRange` (week/month) sets the horizon for Expiring.
- **Animations:** view fade-in `obfade .4s ease`; progress bars `transition:width .5s`; toggle `.2s`; theme `.3s`.

## State Management
All state lives in one component in the prototype; map to your app's conventions (store, context, route params, server data).

State variables:
- `page` — current view (`dashboard | benefits | expiring | cards | cardDetail | settings`).
- `theme` — `honey | onyx`.
- `dashLayout` — `A | B` (drop in production).
- `selectedCardId` — which card the Detail view shows.
- `benefitFilter` — `monthly | quarterly | annual | all`.
- `expiringRange` — `week | month`.
- `settings` — `{ reminders, weekly, expiryPush, renewalAlert }` booleans.
- `credits[]` — the source of truth (see Data Model). Everything else is **derived**.

Derived values (compute, don't store): per-card captured/net/verdict, wallet totals (captured, total, %, fees, net), "remaining this month", "at risk ≤7d", filtered benefit list, grouped expiring lists, nav badge count.

### Data Model
Each **credit**: `{ id, name, card (display), cardId, color (brand hex), amount (number), cycle ('monthly'|'quarterly'|'annual'), used (bool), days (number until reset) }`.
Each **card** (base): `{ id, name, color (brand hex), fee (number), terms (string) }`.

Computation rules:
- `captured` = sum of `amount` where `used`. `total` = sum of all `amount`. `pct = round(captured/total*100)`.
- `fees` = sum of card `fee`. `net = captured − fees`.
- per-card `captured` = sum of that card's used credit amounts; `cardNet = captured − fee`; **verdict** = `cardNet >= 0 ? 'Keep' : 'Review'`.
- "left this month" = sum of unused **monthly** credit amounts.
- "at risk ≤7d" = sum of unused credits with `days <= 7`; the nav badge is the **count** of those.
- Expiring horizon: week = 7 days, month = 31 days. Group "Next 7 days" (`days<=7`) vs later.

The prototype ships realistic **sample data** (Maya Okafor; Amex Platinum/Gold, Sapphire Reserve, Hilton Aspire; ~19 credits). Replace with real user data — the layout adapts to any counts.

## Design Tokens

Theme is semantic — components reference roles, not literal colors. Two themes swap by remapping these variables.

**Honey (light, default)**
```
--bg:          #FBF8F0   app / page background
--surface:     #FFFEFB   cards, list groups
--surface2:    #F5F1E8   inset controls (segmented bg, mini-card)
--border:      #E8E1D2   hairlines, card borders
--sep:         #ECE5D6   in-card row separators
--ink:         #211D16   primary text / figures
--sec:         #6F6757   secondary text
--ter:         #9A927F   labels, hints, chevrons
--accent:      #E8680E   actions, selected, progress, positive
--accent-soft: #FBEAD5   tinted chips, "used" badge, success bg
--on-accent:   #FFFFFF   text/icon on accent fills
--warn:        #B4693A   expiring soon, low ROI
--warn-soft:   #F6E9DF   warn backgrounds/tiles
--alert:       #C0503F   at-risk this week
--track:       #E4DECF   progress-bar track, neutral tiles
--shadow:      0 1px 2px rgba(33,29,22,.05), 0 10px 28px rgba(33,29,22,.06)
--shadow-sm:   0 1px 2px rgba(33,29,22,.06)
```

**Onyx (dark)**
```
--bg:          #131417
--surface:     #1C1D21
--surface2:    #232529
--border:      #2E3036
--sep:         #292B30
--ink:         #ECEBE6
--sec:         #9C9A93
--ter:         #6E6C67
--accent:      #F59E3C
--accent-soft: #3A2C17
--on-accent:   #17140E
--warn:        #D18A4E
--warn-soft:   #332A20
--alert:       #DB6650
--track:       #2E3036
--shadow:      0 1px 2px rgba(0,0,0,.35), 0 14px 34px rgba(0,0,0,.4)
--shadow-sm:   0 1px 2px rgba(0,0,0,.35)
```

**Card-brand colors (theme-independent):** Amex Platinum `#3A4048` · Amex Gold `#B08A3E` · Sapphire Reserve `#1E6FB8` · Hilton Aspire `#7A2E3B`.

**Typography** (Google Fonts)
- `'Source Serif 4'` (600) — display / titles. Weights 400–700 loaded.
- `'Public Sans'` (400–700) — all UI / body text.
- `'IBM Plex Mono'` (400–600) — every number/figure and small uppercase labels, so figures align like a statement.
- Type scale seen: large title 26px (serif), section title 19px (serif), hero figure 52px / stat 32–38px / card figure 24–34px (mono), body 14–15px, sub 12–13.5px, mono labels 10–11px uppercase with .04–.06em tracking.

**Spacing scale:** 4 · 8 · 12 · 16 · 20 · 24. Screen inset 30/34px. Card padding 18–28px. Row padding ~13–15px × 20–24px. Gaps 14–22px.

**Radius:** badges/pills 7–9px · buttons/chips/segments 8–11px · cards 18–20px · avatar/toggle 50%/pill. **Progress bars** 5–6px.

## Assets
- **Fonts:** Google Fonts — Public Sans, Source Serif 4, IBM Plex Mono. Load via the codebase's font pipeline.
- **Logo:** the OfferBee bee-mark is an inline SVG (amber gradient `#FFB300→#FF6D00` rounded square with a stylized bee). It appears in the sidebar (32px). Extract from the prototype or request the official asset from the OfferBee team.
- **Icons:** line icons — use the codebase's existing icon library (lucide / feather match the style).
- **Card art:** solid brand-color rectangles with a diagonal light/dark gradient overlay — no external images.
- No photographic or raster assets are required.

## Files
- `OfferBee Web.dc.html` — the interactive design prototype (all six views, both themes, both dashboard layouts, all interactions). **Primary reference.** Read the `<script … data-dc-script>` block for the exact data model and computation logic.
- `support.js` — runtime required only to *run* the prototype in a browser. **Not for production.**

## Open Items (intentionally not built)
- **Search** field is visual only — implement real credit search/filter.
- **Add card** routes to the Cards page — needs a card-picker modal/flow (65+ cards per the marketing site).
- **Edit profile / Manage billing / Export CSV / Sign out** buttons are visual — wire to real flows.
- Pick **one** dashboard layout (recommend A · Focus) for production.
- No responsive/mobile breakpoints defined — the prototype targets desktop widths (~1180px content max). Add responsive behavior per your app's needs (the mobile app covers small screens separately).
