"use client";

import { motion } from "motion/react";
import { CheckIcon } from "./icons";
import { Reveal } from "./motion/Reveal";
import { Stagger, StaggerItem } from "./motion/Stagger";
import { useReduced } from "./motion/useReduced";

function Feature({ children, color }: { children: string; color: string }) {
  return (
    <div className="flex gap-[10px] text-[15px]">
      <CheckIcon size={18} strokeWidth={2.2} className="shrink-0" style={{ color }} />
      {children}
    </div>
  );
}

export function Pricing() {
  const reduced = useReduced();

  const badgeClass =
    "absolute right-5 top-5 rounded-[7px] bg-accent px-[9px] py-[5px] font-mono text-[11px] font-semibold tracking-[.06em] text-white";

  return (
    <div id="pricing" className="mx-auto max-w-[1200px] px-6 pt-24 text-center md:px-10">
      <Reveal>
        <div className="font-mono text-[12.5px] font-semibold uppercase tracking-[.1em] text-accent">
          Pricing
        </div>
        <h2 className="mt-[14px] font-display text-[34px] font-semibold tracking-[-.02em] sm:text-[42px]">
          Pays for itself in one credit
        </h2>
      </Reveal>

      <Stagger
        className="mx-auto mt-11 grid max-w-[760px] gap-6 text-left md:grid-cols-2"
        stagger={0.1}
      >
        {/* Free */}
        <StaggerItem>
          <div className="h-full rounded-[22px] border border-border bg-surface p-8 transition-transform duration-200 hover:-translate-y-1">
            <div className="text-[15px] font-semibold text-secondary">Free</div>
            <div className="mt-2.5 flex items-baseline gap-1">
              <span className="font-mono text-[40px] font-semibold">$0</span>
            </div>
            <div className="mt-0.5 text-[14px] text-muted">Up to 2 cards</div>
            <div className="my-5 h-px bg-separator" />
            <div className="flex flex-col gap-[11px] text-ink-soft">
              <Feature color="var(--ob-accent)">Credit tracking &amp; resets</Feature>
              <Feature color="var(--ob-accent)">Expiry reminders</Feature>
            </div>
            <button
              type="button"
              className="mt-6 block w-full cursor-default rounded-xl border border-[#DAD2C2] bg-background py-3 text-center text-[15px] font-semibold text-ink"
            >
              Coming soon
            </button>
          </div>
        </StaggerItem>

        {/* Pro (fixed dark card — content, not themed) */}
        <StaggerItem>
          <div className="relative h-full rounded-[22px] bg-[#211D16] p-8 text-[#F5F1E9] transition-transform duration-200 hover:-translate-y-1">
            {reduced ? (
              <div className={badgeClass}>POPULAR</div>
            ) : (
              <motion.div
                className={badgeClass}
                initial={{ scale: 0, rotate: -8, opacity: 0 }}
                whileInView={{ scale: 1, rotate: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.5 }}
              >
                POPULAR
              </motion.div>
            )}
            <div className="text-[15px] font-semibold text-[#C9C0AE]">Pro</div>
            <div className="mt-2.5 flex items-baseline gap-1">
              <span className="font-mono text-[40px] font-semibold">$4</span>
              <span className="text-[15px] text-[#A69C86]">/mo</span>
            </div>
            <div className="mt-0.5 text-[14px] text-[#A69C86]">Unlimited cards</div>
            <div className="my-5 h-px bg-white/10" />
            <div className="flex flex-col gap-[11px] text-[#E8E1D2]">
              <Feature color="#F0A85C">Everything in Free</Feature>
              <Feature color="#F0A85C">Fee-vs-value verdicts</Feature>
              <Feature color="#F0A85C">CSV import &amp; export</Feature>
            </div>
            <button
              type="button"
              className="mt-6 block w-full cursor-default rounded-xl bg-accent py-3 text-center text-[15px] font-semibold text-white"
            >
              Coming soon
            </button>
          </div>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
