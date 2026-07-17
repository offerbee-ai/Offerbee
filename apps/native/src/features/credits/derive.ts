/**
 * Derivation logic for credits/cards — ported from
 * apps/web/src/components/app/data.ts (keep the two in sync; both are pure
 * functions of (credits, cards) with no platform imports). The backend owns
 * persistence; every aggregate here is derived per render.
 */

export type Cycle = "monthly" | "quarterly" | "semiannual" | "annual";

export type PeriodStatus = "elapsed" | "current" | "upcoming";

// Periods a cycle has in one calendar year. Mirrors the backend
// benefitCycles.PERIODS_PER_YEAR; turns a per-period amount into an annual value
// (a $10/mo credit is worth $120/yr).
export const PERIODS_PER_YEAR: Record<Cycle, number> = {
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
};

// One cell of a credit's per-period grid (this calendar year). Server-computed
// in benefits.listMyCredits; annual → 1 cell (a checkbox), quarterly → 4,
// semiannual → 2. Monthly credits have no grid (periods undefined). Mirrors the
// web data.ts shape — keep the two in sync.
export interface PeriodCell {
  key: string; // periodKey, e.g. "2026-Q3"
  label: string; // "Q1".."Q4" | "Jan–Jun"/"Jul–Dec" | year (annual)
  usedAmount: number; // dollars logged in that period
  used: boolean; // usedAmount >= amount
  status: PeriodStatus;
}

export interface Credit {
  id: string;
  name: string;
  card: string; // display name of the owning card
  cardId: string; // = cardKey
  color: string; // brand hex fallback (derived from cardKey) when no image
  image: string | null; // real card art (cardDetails.cardImageUrl)
  amount: number; // dollars per cycle period
  cycle: Cycle;
  usedAmount: number; // dollars logged in the current period
  // Year-to-date captured: usage summed across ALL of this year's periods, each
  // capped at `amount` (server-computed). Fee-vs-value ROI measures against
  // this, not current-period usedAmount. Always <= annualValue.
  capturedYtd: number;
  used: boolean; // materialized: usedAmount >= amount
  days: number; // whole days until reset (client-computed from resetAt)
  resetAt: number; // ms; period end
  snoozed: boolean; // snoozedUntil > now
  periods?: PeriodCell[]; // per-period cells (non-monthly cycles only)
}

// Credits render as a per-period grid unless monthly (12 cells is too busy — it
// keeps the single current-period control).
export const hasGrid = (cycle: Cycle): boolean => cycle !== "monthly";

export interface CardBase {
  id: string; // = cardKey
  name: string;
  color: string;
  image: string | null;
  fee: number;
  terms: string;
}

// Brand-ish palette (theme-independent) — identical to web so the same card
// renders the same color on both platforms.
const CARD_PALETTE = [
  "#3A4048", "#B08A3E", "#1E6FB8", "#7A2E3B",
  "#2E6E4E", "#5B4A8A", "#B05A2E", "#1B6E8C",
];
export function cardColor(cardKey: string): string {
  let h = 0;
  for (let i = 0; i < cardKey.length; i++) h = (h * 31 + cardKey.charCodeAt(i)) | 0;
  return CARD_PALETTE[Math.abs(h) % CARD_PALETTE.length];
}

export const CYCLE_LABEL: Record<Cycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Semiannual",
  annual: "Annual",
};

const roundCents = (n: number): number => Math.round(n * 100) / 100;

export const usd = (n: number): string => "$" + Math.round(n).toLocaleString("en-US");

/** Signed net string with the design's minus glyph, e.g. "+$120" / "−$40". */
export const netStr = (n: number): string =>
  (n >= 0 ? "+$" : "−$") + Math.abs(Math.round(n)).toLocaleString("en-US");

// Remaining dollars in a credit's CURRENT period (drives current-period metrics).
const remaining = (c: Credit): number => roundCents(Math.max(0, c.amount - c.usedAmount));

// Full-year dollar value of a credit — the denominator for annual ROI.
const annualValue = (c: Credit): number => c.amount * PERIODS_PER_YEAR[c.cycle];

export interface DerivedCard {
  id: string;
  name: string;
  color: string;
  image: string | null;
  fee: number;
  terms: string;
  captured: number;
  net: number;
  keep: boolean;
  verdict: "Keep" | "Review";
  pct: number; // 0-100, clamped
}

export interface DerivedCredit extends Credit {
  amountStr: string;
  remaining: number;
  sub: string; // "Card · $amount"
  reset: string; // status/reset line
  urgentReset: boolean;
  cycleLabel: string;
}

export interface ExpiringGroup {
  label: string;
  urgent: boolean;
  sumStr: string;
  items: DerivedCredit[];
}

export interface Derived {
  total: number;
  captured: number;
  pct: number;
  fees: number;
  net: number;
  remainMonth: number;
  atRisk: number;
  atRiskCount: number;
  cards: DerivedCard[];
  decorated: DerivedCredit[];
}

function decorate(c: Credit): DerivedCredit {
  const rem = remaining(c);
  return {
    ...c,
    amountStr: usd(c.amount),
    remaining: rem,
    sub: `${c.card} · ${usd(c.amount)}`,
    cycleLabel: CYCLE_LABEL[c.cycle],
    reset: c.used
      ? "Used this cycle"
      : c.usedAmount > 0
        ? `${usd(rem)} of ${usd(c.amount)} left · resets in ${c.days}d`
        : c.cycle === "monthly"
          ? `$${c.amount} · resets in ${c.days}d`
          : `$${c.amount} · ${CYCLE_LABEL[c.cycle]}`,
    urgentReset: !c.used && !c.snoozed && c.days <= 3,
  };
}

export function derive(credits: Credit[], cards: CardBase[]): Derived {
  // Captured/net/verdict are YEAR-TO-DATE (capturedYtd); remainMonth/atRisk stay
  // CURRENT-period. Annual value is the ROI denominator so pct stays 0–100.
  const total = credits.reduce((a, c) => a + annualValue(c), 0);
  const cap = credits.reduce((a, c) => a + c.capturedYtd, 0);
  const pct = total ? Math.round((cap / total) * 100) : 0;
  const fees = cards.reduce((a, c) => a + c.fee, 0);
  const net = cap - fees;
  const remainMonth = credits
    .filter((c) => c.cycle === "monthly" && !c.used)
    .reduce((a, c) => a + remaining(c), 0);
  const atRiskCredits = credits.filter((c) => !c.used && !c.snoozed && c.days <= 7);
  const atRisk = atRiskCredits.reduce((a, c) => a + remaining(c), 0);

  const derivedCards: DerivedCard[] = cards.map((cb) => {
    const capCard = credits
      .filter((c) => c.cardId === cb.id)
      .reduce((a, c) => a + c.capturedYtd, 0);
    const cnet = capCard - cb.fee;
    const keep = cnet >= 0;
    return {
      id: cb.id,
      name: cb.name,
      color: cb.color,
      image: cb.image,
      fee: cb.fee,
      terms: cb.terms,
      captured: capCard,
      net: cnet,
      keep,
      verdict: keep ? "Keep" : "Review",
      pct: cb.fee > 0 ? Math.min(100, Math.round((capCard / cb.fee) * 100)) : capCard > 0 ? 100 : 0,
    };
  });

  return {
    total,
    captured: cap,
    pct,
    fees,
    net,
    remainMonth,
    atRisk,
    atRiskCount: atRiskCredits.length,
    cards: derivedCards,
    decorated: credits.map(decorate),
  };
}

/** Credits visible on Benefits, given the cycle filter + free-text search.
 *  Native folds semiannual into the Annual segment (3-segment design). */
export function filterBenefits(
  credits: Credit[],
  filter: Cycle | "all",
  search: string,
): { visible: DerivedCredit[]; available: number; openCount: number } {
  const q = search.trim().toLowerCase();
  const matched = credits.filter((c) => {
    if (filter !== "all") {
      const inSegment =
        filter === "annual" ? c.cycle === "annual" || c.cycle === "semiannual" : c.cycle === filter;
      if (!inSegment) return false;
    }
    if (q && !`${c.name} ${c.card}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const open = matched.filter((c) => !c.used);
  return {
    visible: matched.map(decorate),
    available: open.reduce((a, c) => a + remaining(c), 0),
    openCount: open.length,
  };
}

/** Grouped expiring lists for the given horizon (snoozed credits excluded). */
export function expiringGroups(
  credits: Credit[],
  range: "week" | "month",
): { groups: ExpiringGroup[]; total: number } {
  const horizon = range === "week" ? 7 : 31;
  const exp = credits
    .filter((c) => !c.used && !c.snoozed && c.days <= horizon)
    .sort((a, b) => a.days - b.days);
  const total = exp.reduce((a, c) => a + remaining(c), 0);
  const soon = exp.filter((c) => c.days <= 7);
  const later = exp.filter((c) => c.days > 7);

  const groups: ExpiringGroup[] = [];
  if (soon.length)
    groups.push({
      label: "Next 7 days",
      urgent: true,
      sumStr: `${usd(soon.reduce((a, c) => a + remaining(c), 0))} at risk`,
      items: soon.map(decorate),
    });
  if (later.length)
    groups.push({
      label: range === "week" ? "Also soon" : "Later this month",
      urgent: false,
      sumStr: usd(later.reduce((a, c) => a + remaining(c), 0)),
      items: later.map(decorate),
    });
  return { groups, total };
}

/** The 4 soonest-to-reset unused credits, for the Review "use before reset". */
export function dashExpiring(credits: Credit[]): DerivedCredit[] {
  return credits
    .filter((c) => !c.used && !c.snoozed)
    .sort((a, b) => a.days - b.days)
    .slice(0, 4)
    .map(decorate);
}
