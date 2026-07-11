/**
 * Pure derivation helpers for the onboarding wizard, ported from the design
 * prototype (Design/design_handoff_onboarding). Everything downstream of the
 * user's selections — the live counter, the sample notification, the step-5
 * reveal — is derived here, never stored.
 */

import {
  ONBOARDING_CARDS,
  ONBOARDING_CATEGORIES,
  type OnboardingCard,
  type ReminderPrefs,
} from "@packages/backend/convex/onboardingCatalog";
import { usd } from "@/components/app/data";

export interface RevealItem {
  name: string; // credit name
  card: string; // owning card name
  color: string;
  amt: number;
  days: number;
  urgent: boolean; // resets within a week
}

export interface Reveal {
  items: RevealItem[]; // sorted by days ascending, max 5
  totalStr: string; // "$X is about to slip away"
  countStr: string; // "{n} credits"
}

export function selectedCards(ids: ReadonlySet<string>): OnboardingCard[] {
  return ONBOARDING_CARDS.filter((c) => ids.has(c.id));
}

export function creditsInPlay(cards: OnboardingCard[]): number {
  return cards.reduce((a, c) => a + c.credits, 0);
}

export function deriveReveal(cards: OnboardingCard[]): Reveal {
  const items = cards
    .map((c) => ({
      name: c.next.name,
      card: c.name,
      color: c.color,
      amt: c.next.amt,
      days: c.next.days,
      urgent: c.next.days <= 7,
    }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);

  // Headline sums the ≤7-day credits; if nothing is that close, fall back to
  // every selected card's next credit so the reveal never reads "$0".
  const urgent = cards.filter((c) => c.next.days <= 7);
  const total =
    urgent.reduce((a, c) => a + c.next.amt, 0) ||
    cards.reduce((a, c) => a + c.next.amt, 0);
  const count = urgent.length || cards.length;

  return {
    items,
    totalStr: usd(total),
    countStr: `${count} ${count === 1 ? "credit" : "credits"}`,
  };
}

/** Sample push content from the soonest-expiring selected credit. */
export function deriveNotifPreview(cards: OnboardingCard[]): {
  head: string;
  body: string;
} {
  const first = deriveReveal(cards).items[0];
  if (!first) {
    return {
      head: "Dining credit resets in 2 days",
      body: "Use your $10 Amex Gold credit before it disappears.",
    };
  }
  return {
    head: `${first.name} resets in ${first.days} ${first.days === 1 ? "day" : "days"}`,
    body: `Use your ${usd(first.amt)} ${first.card} credit before it disappears.`,
  };
}

export function categoryFeedback(selected: ReadonlySet<string>): string {
  if (selected.size === 0)
    return "Pick a few — we'll rank every credit around them.";
  const matched = ONBOARDING_CATEGORIES.filter((c) =>
    selected.has(c.key),
  ).reduce((a, c) => a + c.matchingCredits, 0);
  return `Nice — ${matched} matching credits move to the top of your feed.`;
}

export function remindersOnCount(prefs: ReminderPrefs): number {
  return [prefs.expiry, prefs.digest, prefs.renewal, prefs.smart].filter(
    Boolean,
  ).length;
}
