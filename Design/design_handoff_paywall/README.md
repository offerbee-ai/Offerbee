# OfferBee — Trial Paywall (Design Handoff)

Trial-end paywall for web + mobile. Shown when a trialing user opens the app (web: full page inside the signed-in shell; mobile: full-screen modal sheet with a close button). Value-forward framing: the paywall proves Pro pays for itself using the user's own trial numbers before asking for money.

## Core rules
1. **Headline is the countdown**: "{N} days left in your trial" (Source Serif 4, 600). N comes from billing state; at 0 the same layout serves as the hard paywall (copy switches to "Your trial has ended").
2. **The ledger is real data, not marketing.** The dark panel ("Your trial so far") lists actual credits the user claimed or was saved from missing during trial, with a mono total (e.g. $112). Line items: name + card + multiplier, right-aligned mono amount. If the user captured $0, hide the ledger and widen the plan column — never show an empty or fake ledger.
3. **Ledger panel is always dark** (#211D16 bg, #F4F0E6 text, #F59E3C accent figures) in both themes — it's a fixed-ink "statement" element, not theme-mapped.
4. **Yearly is the default/featured plan**: 2px accent border, "Best value" badge, listed first, CTA reads "Subscribe yearly — $80/yr". Monthly is the quiet alternative (1px border, surface2 button on web). Savings chip: "save 33%" mono on accent-soft + "$6.67/mo".
5. **Closing line ties ledger to price**: "A year of Pro costs $80 — [less than what OfferBee found in your trial / it pays for itself]."
6. No pressure patterns: close button always available on mobile, "Cancel anytime", "You won't be charged until your trial ends", Restore purchase + Terms links present.

## Files
- `OfferBee Paywall.dc.html` — design source, web (2a) + mobile (2b) screens (open in a browser; keep `support.js` and `ios-frame.jsx` beside it). Tweaks: `daysLeft` (0–14), `theme` (honey/onyx).
- `tokens.json` — OfferBee design tokens.

## Screens
- **2a Web · Trial paywall** — signed-in top bar (logo + "Signed in as … · Sign out"), centered eyebrow "OFFERBEE PRO" (mono 11 uppercase accent) + headline 38 + one-line subcopy. Below, 1fr/1.15fr grid: left = dark trial ledger; right = stacked plan cards (yearly featured w/ badge + accent CTA, monthly w/ outline button) + feature checklist card (3 lines, accent check icons). Footer fine print centered, tertiary 12.
- **2b Mobile · Trial paywall (402×874)** — close circle top-right (32px, surface2), eyebrow + headline 28 + subcopy, condensed ledger card (total in header row, 2 summary line items, pays-for-itself note), two selectable plan rows (radio right edge, 2px accent border + shadow on selected, tap toggles), 3-line feature checklist, pinned bottom CTA (full-width accent, 15px/600) whose label follows the selected plan, fine print 11 tertiary underneath.

## Behavior rules
1. Selecting a plan (mobile rows, web via each card's own button) never charges immediately during trial — subscription starts when trial ends; fine print states this.
2. Mobile CTA label always mirrors selection: "Subscribe yearly — $80/yr" / "Subscribe monthly — $9.99/mo".
3. Mobile close dismisses to the app while trial days remain; when daysLeft = 0 the close is hidden and the sheet is blocking.
4. Ledger amounts and total must reconcile with the Benefits screen's claimed history for the trial window.
5. Copy vocabulary: "claim / captured", never "use / used"; no exclamation marks, no fake urgency.

## Theming
Both themes ship; every surface/text/accent maps via tokens — Honey: bg #FBF8F0 · surface #FFFEFB · surface2 #F5F1E8 · border #E8E1D2 · ink #211D16 · secondary #6F6757 · tertiary #9A927F · accent #E8680E · accent-soft #FBEAD5 · on-accent #FFF. Onyx: bg #131417 · surface #1C1D21 · surface2 #232529 · border #2E3036 · ink #ECEBE6 · secondary #9C9A93 · tertiary #6E6C67 · accent #F59E3C · accent-soft #3A2C17 · on-accent #17140E. Exception: the ledger panel keeps its fixed dark palette in both themes (rule 3). Type: Source Serif 4 titles · Public Sans body · IBM Plex Mono for all prices, totals, eyebrows, and chips.

## Pricing (source of truth for this surface)
Monthly $9.99/mo · Yearly $80/yr ($6.67/mo, save 33%) · 14-day trial · USD.
