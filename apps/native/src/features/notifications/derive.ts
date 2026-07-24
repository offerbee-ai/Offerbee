import type { IconName } from "@/components/ui";

export type NotifCategory = "expiring" | "fee" | "reset";

const EXPIRING_TYPES = new Set(["credit_expiring", "credit_expiry_roundup"]);

/** Map a backend notification `type` code to a visual category. */
export function notifCategory(type: string): NotifCategory {
  if (EXPIRING_TYPES.has(type)) return "expiring";
  if (type === "annual_fee_due") return "fee";
  return "reset";
}

/**
 * Tile glyph + soft-bg / ink color roles per category, resolved against theme
 * `colors` at render time. All keys are real `ThemeColors` roles.
 */
export const CATEGORY_STYLE: Record<
  NotifCategory,
  { icon: IconName; softKey: "warningSoft" | "field" | "accentSoft"; inkKey: "warning" | "secondary" | "accent" }
> = {
  expiring: { icon: "clock", softKey: "warningSoft", inkKey: "warning" },
  fee: { icon: "calendar", softKey: "field", inkKey: "secondary" },
  reset: { icon: "bell", softKey: "accentSoft", inkKey: "accent" },
};

export type NotifAction = { label: string; tone: "accent" | "neutral" };

/** Row action button per category. */
export function notifAction(category: NotifCategory): NotifAction {
  if (category === "expiring") return { label: "Use", tone: "accent" };
  if (category === "fee") return { label: "Details", tone: "neutral" };
  return { label: "View", tone: "neutral" };
}

export type NotifData =
  | {
      route?: string;
      cardKey?: string;
      /** userBenefit id on credit_expiring notifications (what `markUsed` expects). */
      benefitId?: string;
      creditId?: string;
      [k: string]: unknown;
    }
  | undefined
  | null;

/**
 * Resolve a deep-link href from the notification's `data` payload, or null.
 * Backend producers emit `route` ∈ {"card","benefits","detected"} and carry a
 * `benefitId` on expiring credits (see reminders.ts / offers.ts). A benefit id
 * takes precedence so expiring notifications open the credit detail.
 */
export function notifTarget(data: NotifData): string | null {
  if (!data) return null;
  if (data.benefitId) return `/credit/${data.benefitId}?from=Notifications`;
  switch (data.route) {
    case "card":
      return data.cardKey ? `/card/${data.cardKey}` : null;
    case "benefits":
    case "detected":
      return "/benefits";
    default:
      return null;
  }
}
