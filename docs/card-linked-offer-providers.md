# Card-Linked Offer Providers — Landscape & Recommendation

**Status:** Research draft · July 2026
**Question:** Which provider can supply merchant-funded card-linked offers (CLOs) for OfferBee, on top of the existing Plaid integration, with merchant location/geo data good enough to drive location-based notifications?

> Scope note: this covers **card-linked offers** (activate an offer → earn cash back / discount when the linked card is used at the merchant). It does *not* cover issuer benefit/credit databases (the Amex-style statement credits OfferBee parses from card-detail prose today) — that's a different market.

---

## The structural fact that shapes every option

A true CLO fires when the user's card is swiped at a merchant. Detecting that swipe requires the card's **PAN enrolled into the Visa/Mastercard/Amex transaction-monitoring programs**. **Plaid does not do this** — Plaid reads linked-bank transaction *history*; it does not register cards on the networks for real-time offer redemption. Plaid's full 2026 catalog (Auth, Transactions, Signal, Enrich, Layer…) has **no offers/cashback product**. Enrich only cleans and geo-tags transactions; it funds nothing.

So adding CLOs means adding a **second linking path** beyond Plaid. There are two shapes:

1. **Separate PAN enrollment** (Fidel, Visa, Mastercard): the user hands over a card number, the provider tokenizes it into the networks. A second link flow in the app; the provider's SDK keeps raw PANs off OfferBee servers (lighter PCI SAQ).
2. **Reuse Plaid** (Cardlytics CRP): feed the provider OfferBee's existing Plaid processor token — no PAN entry, no second user-facing flow. OfferBee already stores `access_token`/`item_id` per item in `plaid.ts`, so minting a processor token is one `/processor/token/create` call away. This is the lowest-friction path *if* it's real and GA.

A second subtlety: at the big networks, **the offer feed and the location data are separate products**. You qualify transactions with one API and fetch store geo from another (Mastercard Places, third-party layers on Visa VMORC). The independent, API-first players (Kard, Fidel) bundle geo into the offer object — which is exactly why they fit OfferBee's geofencing use case and the networks don't.

---

## Shortlist (realistic for a startup-scale app that needs geo-tagged offers)

### 1. Kard — best geo fit
Purpose-built CLO network for fintechs (~45M cardholders; partners include Varo, Robinhood, Marqeta). National + local offers.

- **Geo — best in class.** Dedicated Location endpoints return per-store **address, latitude/longitude, phone, and store hours**, and offers can be filtered by lat/long, city, state, or zip. Docs frame it as "real-time geo-targeting within your application" — OfferBee's exact use case.
- **Integration.** REST (calendar-versioned), API / SDK / hosted WebView, webhooks for transaction matching, auto-match (no click-to-activate). Explicitly aimed at small teams "without a bank's IT department."
- **⚠️ Make-or-break unknown.** Kard's cardholder model expects **BIN + last-4 + a transaction feed from you** — it's built for card *issuers/processors* (documented Marqeta path). There is **no documented Plaid-based ingestion path**. Whether Kard will accept a Plaid-sourced feed from a non-issuing app is unconfirmed and must be the first question to them.
- **Cost.** Pure pay-for-performance rev-share on confirmed redemptions; split/minimums not public. May prefer exclusive issuer relationships — clarify whether that constrains OfferBee. US-focused, SOC 2 + PCI.

### 2. Cardlytics (Cardlytics Rewards Platform / CRP) — best Plaid fit
Largest catalog in the category (~225M consumers, ~half of US card spend, 7 of top-10 US banks); enterprise/national advertisers.

- **Geo — yes.** First-class `StoreLocation` object (address, city/state/postal, phone, **lat/long**, multiple stores per merchant) plus a Customer Alerts/notifications module.
- **Integration — the standout.** CRP documents a **Plaid Processor Extension** (`POST /v2/data/connections` with `providerId:"PLAID", mode:"PROCESSOR", processorToken`) — **reuse OfferBee's existing Plaid tokens, no second card-linking flow**. Also a documented **React-Native Web SDK** (fits the Expo app). Public docs are open, so due diligence is easy.
- **⚠️ Confirm.** The Plaid extension is marked "In Development" — verify GA. Cardlytics is enterprise/bank legacy with 2025 restructuring; whether they'll commercially **onboard a startup** is unconfirmed. Possible bank-style content-approval friction on offers.
- **Cost.** Rev-share (advertiser pricing moving CPS→CPR); not public. Non-exclusive.

### 3. Fidel API — global, light PCI, smaller catalog
Card-linking *infrastructure* (Visa/MC/Amex connectivity + enriched real-time transaction events). Carved out to Enigmatic Smile in 2024, still trading as "Fidel" and actively marketed. Now also offers a turnkey **Offers-as-a-Service** CLO marketplace.

- **Geo — yes, offer-dependent.** Transaction object carries `location.geolocation.latitude/longitude` + full address; OaaS offers include "precise location data" **only when the MID resolves to a specific store**, so store-level coverage varies by brand — verify per brand.
- **Integration.** Developer-friendly REST + webhooks + dashboard, self-serve sandbox, enrollment SDKs (web/iOS/Android/React-Native). **Requires its own PAN enrollment flow** separate from Plaid (two link flows); proprietary tokenization keeps PANs off OfferBee servers.
- **⚠️ Supply.** It's more infrastructure than marketplace — the curated catalog is smaller than Cardlytics/Kard, so OfferBee may need to source some merchant deals itself.
- **Cost.** Usage/commission model, free test tier; production gated on network approval. US + UK/IE/CA/Nordics/UAE.

---

## Impractical for a seed-stage app (documented for completeness)

- **Visa** — two distinct products: **Visa Offers Platform** (a transaction-qualification engine; you supply merchants; PANs into VisaNet; post-hoc confirmation, not pre-purchase "nearby" push) and **VMORC** (read-only offer *content*; store-level lat/long not clearly native — third parties layer geo on top). No public pricing; production onboarding effectively needs a bank sponsor. ("Visa Web / Skyflow" appears to be a naming mix-up — no such acquisition found.)
- **Mastercard Offers (PCLO)** — genuinely large (25,000+ merchants, $770M+ incentivized spend). But store geo lives in a **separate Places API** (join required), it's framed for **issuers/publishers** (demo-gated, not self-serve), and Mastercard even distributes to smaller banks *through Cardlytics* — i.e., the realistic path is via an aggregator anyway. Vyze (POS financing) and Dynamic Yield (personalization) are **not** CLO.
- **Rewards Network** — 20k-restaurant card-linked **dining** network, earn-only (full price → miles/points), **no public API/SDK**, entry only as an enterprise loyalty partner. Dead end for a startup.
- **Figg** — acquired by JPMorgan, now captive to Chase Media Solutions; no external API.
- **Wildfire Systems** — real and API-first, but ~50k programs are mostly **online affiliate cashback**; new local-CLO product's store-geo granularity unverified. Good as an *online-cashback complement*, weak for location notifications.
- **Button** (mobile/online affiliate, no store geo), **Prizeout** (gift-card marketplace, bypasses card rails), **Bond** (BaaS/card-issuing, acquired by FIS), **Empyr/Augeo** (CLO IP sold with Figg) — not fits.
- **Plaid** — confirmed no offers product; it's the plumbing others build CLO on top of.
- **MX** — a Plaid competitor in the same category: data **aggregation + enrichment**, not CLOs. Its "Rewards" API (`fetch_rewards` / `GET …/rewards`) only aggregates a member's *existing* card reward **balances** (points/miles/cash back accrued on their own cards) — it does not surface merchant-funded offers, carries no offer inventory, and no store geo. Switching Plaid→MX would change OfferBee's aggregation vendor but give **zero** new card-offer capability; you'd still bolt on Kard/Cardlytics/Fidel for CLOs. See "Does switching to MX help?" below.

---

## Comparison

| Provider | Store-level geo (lat/long) | Works with existing Plaid? | Startup can onboard? | Offer supply |
|---|---|---|---|---|
| **Kard** | **Yes — best** (address, lat/long, hours, proximity filter) | Unconfirmed — issuer feed model, no Plaid path | **Yes — built for small teams** | National + local |
| **Cardlytics CRP** | Yes (`StoreLocation` + alerts) | **Yes — documented Plaid processor-token reuse** ("In Development") | Unconfirmed (enterprise legacy) | Largest, national |
| **Fidel** | Yes, offer-dependent | No — adds own PAN flow | Sandbox yes; prod gated | Smaller; may self-source |
| Visa VOP/VMORC | Weak (needs 3rd-party geo) | No — PAN into VisaNet | Very hard (bank sponsor) | Infra + content |
| Mastercard Offers | Separate Places API (join) | No — MC card-linking | No — issuer/publisher-gated | Large (25k) |
| Rewards Network | No public feed | No — no API | No — enterprise BD | Dining, earn-only |
| Wildfire | Weak (mostly online) | Partial (affiliate, no PAN) | Yes | Online + some local |

---

## Recommendation

Run a **head-to-head of Kard vs. Cardlytics CRP**, with **Fidel** as the fallback.

- **Kard** has the purpose-built geo API (lat/long, hours, proximity filtering) and is explicitly startup-friendly. Gate the evaluation on one question: *will it accept a Plaid-sourced transaction feed from a non-issuer?* If yes, it's the front-runner for the location use case. If no, OfferBee would need to become an issuer/processor to use it — likely a non-starter.
- **Cardlytics CRP** is the only provider with a documented way to **reuse OfferBee's existing Plaid processor tokens** (no second user-facing link flow) plus a React-Native SDK for the Expo app. Gate on two questions: *is the Plaid Processor Extension GA?* and *will they onboard a startup commercially?*
- **Fidel** is the global, lighter-PCI backstop — accept that you supply more inventory and add a separate PAN enrollment flow.
- Skip direct network integrations (Visa/Mastercard) and Rewards Network at this stage; reach them through an aggregator if ever.

### Does switching to MX help?
No — not for offers. MX is an aggregation/enrichment platform in Plaid's category, not a CLO provider. Its Rewards API reads a user's *existing* reward balances (the points/miles/cash back already accrued on their cards), which is a different feature from merchant-funded offers — no offer catalog, no merchant location data. Moving Plaid→MX would swap OfferBee's aggregation vendor (a large migration touching `plaid.ts`, the link flow, and transaction matching) while leaving the CLO gap exactly where it is. If anything, an MX migration only makes sense on aggregation merits (coverage, data quality, pricing), and would *remove* the one integration advantage identified here: Cardlytics CRP's documented reuse of **Plaid** processor tokens. Recommendation: keep Plaid for aggregation and add a dedicated CLO provider.

### How this feeds the location-notifications design
The geo work in `location-notifications-design.md` assumed OfferBee resolves merchant locations via the Vacation-Planner geo service (Google Maps → Redis). If a CLO provider ships **store-level lat/long with each offer** (Kard, Cardlytics), that provider *is* the merchant-location source for those offers — the geo service becomes a fallback for offers without location rather than the primary path. Worth revisiting `benefitMerchants.json` vs. a provider-supplied offer+location feed once a provider is chosen.

### Open questions to take to vendors (none are answerable from public docs)
1. **Kard:** accepts a Plaid-based feed from a non-issuer?
2. **Cardlytics:** Plaid Processor Extension GA, and startup onboarding?
3. **Economics** — rev-share split, minimums, exclusivity — unpublished for every provider.
4. **Per-offer geo coverage %** — even Kard/Fidel carry store location only when an offer resolves to physical stores; national/online offers won't help geofencing.

*Confidence: high on product structure, geo capability, and eligibility framing (from current vendor docs); low on pricing, exact merchant counts, and a few acquisition details — all flagged above.*
