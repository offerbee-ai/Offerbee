import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const metadata: Metadata = {
  title: "Welcome — OfferBee",
};

// First-run onboarding. New sign-ups land here (Clerk redirects), and
// OnboardingGate routes unfinished users back from /app. Completed users are
// bounced to /app by the wizard itself.
export default function WelcomePage() {
  return <OnboardingWizard />;
}
