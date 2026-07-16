"use client";

import { motion } from "motion/react";
import { PhoneFrame } from "./phone/PhoneFrame";
import { ReviewScreen } from "./phone/ReviewScreen";
import { CheckIcon } from "./icons";
import { HeroAuthButton } from "./AuthButtons";
import { Stagger, StaggerItem } from "./motion/Stagger";
import { Parallax } from "./motion/Parallax";
import { useReduced } from "./motion/useReduced";

const trust = ["65+ cards", "Private by default"];

export function Hero() {
  const reduced = useReduced();

  const phone = (
    <motion.div
      animate={reduced ? undefined : { y: [0, -8, 0] }}
      transition={
        reduced ? undefined : { duration: 6, ease: "easeInOut", repeat: Infinity }
      }
    >
      <PhoneFrame scale={1.12}>
        <ReviewScreen theme="honey" />
      </PhoneFrame>
    </motion.div>
  );

  return (
    <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-6 pb-10 pt-14 md:grid-cols-[1.05fr_.95fr] md:px-10 md:pt-[76px]">
      <Stagger stagger={0.09} delayChildren={0.05}>
        <StaggerItem>
          <div className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-[13px] py-[7px] font-mono text-[12.5px] font-semibold tracking-[.02em] text-accent">
            <span className="size-1.5 rounded-full bg-accent" />
            iOS 26 · now in beta
          </div>
        </StaggerItem>

        <StaggerItem>
          <h1 className="mt-[22px] font-display text-[44px] font-semibold leading-[1.04] tracking-[-.025em] sm:text-[54px] md:text-[60px]">
            Your card perks,
            <br />
            actually <span className="italic text-accent">used.</span>
          </h1>
        </StaggerItem>

        <StaggerItem>
          <p className="mt-[22px] max-w-[30em] text-[19px] leading-[1.55] text-body">
            OfferBee tracks every statement credit and benefit across your premium
            cards — so you use them before they reset, and know which annual fees
            are still worth it.
          </p>
        </StaggerItem>

        <StaggerItem>
          <div className="mt-8 flex flex-wrap items-center gap-[14px]">
            <HeroAuthButton />
            <a
              href="#how"
              className="rounded-[13px] border border-[#DAD2C2] bg-surface px-6 py-[14px] text-[16px] font-semibold text-ink transition-colors hover:border-accent"
            >
              See how it works
            </a>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="mt-[30px] flex flex-wrap items-center gap-[22px] text-[14px] font-medium text-[#7A7263]">
            {trust.map((t) => (
              <div key={t} className="flex items-center gap-[7px]">
                <CheckIcon size={16} className="text-accent" strokeWidth={2.2} />
                {t}
              </div>
            ))}
          </div>
        </StaggerItem>
      </Stagger>

      <div className="relative flex justify-center">
        {/* Outer div owns the centering translate; inner motion div owns the breathe. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            className="size-[380px] rounded-full bg-[radial-gradient(circle,var(--ob-accent-soft),transparent_70%)]"
            animate={reduced ? undefined : { opacity: [0.6, 1, 0.6], scale: [1, 1.06, 1] }}
            transition={
              reduced ? undefined : { duration: 7, ease: "easeInOut", repeat: Infinity }
            }
          />
        </div>

        <Parallax range={30}>
          {reduced ? (
            <div className="relative h-[700px]">{phone}</div>
          ) : (
            <motion.div
              className="relative h-[700px]"
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            >
              {phone}
            </motion.div>
          )}
        </Parallax>
      </div>
    </div>
  );
}
