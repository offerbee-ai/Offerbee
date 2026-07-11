/**
 * Curated onboarding card catalog + spending categories, ported from the
 * design prototype (Design/design_handoff_onboarding, 12-card sample).
 *
 * Plain TS module — no Convex functions. Lives in the backend package so
 * onboarding.completeOnboarding can validate ids and seed cardCatalog
 * server-side; the web wizard imports the same data for display, the live
 * "credits in play" counter, the sample notification, and the step-5 reveal.
 *
 * `cardKey` is the best-effort key in the external card API. If a key doesn't
 * resolve, the scheduled detail fetch fails harmlessly and the wallet falls
 * back to the cardCatalog name seeded from this list.
 */

export interface OnboardingCard {
  id: string; // curated catalog id — what the wizard stores/persists
  cardKey: string; // external card API key, used when committing to userCards
  name: string;
  issuer: string;
  fee: number; // annual fee, $
  color: string; // brand hex, theme-independent
  credits: number; // annual credit value, $ — drives the live counter
  popular?: boolean; // shown as a tile; others are search-only
  next: { name: string; amt: number; days: number }; // soonest-resetting credit
}

export const ONBOARDING_CARDS: OnboardingCard[] = [
  { id: "amexPlat", cardKey: "amex-platinum", name: "Amex Platinum", issuer: "Amex", fee: 695, color: "#3A4048", credits: 1400, popular: true, next: { name: "Uber Cash", amt: 15, days: 6 } },
  { id: "amexGold", cardKey: "amex-gold", name: "Amex Gold", issuer: "Amex", fee: 325, color: "#B08A3E", credits: 420, popular: true, next: { name: "Dining credit", amt: 10, days: 2 } },
  { id: "csr", cardKey: "chase-sapphire-reserve", name: "Sapphire Reserve", issuer: "Chase", fee: 550, color: "#1E6FB8", credits: 800, popular: true, next: { name: "Travel credit", amt: 25, days: 5 } },
  { id: "venturex", cardKey: "capital-one-venture-x", name: "Venture X", issuer: "Capital One", fee: 395, color: "#2B2B2B", credits: 400, popular: true, next: { name: "Travel portal credit", amt: 25, days: 9 } },
  { id: "hiltonAspire", cardKey: "amex-hilton-aspire", name: "Hilton Aspire", issuer: "Amex", fee: 550, color: "#7A2E3B", credits: 650, popular: true, next: { name: "Airline flight credit", amt: 50, days: 4 } },
  { id: "marriott", cardKey: "amex-bonvoy-brilliant", name: "Bonvoy Brilliant", issuer: "Amex", fee: 650, color: "#3A2E2A", credits: 600, popular: true, next: { name: "Dining credit", amt: 25, days: 3 } },
  { id: "cspreferred", cardKey: "chase-sapphire-preferred", name: "Sapphire Preferred", issuer: "Chase", fee: 95, color: "#2A5C8A", credits: 100, next: { name: "Hotel credit", amt: 50, days: 14 } },
  { id: "deltaReserve", cardKey: "amex-delta-reserve", name: "Delta Reserve", issuer: "Amex", fee: 650, color: "#6A1B2E", credits: 500, next: { name: "Resy dining", amt: 20, days: 7 } },
  { id: "amexGreen", cardKey: "amex-green", name: "Amex Green", issuer: "Amex", fee: 150, color: "#1F5C3D", credits: 200, next: { name: "CLEAR credit", amt: 16, days: 11 } },
  { id: "citiStrata", cardKey: "citi-strata-elite", name: "Citi Strata Elite", issuer: "Citi", fee: 595, color: "#2E2A55", credits: 600, next: { name: "Splurge credit", amt: 25, days: 8 } },
  { id: "boaElite", cardKey: "bofa-premium-rewards-elite", name: "BofA Premium Elite", issuer: "Bank of America", fee: 550, color: "#7A1F2B", credits: 450, next: { name: "Airline incidental", amt: 33, days: 10 } },
  { id: "usbAltitude", cardKey: "usbank-altitude-reserve", name: "Altitude Reserve", issuer: "U.S. Bank", fee: 400, color: "#16405C", credits: 325, next: { name: "Travel/dining credit", amt: 27, days: 12 } },
];

export const ONBOARDING_CARDS_BY_ID: ReadonlyMap<string, OnboardingCard> =
  new Map(ONBOARDING_CARDS.map((c) => [c.id, c]));

export interface OnboardingCategory {
  key: string;
  label: string;
  matchingCredits: number; // feeds the "{n} matching credits" feedback pill
}

export const ONBOARDING_CATEGORIES: OnboardingCategory[] = [
  { key: "dining", label: "Dining", matchingCredits: 6 },
  { key: "travel", label: "Travel", matchingCredits: 9 },
  { key: "groceries", label: "Groceries", matchingCredits: 2 },
  { key: "streaming", label: "Streaming", matchingCredits: 3 },
  { key: "rideshare", label: "Rideshare", matchingCredits: 4 },
  { key: "hotels", label: "Hotels", matchingCredits: 7 },
  { key: "airlines", label: "Airlines", matchingCredits: 5 },
  { key: "shopping", label: "Shopping", matchingCredits: 3 },
  { key: "wellness", label: "Wellness", matchingCredits: 2 },
];

export const ONBOARDING_CATEGORY_KEYS: ReadonlySet<string> = new Set(
  ONBOARDING_CATEGORIES.map((c) => c.key),
);

export interface ReminderPrefs {
  expiry: boolean;
  digest: boolean;
  renewal: boolean;
  smart: boolean;
}

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  expiry: true,
  digest: true,
  renewal: false,
  smart: true,
};
