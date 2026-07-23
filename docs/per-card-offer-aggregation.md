# Reading Per-Card Active Offers — Provider Landscape

**Status:** Research draft · July 2026
**Question:** Which integration provider can, given a user's linked card, return that card's **current list of issuer-native targeted offers** — the "Amex Offers", "Chase Offers", "Capital One Offers", "Citi Merchant Offers", "BofA offers" that appear inside each issuer's own app as *"Spend $X, get $Y back at Merchant Z"*?

> This is distinct from two things already researched:
> - **CLO networks** (`card-linked-offer-providers.md`) — Kard/Cardlytics *supply* merchant-funded offers to publishers. Here we want to **read** offers an issuer has already targeted to the user's existing card.
> - **Reward balances** (MX/Plaid) — points/miles/cash-back accrued. Different data than the merchant offer list.

---

## Bottom line

**There is no clean, licensable B2B API for per-card issuer-native offers.** Every product that actually surfaces these offers is a **consumer app** getting them one of two ways:

1. **Server-side credentialed login automation** (MaxRewards) — the app stores the user's issuer username/password and logs in as them from its servers. Most capable, highest risk.
2. **Browser-extension scraping** (CardPointers, Kudos) — a client-side extension reads and clicks the offers page while the user is already logged in. No stored passwords, lower risk, but browser-bound and fragile.

The bank-data aggregators and connectivity APIs (Plaid, MX, Finicity, Yodlee, Akoya, Method, Knot) **do not expose the issuer's targeted-offer list** — confirmed, their card models stop at transactions/balances/liabilities. And the things marketed as "offers APIs" (Amex Targeted Offers, Visa VOP, Mastercard Personalized Offers, Kard) run the *opposite* direction: card-*acquisition* offers or CLO supply where the partner runs its own program.

So for OfferBee, **credentialed automation or extension scraping is the only route today**, both with real terms-of-service and account-lock exposure.

---

## What surfaces the offer list (all consumer apps, no API)

| App | Returns per-card offer list? | Method | Stores bank password? | Issuer coverage | B2B API? |
|---|---|---|---|---|---|
| **MaxRewards** | **Yes** — reads + auto-activates | Server-side credentialed login automation | **Yes** (encrypted, no opt-out) | Broadest: Amex, Chase, Capital One, Citi, BofA, WF, Discover, Barclays, US Bank, +more | **None found** (consumer-only, ~$9/mo) |
| **Kudos** | **Yes** — finds + activates | Browser extension (reads while logged in) | No | Amex, Chase, Citi, WF, BofA | **None found** |
| **CardPointers** | **Yes** — auto-enrolls | Browser extension, clicks activation links | No | Amex, Chase, BofA, Citi, WF, US Bank | **None found** |
| PointsPulse | No (balances only) | Extension, no passwords | No | — | None |

Functionally MaxRewards is exactly the capability OfferBee wants, but it's a consumer product; no public partnership/data-licensing program exists (worth a direct BD ask — absence of public docs isn't proof).

## What does NOT provide it (confirmed)

- **Plaid / MX / Finicity (Mastercard) / Yodlee / Akoya** — card data models cover transactions, balances, and Liabilities (APR, limit, due dates). No targeted-offer endpoint. There's **no roadmap signal** this changes.
- **Method Financial** — liabilities, balances, real-time transactions, card-on-file provisioning. Its "card-linked offer" mention means it supplies the *transaction stream* a CLO platform matches against — not the issuer offer list.
- **Knot API** — CardSwitcher (update card-on-file) + TransactionLink (SKU-level merchant data). Merchant-side connectivity, not issuer offer reads.
- **Amex "Targeted Offers API"** — returns prescreened card *application* offers (acquisition), not Amex Offers merchant deals.
- **Visa VOP / Mastercard Personalized Offers / Kard / Cardlytics** — CLO network/supply, the partner runs its own program (already covered in the CLO doc).

## Compliance / risk

- **Credential sharing (MaxRewards model):** issuer agreements broadly prohibit sharing login credentials; automated server-side login is what triggers fraud/security locks (documented with Chase). Highest risk, plus credential-liability if breached.
- **Extension scraping (CardPointers/Kudos model):** no stored credentials (user is already authenticated) → lower credential risk, but still automates the issuer site (against anti-automation ToS) and depends on the issuer's DOM, so it breaks on UI changes.
- **CFPB §1033 / open banking:** as of July 2026 the rule is **enjoined and being rewritten** (Kentucky injunction; CFPB reopened rulemaking; the April 2026 deadline effectively suspended). Even the eventual standard covers transactions/balances/account data — **no indication it will mandate exposure of issuer targeted offers**, so don't count on 1033 for a clean offer API. Screen scraping stays legally gray but not prohibited.

---

## Options for OfferBee

1. **Extension-based scraping (CardPointers/Kudos pattern)** — most defensible of the scraping options (no stored passwords), but requires the user logged in, is desktop/browser-bound, and is fragile. Poor fit for OfferBee's mobile-first Expo app and the location-notification use case, which needs the offer list server-side and fresh.
2. **Server-side credentialed automation (MaxRewards pattern)** — headless and complete, but highest ToS/fraud-lock/credential-liability risk and constant anti-bot maintenance. A serious operational and legal commitment for a startup.
3. **BD / partnership** — approach MaxRewards (or a CLO network) for a private data arrangement. No off-the-shelf licensable offer-read API exists, so this is bespoke and uncertain, but it's the only path that avoids running scraping infrastructure yourself.
4. **Don't wait on aggregators or 1033** — Plaid/MX/Method/Knot won't return issuer offers, and the rule rewrite won't add them.

### How this fits OfferBee's model
OfferBee's current strength is **issuer benefits/statement credits** (parsed from card-detail prose) plus **transaction matching via Plaid**. Per-card *targeted* offers are a genuinely different data source with no clean supply. Two pragmatic directions that avoid the scraping liability:

- **Stay on merchant-funded CLOs** (Kard/Cardlytics from the other doc): OfferBee sources and *shows* offers rather than reading what issuers targeted — no credential handling, and those offers carry the geo data the location feature needs.
- **Treat targeted-offer aggregation as a later, opt-in power feature** if user demand justifies the operational/legal cost, most likely via a BD partnership rather than home-grown scraping.

### Open questions for BD
1. Does **MaxRewards** offer any private enterprise/data-licensing arrangement? (No public program; confirm directly.)
2. Would **Kudos/CardPointers** entertain a white-label or data partnership?
3. Exact, current issuer coverage per app (public docs lag).

*Confidence: high that no public per-card offer API exists and that aggregators don't provide it (from current vendor docs and app help centers); low on whether any vendor has an unpublished B2B arrangement — flagged for direct outreach.*
