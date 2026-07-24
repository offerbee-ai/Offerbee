import { useState } from "react";

import { useCredits } from "./CreditsProvider";
import { expiringGroups } from "./derive";

export type ExpiringRange = "week" | "month";

/**
 * Review-screen expiring state: the week/month range plus the grouped credits
 * and the "later this month" spillover count. Kept out of the route so the
 * Expo Router screen stays thin (data hooks live in `features/*`).
 */
export function useReviewExpiring() {
  const { credits, derived } = useCredits();
  const [range, setRange] = useState<ExpiringRange>("week");

  const exp = expiringGroups(credits, range);
  const urgentGroup = exp.groups.find((g) => g.urgent);
  const laterMonthCount = derived.decorated.filter(
    (c) => !c.used && !c.snoozed && c.days > 7 && c.days <= 31,
  ).length;

  return { range, setRange, exp, urgentGroup, laterMonthCount };
}
