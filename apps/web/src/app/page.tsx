import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { TrustStrip } from "@/components/landing/TrustStrip";
import { FeatureSection } from "@/components/landing/FeatureSection";
import { ThemeShowcase } from "@/components/landing/ThemeShowcase";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Stats } from "@/components/landing/Stats";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";
import { PhoneFrame } from "@/components/landing/phone/PhoneFrame";
import { BenefitsScreen } from "@/components/landing/phone/BenefitsScreen";
import { ExpiringScreen } from "@/components/landing/phone/ExpiringScreen";
import { CardsScreen } from "@/components/landing/phone/CardsScreen";
import { ChecklistIcon, ClockIcon, CardIcon } from "@/components/landing/icons";

function Phone({ children }: { children: React.ReactNode }) {
  return <div className="h-[620px]">{children}</div>;
}

export default function Home() {
  return (
    <main className="overflow-hidden bg-background text-ink">
      <Nav />
      <Hero />
      <TrustStrip />

      {/* Features intro */}
      <div
        id="features"
        className="mx-auto max-w-[1200px] px-6 pt-[86px] text-center md:px-10"
      >
        <div className="font-mono text-[12.5px] font-semibold uppercase tracking-[.1em] text-accent">
          What OfferBee does
        </div>
        <h2 className="mt-[14px] font-display text-[34px] font-semibold tracking-[-.02em] sm:text-[42px]">
          Every perk, in one calm place
        </h2>
        <p className="mx-auto mt-4 max-w-[34em] text-[18px] leading-[1.55] text-body">
          Premium cards bury hundreds of dollars in credits behind fine print.
          OfferBee surfaces them, tracks what you&apos;ve used, and reminds you
          before the clock runs out.
        </p>
      </div>

      <FeatureSection
        className="pt-16"
        icon={<ChecklistIcon size={24} />}
        tone="accent"
        title="See every credit at a glance"
        body="Monthly, quarterly, and annual credits from all your cards in one list. Mark one used and your captured total updates instantly — like a statement that keeps its own score."
        bullets={[
          {
            bold: "Grouped by reset cycle",
            rest: "— nothing slips through the cracks.",
          },
          { bold: 'One-tap "mark used"', rest: "keeps totals honest." },
        ]}
        phone={
          <Phone>
            <PhoneFrame>
              <BenefitsScreen theme="honey" />
            </PhoneFrame>
          </Phone>
        }
      />

      <FeatureSection
        className="pt-24"
        reverse
        icon={<ClockIcon size={24} />}
        tone="warning"
        title="Never miss a reset"
        body="OfferBee counts down the credits about to expire and nudges you while there's still time. Snooze the ones you'll get to; act on the ones that matter this week."
        bullets={[
          { bold: "Day-level countdowns", rest: "for every at-risk credit." },
          {
            bold: "Smart reminders",
            rest: "— timed to how you actually spend.",
          },
        ]}
        phone={
          <Phone>
            <PhoneFrame>
              <ExpiringScreen theme="honey" />
            </PhoneFrame>
          </Phone>
        }
      />

      <FeatureSection
        className="pt-24"
        icon={<CardIcon size={24} />}
        tone="accent"
        title="Know which cards to keep"
        body={
          <>
            Every card shows captured value against its annual fee, with a clear{" "}
            <em>keep</em> or <em>review</em> verdict at renewal. Downgrade with
            confidence, not guilt.
          </>
        }
        bullets={[
          { bold: "Fee-vs-value math", rest: "done automatically." },
          { bold: "Renewal alerts", rest: "before the fee posts." },
        ]}
        phone={
          <Phone>
            <PhoneFrame>
              <CardsScreen theme="honey" />
            </PhoneFrame>
          </Phone>
        }
      />

      <ThemeShowcase />
      <HowItWorks />
      <Stats />
      <Pricing />
      <Footer />
    </main>
  );
}
