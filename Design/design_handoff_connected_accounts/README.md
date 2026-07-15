# OfferBee — Connected Accounts (Design Handoff)

New **Connected Accounts** section for Settings (web + mobile). Lets a user connect a credit-card account (bank aggregator, e.g. Plaid) and link each connected account to a card in their OfferBee wallet so statement credits auto-track from transactions.

## Files
- `OfferBee Connected Accounts.dc.html` — design source. Open in a browser: six labeled states (1a–1f).
- `tokens.json` — OfferBee design tokens (Honey shown; map the same roles to Onyx for dark).
- `support.js` — runtime needed to open the .dc.html file locally.

## States
- **1a Web · Empty** — centered card: link icon in accentSoft circle, serif title "Nothing connected yet", one-line value copy, accent CTA "+ Connect a card", mono reassurance line "READ-ONLY ACCESS · DISCONNECT ANYTIME".
- **1b Web · Connected** — institution card: header (40px brand monogram, name, "4 accounts · connected Jul 2 · 1 not linked", Disconnect in alert color) → one row per bank account → footer CTA + caption.
- **1c Web · Dropdown open** — link selector is a custom popover, NOT a native select.
- **1d Mobile · Empty**, **1e Mobile · Connected** — same vocabulary at mobile density inside Settings.
- **1f Mobile · Link picker** — bottom sheet replaces the dropdown on mobile.

## Component spec

### Account row (web)
- Left: "Credit card" (Public Sans 14.5/600) + mono account number "····0704" (IBM Plex Mono 13, tertiary #9A927F).
- Right: link selector, fixed 280px, radius 10, padding 9×12, chevron-up-down icon.
  - **Linked**: surface bg, border #E8E1D2, card name in ink.
  - **Not linked**: warning treatment — border #E0B48A, bg #FDF6EC, text #B4693A "Not linked — choose a card".
  - **Open**: accent border #E8680E + 3px #FBEAD5 focus ring; sibling rows dim to 55% opacity.

### Link dropdown (1c) — custom popover
- 300px, surface #FFFEFB, border #E8E1D2, radius 14, shadow 0 16px 48px rgba(33,29,22,.18), 6px padding.
- Items radius 9, hover bg #F5F1E8. Current selection has accent checkmark.
- Groups (mono 10px uppercase tertiary labels):
  1. "Not linked" (top, checked when unlinked)
  2. **Your wallet** — cards from the user's wallet. A card already linked to another account is disabled (tertiary) with note "Linked to ····7059" — one card ↔ one account, enforced in UI.
  3. **Add new — {institution}** — catalog cards from this issuer not yet in the wallet; "+" icon, subtext "Adds this card to your wallet". Selecting adds the card AND links it.

### Mobile differences
- Row: two-line left (title / mono number); value on right; unlinked shows warningSoft chip (#F6E9DF bg, #B4693A text).
- Picker is a bottom sheet (radius 22 22 0 0, grabber, dim rgba(0,0,0,.42)): serif title "Link credit card ····0704", subtitle, same three groups, Cancel button. iOS spring-up entrance.
- "+ Connect a card" is a full-width accent button below the institution card.

### Institution header
- Brand monogram (brand color is content — never theme-remapped), name, meta line with account count, connect date, not-linked count.
- "Disconnect" text button in alert (#C0503F); should confirm before removing (dialog: "Disconnect Chase? Auto-tracking stops for 3 linked cards. Your wallet cards and history stay.").

## Behavior notes
- "Connect a card" launches the aggregator flow (Plaid Link or equivalent); on return, render the new institution card with all accounts "Not linked" and prompt linking.
- Auto-match suggestion (nice-to-have): if the aggregator returns the card's product name, preselect the matching wallet card.
- Only credit-card accounts are shown; filter checking/savings.
- Section sits in Settings between Plan and Appearance (web: below the plan banner as in production).

## Tokens used (Honey)
surface #FFFEFB · border #E8E1D2 · separator #ECE5D6 · ink #211D16 · secondary #6F6757 · tertiary #9A927F · accent #E8680E · accentSoft #FBEAD5 · warning #B4693A · warningSoft #F6E9DF (unlinked chip) · alert #C0503F (Disconnect). Radii: card 16–18, selector/button 10–12, popover 14. Type: Source Serif 4 (titles), Public Sans (text), IBM Plex Mono (account numbers, section labels).
