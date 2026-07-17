# OfferBee — Unified Card-Add Flow (Design Handoff)

Reconciles the two card-add paths: **Plaid bank-connect is the preferred path everywhere, manual catalog search is the fallback.** No silent auto-add — every Plaid connect ends on a review screen where the user confirms detected cards.

## Files
- `OfferBee Card Add.dc.html` — design source. Open in a browser: 8 labeled states.
- `tokens.json` — OfferBee design tokens (Honey shown).
- `support.js` — runtime needed to open the .dc.html locally.

## States
- **1a Mobile · Onboarding gate** — Step 02 (Wallet) of the 5-step wizard becomes a Plaid-first gate: stepper header (step 2 current), link icon in accentSoft circle, serif title "Connect your bank", copy "We'll find your cards and track their credits automatically.", full-width accent CTA "Connect with Plaid", skip link "I'll add my cards manually →", mono reassurance "READ-ONLY ACCESS · DISCONNECT ANYTIME". Floating action bar hidden on this step (like the Clerk step).
- **1b Web · Onboarding gate** — same in the sidebar wizard: rail left (02 active, active row bg #F5F1E8), mono "Step 02 · Your wallet", serif 32 title, centered 400px gate card. "Credits in play" sidebar stat shows $0 / "connect to find out".
- **1c Mobile · Fallback** — the EXISTING manual card-picker step, unchanged, with an ink toast on top: "Couldn't connect — pick your cards manually instead." (icon in #F5B14D). Same screen without toast when the user skips the gate.
- **2a Web / 2b Mobile · Add-card chooser** — "+ Add card" opens a two-path chooser: primary card "Connect your bank" (1.5px accent border + 3px #FBEAD5 ring, link icon, "Recommended" tag in accentSoft/#B4550B) and secondary "Search manually" ("Pick from 65+ cards."). Mobile is a bottom sheet; "Search manually" opens the existing catalog sheet unchanged.
- **3a Web · Review "We found your cards"** — institution header (Chase monogram, "3 credit cards found"). Matched rows: accent check circle (22px), card-art chip (36×24, brand color — content, never theme-remapped), name + mono mask, mono "MATCHED" label. Ambiguous row: warning treatment (border #E0B48A, bg #FDF6EC, text #B4693A), dashed "?" chip, reported name "Ultimate Rewards® ····9911", subtext "Chase didn't say which card this is.", action "Choose which card →". Footer: accent CTA "Add 2 cards" + caption "Uncheck anything you don't want. You can link the rest later in Settings."
- **3b Web · Review, picker open** — reuses the grouped popover from Connected Accounts: 300px, groups "Your wallet" (already-matched cards disabled with "Matched ····0704") and "Add new — Chase" (+ icon, subtext "Adds this card to your wallet"). Resolving checks the row; CTA count updates ("Add 3 cards").
- **3c Mobile · Review** — same review at mobile density with the bottom-sheet picker open: title "Which card is ····9911?", subtitle with the bank-reported name, same two groups, Cancel.

## Behavior rules
1. Gate skip → manual picker. Any Plaid failure → manual picker with the toast. Never a dead end.
2. Every successful Plaid connect (onboarding or in-app) lands on the review screen. No silent auto-add.
3. Confirming on review adds the checked cards to the wallet AND links the bank accounts (one card ↔ one account).
4. Unchecked accounts stay connected but unlinked — fixable in Settings → Connected accounts.
5. CTA label always carries the count of checked rows.

## Tokens (Honey)
surface #FFFEFB · border #E8E1D2 · separator #ECE5D6 · ink #211D16 · secondary #6F6757 · tertiary #9A927F · accent #E8680E · accent-deep #B4550B · accentSoft #FBEAD5 · warning #B4693A · warning border #E0B48A · warning bg #FDF6EC · active-row #F5F1E8. Type: Source Serif 4 titles, Public Sans body, IBM Plex Mono masks + section labels. Copy voice: calm, concrete, no exclamation marks.
