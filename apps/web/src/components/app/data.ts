/**
 * Sample-data model + derivation logic for the authenticated app views.
 *
 * Ported faithfully from the design prototype (Design/design_handoff_webapp).
 * The backend does not yet track "statement credits" (used flags / captured
 * value / reset countdowns), so these features run on sample data — everything
 * downstream (captured totals, net-vs-fees, verdicts, expiring groups) is
 * DERIVED from `credits`, never stored. Swap `SAMPLE_CREDITS` / `CARDS_BASE`
 * for real queries once the API exists; the derivation stays the same.
 */

export type Cycle = "monthly" | "quarterly" | "annual";

export interface Credit {
  id: string;
  name: string;
  card: string; // display name of the owning card
  cardId: string;
  color: string; // brand hex (theme-independent)
  amount: number;
  cycle: Cycle;
  used: boolean;
  days: number; // days until this credit resets
}

export interface CardBase {
  id: string;
  name: string;
  color: string;
  fee: number;
  terms: string;
}

// Brand colors live OUTSIDE the theme and never change.
export const CARDS_BASE: CardBase[] = [
  { id: "platinum", name: "Amex Platinum", color: "#3A4048", fee: 695, terms: "$695 / yr · renews Mar 2027" },
  { id: "gold", name: "Amex Gold", color: "#B08A3E", fee: 325, terms: "$325 / yr · renews Sep 2026" },
  { id: "sapphire", name: "Sapphire Reserve", color: "#1E6FB8", fee: 550, terms: "$550 / yr · renews Jan 2027" },
  { id: "aspire", name: "Hilton Aspire", color: "#7A2E3B", fee: 550, terms: "$550 / yr · renews Nov 2026" },
];

export const SAMPLE_CREDITS: Credit[] = [
  // ── Amex Platinum ──
  { id: "p1", name: "Uber Cash", card: "Amex Platinum", cardId: "platinum", color: "#3A4048", amount: 15, cycle: "monthly", used: true, days: 12 },
  { id: "p2", name: "Streaming credit", card: "Amex Platinum", cardId: "platinum", color: "#3A4048", amount: 20, cycle: "monthly", used: true, days: 12 },
  { id: "p3", name: "Wireless credit", card: "Amex Platinum", cardId: "platinum", color: "#3A4048", amount: 10, cycle: "monthly", used: false, days: 6 },
  { id: "p4", name: "Saks Fifth Ave", card: "Amex Platinum", cardId: "platinum", color: "#3A4048", amount: 50, cycle: "quarterly", used: false, days: 18 },
  { id: "p5", name: "Airline fee credit", card: "Amex Platinum", cardId: "platinum", color: "#3A4048", amount: 200, cycle: "annual", used: true, days: 210 },
  { id: "p6", name: "CLEAR Plus", card: "Amex Platinum", cardId: "platinum", color: "#3A4048", amount: 189, cycle: "annual", used: false, days: 96 },
  { id: "p7", name: "Hotel credit", card: "Amex Platinum", cardId: "platinum", color: "#3A4048", amount: 300, cycle: "annual", used: true, days: 150 },
  { id: "p8", name: "Equinox credit", card: "Amex Platinum", cardId: "platinum", color: "#3A4048", amount: 300, cycle: "annual", used: true, days: 120 },
  // ── Amex Gold ──
  { id: "g1", name: "Dining credit", card: "Amex Gold", cardId: "gold", color: "#B08A3E", amount: 10, cycle: "monthly", used: false, days: 2 },
  { id: "g2", name: "Resy dining", card: "Amex Gold", cardId: "gold", color: "#B08A3E", amount: 250, cycle: "quarterly", used: true, days: 40 },
  { id: "g3", name: "Hotel collection", card: "Amex Gold", cardId: "gold", color: "#B08A3E", amount: 160, cycle: "annual", used: true, days: 100 },
  // ── Sapphire Reserve ──
  { id: "s1", name: "Travel credit", card: "Sapphire Reserve", cardId: "sapphire", color: "#1E6FB8", amount: 25, cycle: "monthly", used: false, days: 5 },
  { id: "s2", name: "Lyft credit", card: "Sapphire Reserve", cardId: "sapphire", color: "#1E6FB8", amount: 15, cycle: "monthly", used: false, days: 23 },
  { id: "s3", name: "DoorDash credit", card: "Sapphire Reserve", cardId: "sapphire", color: "#1E6FB8", amount: 45, cycle: "quarterly", used: false, days: 31 },
  { id: "s4", name: "Hotel credit", card: "Sapphire Reserve", cardId: "sapphire", color: "#1E6FB8", amount: 300, cycle: "annual", used: true, days: 150 },
  { id: "s5", name: "Annual travel", card: "Sapphire Reserve", cardId: "sapphire", color: "#1E6FB8", amount: 300, cycle: "annual", used: true, days: 180 },
  // ── Hilton Aspire ──
  { id: "x1", name: "Resort credit", card: "Hilton Aspire", cardId: "aspire", color: "#7A2E3B", amount: 400, cycle: "annual", used: true, days: 120 },
  { id: "x2", name: "Flight credit", card: "Hilton Aspire", cardId: "aspire", color: "#7A2E3B", amount: 100, cycle: "annual", used: true, days: 90 },
  { id: "x3", name: "Airline incidental", card: "Hilton Aspire", cardId: "aspire", color: "#7A2E3B", amount: 100, cycle: "annual", used: false, days: 88 },
];

export const CYCLE_LABEL: Record<Cycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export const usd = (n: number): string => "$" + Math.round(n).toLocaleString("en-US");

/** Signed net string with the design's minus glyph, e.g. "+$120" / "−$40". */
export const netStr = (n: number): string => (n >= 0 ? "+$" : "−$") + Math.abs(n).toLocaleString("en-US");

export interface DerivedCard {
  id: string;
  name: string;
  color: string;
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
  sub: string; // "Card · $amount"
  reset: string; // status/reset line
  urgentReset: boolean; // reset line should use --alert
  cycleLabel: string;
}

export interface ExpiringGroup {
  label: string;
  urgent: boolean; // label color = alert vs tertiary
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
  /** All credits decorated, in source order. */
  decorated: DerivedCredit[];
}

function decorate(c: Credit): DerivedCredit {
  return {
    ...c,
    amountStr: usd(c.amount),
    sub: `${c.card} · ${usd(c.amount)}`,
    cycleLabel: CYCLE_LABEL[c.cycle],
    reset: c.used
      ? "Used this cycle"
      : c.cycle === "monthly"
        ? `$${c.amount} · resets in ${c.days}d`
        : `$${c.amount} · ${CYCLE_LABEL[c.cycle]}`,
    urgentReset: !c.used && c.days <= 3,
  };
}

/** All wallet-level + per-card totals, derived from the current credits. */
export function derive(credits: Credit[]): Derived {
  const total = credits.reduce((a, c) => a + c.amount, 0);
  const captured = credits.filter((c) => c.used).reduce((a, c) => a + c.amount, 0);
  const pct = total ? Math.round((captured / total) * 100) : 0;
  const fees = CARDS_BASE.reduce((a, c) => a + c.fee, 0);
  const net = captured - fees;
  const remainMonth = credits
    .filter((c) => c.cycle === "monthly" && !c.used)
    .reduce((a, c) => a + c.amount, 0);
  const atRiskCredits = credits.filter((c) => !c.used && c.days <= 7);
  const atRisk = atRiskCredits.reduce((a, c) => a + c.amount, 0);

  const cards: DerivedCard[] = CARDS_BASE.map((cb) => {
    const cap = credits
      .filter((c) => c.cardId === cb.id && c.used)
      .reduce((a, c) => a + c.amount, 0);
    const cnet = cap - cb.fee;
    const keep = cnet >= 0;
    return {
      id: cb.id,
      name: cb.name,
      color: cb.color,
      fee: cb.fee,
      terms: cb.terms,
      captured: cap,
      net: cnet,
      keep,
      verdict: keep ? "Keep" : "Review",
      pct: Math.min(100, Math.round((cap / cb.fee) * 100)),
    };
  });

  return {
    total,
    captured,
    pct,
    fees,
    net,
    remainMonth,
    atRisk,
    atRiskCount: atRiskCredits.length,
    cards,
    decorated: credits.map(decorate),
  };
}

/** Credits visible on Benefits, given the cycle filter + free-text search. */
export function filterBenefits(
  credits: Credit[],
  filter: Cycle | "all",
  search: string,
): { visible: DerivedCredit[]; available: number; openCount: number } {
  const q = search.trim().toLowerCase();
  const matched = credits.filter((c) => {
    if (filter !== "all" && c.cycle !== filter) return false;
    if (q && !`${c.name} ${c.card}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const open = matched.filter((c) => !c.used);
  return {
    visible: matched.map(decorate),
    available: open.reduce((a, c) => a + c.amount, 0),
    openCount: open.length,
  };
}

/** Grouped expiring lists for the given horizon. */
export function expiringGroups(
  credits: Credit[],
  range: "week" | "month",
): { groups: ExpiringGroup[]; total: number } {
  const horizon = range === "week" ? 7 : 31;
  const exp = credits
    .filter((c) => !c.used && c.days <= horizon)
    .sort((a, b) => a.days - b.days);
  const total = exp.reduce((a, c) => a + c.amount, 0);
  const soon = exp.filter((c) => c.days <= 7);
  const later = exp.filter((c) => c.days > 7);

  const groups: ExpiringGroup[] = [];
  if (soon.length)
    groups.push({
      label: "Next 7 days",
      urgent: true,
      sumStr: `${usd(soon.reduce((a, c) => a + c.amount, 0))} at risk`,
      items: soon.map(decorate),
    });
  if (later.length)
    groups.push({
      label: range === "week" ? "Also soon" : "Later this month",
      urgent: false,
      sumStr: usd(later.reduce((a, c) => a + c.amount, 0)),
      items: later.map(decorate),
    });
  return { groups, total };
}

/** The 4 soonest-to-reset unused credits, for the dashboard "use before reset". */
export function dashExpiring(credits: Credit[]): DerivedCredit[] {
  return credits
    .filter((c) => !c.used)
    .sort((a, b) => a.days - b.days)
    .slice(0, 4)
    .map(decorate);
}
