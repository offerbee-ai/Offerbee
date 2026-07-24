# OfferBee Mobile — Navigation Rework + Notifications (Design Handoff)

Scope: mobile app navigation change (4 tabs → 3), Expiring merged into Review, new Notifications screen, Review header actions. Everything else in the mobile app is unchanged.

## Files
- `OfferBee Mobile.dc.html` — full mobile design source, all screens (open in a browser; keep `support.js` and `ios-frame.jsx` beside it). Left rail switches screens; theme toggle switches Honey/Onyx.
- `tokens.json` — OfferBee design tokens.

## 1. Tab bar: 3 tabs
`Review · Benefits · Cards`. The Expiring tab and its standalone screen are **removed**. Glass pill tab bar, icon 25px + 10px/600 label, active = `--accent`, inactive = `--tabin`.

## 2. Review (home) — merged
Order top to bottom:
1. **Header** — eyebrow "JULY 2026" (mono 11, `--ter`, uppercase) + title "Review" (Source Serif 4, 34/600). Right: two 36px outlined circles, `--surface` bg, `1px --border`, `--accent` icons — **bell** then **gear**. The gradient avatar is gone; the gear is the Settings entry (Settings still shows the profile card at its top).
2. **Bell badge** — unread notification count, `--alert` pill, 1.5px `--bg` ring, top-right of the bell. Hidden at 0. Count = unread items in the Notifications list (NOT expiring count) — it must clear when the user marks all read.
3. **Captured value card** — unchanged (hero mono figure, net delta, progress bar).
4. **At a glance** — two rows: "Remaining this month" → Benefits, "Net across your cards" → Cards (mono value, colored by sign). The old "Expiring in ≤3 days" row is gone; expiring is fully shown below.
5. **Expiring section** — section header "Expiring" (mono eyebrow) with the at-risk total right-aligned in `--alert`; `This week / This month` segmented control; urgent list (42px `--warnsoft` day tile, name · amount, card · reset date, `Use` accent button); when the month range is selected, a "Later this month" list follows (`--tile` day tile, `Snooze` outline button); in week range, a footer link "N more credits reset later this month →" switches to month.

Rules: tapping a row opens Credit detail; the row's button (Use / Snooze) must not also trigger the row tap. Credit detail opened from Review backs out to Review.

## 3. Notifications (new, pushed from the bell)
Back link "Review" · title "Notifications" · right action "Mark read" (`--accent` when unread exist, `--ter` when none).

Content: grouped lists in `--surface` cards.
- Group eyebrow: `New · N` while unread remain, plain `New` at zero, then `Earlier`. Never render a zero count.
- Row: 34px rounded glyph tile (expiring = `--warnsoft`/`--warn`, reset = `--accentsoft`/`--accent`, fee = `--tile`/`--sec`), title 14.5 (600 unread / 500 read), body 12.5 `--sec`, timestamp mono 10.5 `--ter`. Right column: 7px `--accent` unread dot + action button.
- Actions: expiring items get a primary `Use` (marks the credit used); reset/fee items get outline `View` / `Details`. Row tap deep-links: credit → Credit detail, reset → Benefits, fee → Card detail.
- Unread rows have a faint accent wash (`rgba(232,104,14,.045)` honey equivalent per theme).
- Bottom row: "Reminder settings" → Settings.
- Empty state: card with "You're all caught up" + "We'll nudge you before any credit resets."

Content sources: expiring notifications derive from credits resetting within 7 days; the reset notification fires at cycle rollover with the newly available monthly total; the fee notification fires ~3 weeks before an annual fee posts and carries captured-to-date.

## Behavior rules
1. `Mark read` sets all items read → unread dots clear, group label drops its count, bell badge disappears.
2. Read state persists per user; new events arrive unread.
3. Push notifications tapped from the OS deep-link to the same targets as the in-app rows.
4. Copy: "claim / captured", never "use up"; no fake urgency; timestamps relative for today ("2h ago"), dated after ("Jun 28").

## Theming
Both themes ship. Honey: bg #FBF8F0 · surface #FFFEFB · border #E8E1D2 · ink #211D16 · sec #6F6757 · ter #9A927F · accent #E8680E · accentsoft #FBEAD5 · warn #B4693A · warnsoft #F6E9DF · alert #C0503F · tile #EDE6D8. Onyx: bg #131417 · surface #1C1D21 · border #2E3036 · ink #ECEBE6 · sec #9C9A93 · ter #6E6C67 · accent #F59E3C · accentsoft #3A2C17 · warn #D18A4E · warnsoft #3A2E24 · alert #DB6650 · tile #2E3036. Type: Source Serif 4 titles · Public Sans body · IBM Plex Mono for amounts, counts, eyebrows, timestamps. Min hit target 44px.
