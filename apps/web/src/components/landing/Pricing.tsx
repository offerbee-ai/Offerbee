"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useUser } from "@clerk/nextjs";
import { CheckIcon } from "./icons";
import { Reveal } from "./motion/Reveal";
import { useReduced } from "./motion/useReduced";

const FEATURES = [
  "Automatic credit detection",
  "Reminders before credits reset",
  "Fee-vs-value verdict at each renewal",
  "Unlimited cards & year-by-year history",
];

function Feature({ children }: { children: string }) {
  return (
    <div className="flex gap-[10px] text-[15px] text-ink-soft">
      <CheckIcon
        size={18}
        strokeWidth={2.2}
        className="mt-[2px] shrink-0"
        style={{ color: "var(--ob-accent)" }}
      />
      {children}
    </div>
  );
}

// Pricing mirrors the in-app paywall (Design/design_handoff_paywall): one Pro
// plan with a 14-day no-card trial — features are common, so they're listed
// once with the two billing options beside them.
export function Pricing() {
  const reduced = useReduced();
  const { isSignedIn } = useUser();

  const ctaHref = isSignedIn ? "/app" : "/welcome";
  const ctaLabel = isSignedIn ? "Open app" : "Start free trial";

  const badgeClass =
    "absolute -top-3 right-4 rounded-full bg-accent px-[9px] py-[4px] font-mono text-[11px] font-semibold tracking-[.06em] text-white";

  return (
    <div id="pricing" className="mx-auto max-w-[1200px] scroll-mt-24 px-6 pt-24 text-center md:px-10">
      <Reveal>
        <div className="font-mono text-[12.5px] font-semibold uppercase tracking-[.1em] text-accent">
          Pricing
        </div>
        <h2 className="mt-[14px] font-display text-[34px] font-semibold tracking-[-.02em] sm:text-[42px]">
          Pays for itself in one credit
        </h2>
        <p className="mt-3 text-[16px] text-secondary">
          Try everything free for 14 days — no card required.
        </p>
      </Reveal>

      <Reveal>
        <div className="mx-auto mt-11 grid max-w-[880px] gap-10 rounded-[22px] border border-border bg-surface p-8 text-left sm:p-10 md:grid-cols-[1fr_1fr] md:gap-12">
          {/* Everything included — one plan, two ways to pay */}
          <div>
            <div className="font-mono text-[12.5px] font-semibold uppercase tracking-[.1em] text-accent">
              OfferBee Pro
            </div>
            <h3 className="mt-2.5 font-display text-[28px] font-semibold tracking-[-.01em]">
              One plan, everything included
            </h3>
            <div className="mt-5 flex flex-col gap-[13px]">
              {FEATURES.map((f) => (
                <Feature key={f}>{f}</Feature>
              ))}
            </div>
          </div>

          {/* Billing options + one CTA */}
          <div className="flex flex-col gap-3">
            <div className="relative rounded-[16px] border-2 border-accent bg-background px-5 py-4">
              {reduced ? (
                <div className={badgeClass}>BEST VALUE</div>
              ) : (
                <motion.div
                  className={badgeClass}
                  initial={{ scale: 0, rotate: -8, opacity: 0 }}
                  whileInView={{ scale: 1, rotate: 0, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.4 }}
                >
                  BEST VALUE
                </motion.div>
              )}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[15px] font-semibold">Yearly</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[13px] text-secondary">
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
                      save 33%
                    </span>
                    $6.67/mo
                  </div>
                </div>
                <div className="font-mono text-[24px] font-semibold">
                  $80
                  <span className="ml-0.5 font-sans text-[13px] font-normal text-secondary">
                    /yr
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-[16px] border border-border bg-background px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[15px] font-semibold">Monthly</div>
                  <div className="mt-0.5 text-[13px] text-secondary">Cancel anytime</div>
                </div>
                <div className="font-mono text-[24px] font-semibold">
                  $9.99
                  <span className="ml-0.5 font-sans text-[13px] font-normal text-secondary">
                    /mo
                  </span>
                </div>
              </div>
            </div>

            <Link
              href={ctaHref}
              className="mt-2 block w-full rounded-xl bg-accent py-3 text-center text-[15px] font-semibold text-white transition-colors hover:bg-accent-strong"
            >
              {ctaLabel}
            </Link>
            <p className="text-center text-[12px] text-tertiary">
              Pick your plan after the trial — you won&apos;t be charged before it ends.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <p className="mt-8 text-[13px] text-tertiary">
          14-day free trial · Cancel anytime · Prices in USD
        </p>
      </Reveal>
    </div>
  );
}
