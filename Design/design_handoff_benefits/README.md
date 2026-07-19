# OfferBee — Benefits List Redesign (Design Handoff)

Redesign of the Benefits list (web + mobile) to remove three sources of confusion: mismatched dollar figures (annual value in the title vs per-cycle amount in the AMOUNT column), sub-lines that changed meaning row to row, and a mixed status column (Used pill / +$ / Mark used buttons).

## Core rules
1. **Benefit names never carry a $ prefix.** "Uber Cash", not "$200 Uber Cash". The annual value lives only in the year bar label ("$90 of $200/yr").
2. **One bold number per row = the per-cycle claimable amount**, always labeled: "$15 to claim" with cadence "monthly · resets in 15d". Cadence makes portioning explicit — users know a $200/yr credit is claimed $15 at a time, month by month.
3. **Claimed rows**: struck-through amount, "claimed Jul 5", row dimmed to 65% opacity.
4. **The action is a 28px circle check** (to-do-list metaphor), last column/right edge. Empty (2px #D8CFBC border) = tap to mark claimed; filled accent with white check = claimed (tap/hover to undo). Inside a ≥44px tap zone.
5. Urgent reset countdowns use alert color #C0503F; claimed metadata uses secondary #6F6757.

## Files
- `OfferBee Benefits Redesign.dc.html` — design source, 3 screens (open in a browser; keep `support.js` and `ios-frame.jsx` beside it).
- `tokens.json` — OfferBee design tokens (Honey shown).

## Screens
- **4a Web · Benefits table** — columns BENEFIT / TO CLAIM / YEAR SO FAR / DONE (grid 1.7fr 1fr 1.2fr 60px). Benefit: card-art chip 34×23 + name 14.5/600 + card name 12 secondary. To claim: mono 14/600 amount + "to claim" 11 tertiary, cadence line below. Year so far: 6px progress bar (track #E4DECF, fill accent) + "$91 of $155/yr" (mono bold captured value). Done: circle check right-aligned. Keeps the existing Monthly/Quarterly/Annual/All segmented filter and "$X still available" summary line.
- **6a Mobile · Benefits list** — one-deck rows: chip, name + card, right-aligned amount + cadence, circle check on the right edge. **No year bar in the list** — tapping the row (anywhere except the circle) pushes Credit detail. For quarterly/annual credits the cadence line reads "quarterly · resets Oct 1" / "annual · resets Jan 1".
- **8a Mobile · Credit detail** (row tap target) — hero card: card chip + card name + circle check, mono 38 "$15" + "to claim this month", cadence line, 7px year bar + "$90 of $200/yr captured · 6 of 12 months", full-width accent CTA "Mark claimed for July". Details list: Card (→ card detail), Cycle ("Monthly · $15 per month"), Resets in (alert color), Annual value. "This year" month strip: one bar per elapsed month, filled accent = claimed, honey bg + 1.5px dashed accent = current open month. Footnote: "Unclaimed months don't roll over."

## Behavior rules
1. Circle tap toggles claimed state for the current cycle and updates every total instantly (list summary, dashboard, card totals).
2. Undo is always available: tapping a filled circle un-claims (web shows undo affordance on hover).
3. Row tap (mobile) opens Credit detail; the circle is a separate hit target and must not trigger navigation.
4. Sort actionable-first is allowed but claimed rows stay in the list (dimmed), never hidden.
5. Copy vocabulary: "claim / claimed", never "use / used", everywhere in this surface.

## Tokens (Honey)
surface #FFFEFB · border #E8E1D2 · separator #ECE5D6 · ink #211D16 · secondary #6F6757 · tertiary #9A927F · accent #E8680E · accentSoft #FBEAD5 · alert #C0503F · track #E4DECF · circle-empty border #D8CFBC · active/dim opacity .65. Type: Source Serif 4 titles, Public Sans body, IBM Plex Mono for all numbers + column headers. Copy voice: calm, concrete, no exclamation marks.
