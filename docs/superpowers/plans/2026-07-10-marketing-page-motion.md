# Marketing Page Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cohesive, rich-but-calm motion layer (scroll reveals, stagger, parallax, count-up, hero ambient loops) to every section of the `apps/web` marketing page, fully honoring `prefers-reduced-motion`.

**Architecture:** Introduce the `motion` library (framer-motion successor). Build 5 small reusable client primitives under `src/components/landing/motion/`, then wrap/edit each landing section to use them. Server components stay server where possible by rendering client *wrapper* primitives with server children; only `Nav`, `Hero`, `Stats`, `Pricing` become `"use client"` (they own hooks/state/bespoke motion).

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, `motion` v12 (`motion/react`).

---

## Testing note (read first)

`web-app` has **no test runner** (no vitest/jest in deps). Adding one for animation code is out of scope per the spec. Per-task verification is therefore:
- `pnpm --filter web-app typecheck` (must pass)
- Browser QA for visual tasks (dev server: `pnpm --filter web-app dev`, open http://localhost:3000)
- Final task runs the full `pnpm --filter web-app build` + a reduced-motion toggle pass.

The one piece of pure logic (`parseFigure`) gets a throwaway `node -e` sanity check instead of a framework.

Commit after each task. Follow the repo/global rule: conventional commit messages, no AI attribution.

---

## File Structure

**Create:**
- `apps/web/src/components/landing/motion/useReduced.ts` — reduced-motion hook (coerces null→false)
- `apps/web/src/components/landing/motion/Reveal.tsx` — fade + x/y slide on scroll into view
- `apps/web/src/components/landing/motion/Stagger.tsx` — `Stagger` + `StaggerItem` orchestration
- `apps/web/src/components/landing/motion/Parallax.tsx` — scroll-linked translateY wrapper
- `apps/web/src/components/landing/motion/parseFigure.ts` — pure figure parser for count-up
- `apps/web/src/components/landing/motion/CountUp.tsx` — animate number 0→target on view

**Modify:**
- `apps/web/package.json` (add `motion` dep — via pnpm, not by hand)
- `apps/web/src/components/landing/Nav.tsx` → client
- `apps/web/src/components/landing/Hero.tsx` → client
- `apps/web/src/components/landing/TrustStrip.tsx`
- `apps/web/src/app/page.tsx` (features intro Reveal)
- `apps/web/src/components/landing/FeatureSection.tsx`
- `apps/web/src/components/landing/ThemeShowcase.tsx`
- `apps/web/src/components/landing/HowItWorks.tsx`
- `apps/web/src/components/landing/Stats.tsx` → client
- `apps/web/src/components/landing/Pricing.tsx` → client
- `apps/web/src/components/landing/Footer.tsx`

---

## Task 1: Install the `motion` library

**Files:**
- Modify: `apps/web/package.json` (via pnpm)

- [ ] **Step 1: Install**

Run from repo root:
```bash
pnpm --filter web-app add motion
```

- [ ] **Step 2: Verify it resolved**

Run:
```bash
pnpm --filter web-app exec node -e "console.log(require('motion/package.json').version)"
```
Expected: prints a `12.x` (or later) version, no error.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add motion library for landing animations"
```

---

## Task 2: `useReduced` hook

**Files:**
- Create: `apps/web/src/components/landing/motion/useReduced.ts`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useReducedMotion } from "motion/react";

/** `useReducedMotion` can return null during SSR/first paint; coerce to a boolean. */
export function useReduced(): boolean {
  return useReducedMotion() ?? false;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web-app typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/motion/useReduced.ts
git commit -m "feat(web): add useReduced motion hook"
```

---

## Task 3: `Reveal` primitive

**Files:**
- Create: `apps/web/src/components/landing/motion/Reveal.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useReduced } from "./useReduced";

/**
 * Fades + slides children into their resting position when scrolled into view.
 * Fires once. Under reduced motion, renders a plain div in the final state.
 */
export function Reveal({
  children,
  className,
  x = 0,
  y = 16,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  x?: number;
  y?: number;
  delay?: number;
}) {
  const reduced = useReduced();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web-app typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/motion/Reveal.tsx
git commit -m "feat(web): add Reveal scroll primitive"
```

---

## Task 4: `Stagger` + `StaggerItem` primitives

**Files:**
- Create: `apps/web/src/components/landing/motion/Stagger.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";
import { useReduced } from "./useReduced";

const containerVariants = (stagger: number, delayChildren: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren } },
});

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

/** Parent orchestrator: staggers its <StaggerItem> children into view, once. */
export function Stagger({
  children,
  className,
  stagger = 0.06,
  delayChildren = 0,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
}) {
  const reduced = useReduced();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={containerVariants(stagger, delayChildren)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-10% 0px" }}
    >
      {children}
    </motion.div>
  );
}

/** Child of <Stagger>. Inherits the fade+slide item variant. */
export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReduced();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web-app typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/motion/Stagger.tsx
git commit -m "feat(web): add Stagger and StaggerItem primitives"
```

---

## Task 5: `Parallax` primitive

**Files:**
- Create: `apps/web/src/components/landing/motion/Parallax.tsx`

Note: this MUST be an **outer** wrapper around `PhoneFrame` — `PhoneFrame` applies its own inline `transform: scale()`, so parallax translate lives on a separate parent element and never overwrites the scale.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useReduced } from "./useReduced";

/**
 * Drifts children vertically as the element scrolls through the viewport.
 * Under reduced motion, renders a static wrapper.
 */
export function Parallax({
  children,
  className,
  range = 40,
}: {
  children: ReactNode;
  className?: string;
  range?: number;
}) {
  const reduced = useReduced();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [range, -range]);

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web-app typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/motion/Parallax.tsx
git commit -m "feat(web): add Parallax scroll primitive"
```

---

## Task 6: `parseFigure` pure helper

**Files:**
- Create: `apps/web/src/components/landing/motion/parseFigure.ts`

- [ ] **Step 1: Write the file**

```ts
/**
 * Splits a Stats figure string into an animatable number plus static affixes.
 * Examples: "$1,240" -> { prefix: "$", target: 1240, suffix: "" }
 *           "65+"    -> { prefix: "",  target: 65,   suffix: "+" }
 *           "3 min"  -> { prefix: "",  target: 3,    suffix: " min" }
 */
export function parseFigure(raw: string): {
  prefix: string;
  target: number;
  suffix: string;
} {
  const match = raw.match(/^(\D*)([\d,]+)(.*)$/);
  if (!match) return { prefix: "", target: 0, suffix: raw };
  const [, prefix, digits, suffix] = match;
  return { prefix, target: parseInt(digits.replace(/,/g, ""), 10), suffix };
}
```

- [ ] **Step 2: Sanity-check the parser**

Run:
```bash
pnpm --filter web-app exec npx tsx -e "import { parseFigure } from './src/components/landing/motion/parseFigure.ts'; console.log(parseFigure('\$1,240'), parseFigure('65+'), parseFigure('3 min'));"
```
Expected output:
```
{ prefix: '$', target: 1240, suffix: '' } { prefix: '', target: 65, suffix: '+' } { prefix: '', target: 3, suffix: ' min' }
```
If `tsx` is unavailable, skip this step — Task 7 exercises the parser at runtime in the browser instead.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter web-app typecheck` → PASS.
```bash
git add apps/web/src/components/landing/motion/parseFigure.ts
git commit -m "feat(web): add parseFigure helper for count-up"
```

---

## Task 7: `CountUp` primitive

**Files:**
- Create: `apps/web/src/components/landing/motion/CountUp.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "motion/react";
import { useReduced } from "./useReduced";
import { parseFigure } from "./parseFigure";

/** Counts a figure up from 0 to its target when scrolled into view, once. */
export function CountUp({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const { prefix, target, suffix } = parseFigure(value);
  const reduced = useReduced();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const [display, setDisplay] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced || !inView) return;
    const controls = animate(0, target, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, reduced, target]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web-app typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/motion/CountUp.tsx
git commit -m "feat(web): add CountUp primitive"
```

---

## Task 8: Animate the Nav

**Files:**
- Modify: `apps/web/src/components/landing/Nav.tsx`

- [ ] **Step 1: Replace the file**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { BrandMark } from "./BrandMark";
import { NavAuthButtons } from "./AuthButtons";
import { useReduced } from "./motion/useReduced";

const links = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how" },
  { label: "Design", href: "#themes" },
  { label: "Pricing", href: "#pricing" },
];

export function Nav() {
  const reduced = useReduced();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.div
      initial={reduced ? false : { y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`sticky top-0 z-50 border-b bg-glass backdrop-blur-[16px] backdrop-saturate-150 transition-shadow ${
        scrolled ? "border-border shadow-ob-sm" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4 md:px-10">
        <Link href="/" aria-label="OfferBee home">
          <BrandMark gid="nav" />
        </Link>

        <div className="hidden items-center gap-9 text-[15px] font-medium text-ink-soft md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-accent">
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <NavAuthButtons />
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Typecheck + browser check**

Run: `pnpm --filter web-app typecheck` → PASS.
Browser: reload http://localhost:3000 — nav slides down on load; border/shadow appears after scrolling ~20px, disappears at top.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/Nav.tsx
git commit -m "feat(web): animate nav entrance and scroll state"
```

---

## Task 9: Animate the Hero

**Files:**
- Modify: `apps/web/src/components/landing/Hero.tsx`

Reveal/stagger the left column; scale-in + ambient float + parallax on the phone; ambient breathe on the glow. The glow's centering translate lives on an outer static div so motion's `scale`/`opacity` on the inner div doesn't clobber it.

- [ ] **Step 1: Replace the file**

```tsx
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
          <motion.div
            className="relative h-[700px]"
            initial={reduced ? false : { opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          >
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
          </motion.div>
        </Parallax>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + browser check**

Run: `pnpm --filter web-app typecheck` → PASS.
Browser: hero left column staggers in on load; phone scales/fades in then floats gently and drifts on scroll; glow breathes; phone keeps its 1.12 scale (not shrunk/misplaced).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/Hero.tsx
git commit -m "feat(web): animate hero entrance, float, parallax, and glow"
```

---

## Task 10: Animate the TrustStrip

**Files:**
- Modify: `apps/web/src/components/landing/TrustStrip.tsx`

Stays a server component; renders the client `Stagger` with server children. Two stagger items (label, card group) preserve the justify-between layout.

- [ ] **Step 1: Replace the file**

```tsx
import { Stagger, StaggerItem } from "./motion/Stagger";

const cards = [
  "Amex Platinum",
  "Chase Sapphire",
  "Amex Gold",
  "Cap One Venture X",
  "Hilton Aspire",
];

export function TrustStrip() {
  return (
    <div className="mx-auto mt-6 max-w-[1200px] px-6 md:px-10">
      <Stagger
        className="flex flex-wrap items-center justify-between gap-[18px] border-y border-border py-[22px]"
        stagger={0.08}
      >
        <StaggerItem>
          <span className="font-mono text-[12px] font-medium uppercase tracking-[.08em] text-tertiary">
            Tracks credits on
          </span>
        </StaggerItem>
        <StaggerItem>
          <div className="flex flex-wrap items-center gap-x-[30px] gap-y-2 font-display text-[17px] font-semibold text-muted">
            {cards.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + browser check**

Run: `pnpm --filter web-app typecheck` → PASS.
Browser: scrolling to the trust strip fades in the label then the card group.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/TrustStrip.tsx
git commit -m "feat(web): stagger the trust strip into view"
```

---

## Task 11: Reveal the features intro block

**Files:**
- Modify: `apps/web/src/app/page.tsx`

Wrap the inline "What OfferBee does" intro block in `Reveal`. `page.tsx` stays a server component importing the client `Reveal`.

- [ ] **Step 1: Add the import**

At the top of `apps/web/src/app/page.tsx`, add with the other landing imports:
```tsx
import { Reveal } from "@/components/landing/motion/Reveal";
```

- [ ] **Step 2: Wrap the intro block**

Replace the existing intro `<div id="features" ...> ... </div>` block (currently lines 28–43) with:
```tsx
      <Reveal
        as-comment="features intro"
        className="mx-auto max-w-[1200px] px-6 pt-[86px] text-center md:px-10"
      >
        <div id="features" className="scroll-mt-24">
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
      </Reveal>
```
Note: the `id="features"` anchor moves onto an inner div (the Reveal wrapper is the padded container). Remove the stray `as-comment` attribute — it is only here to flag the block; the final code is:
```tsx
      <Reveal className="mx-auto max-w-[1200px] px-6 pt-[86px] text-center md:px-10">
        <div id="features" className="scroll-mt-24">
          {/* ...the three text elements above... */}
        </div>
      </Reveal>
```

- [ ] **Step 3: Typecheck + browser check**

Run: `pnpm --filter web-app typecheck` → PASS.
Browser: the Features nav link still jumps to this block; the heading + copy fade/slide in on scroll.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): reveal the features intro block on scroll"
```

---

## Task 12: Animate the FeatureSection

**Files:**
- Modify: `apps/web/src/components/landing/FeatureSection.tsx`

Stays a server component. Text column staggers (chip → title → body → bullets). Art column slides in from the correct edge (`reverse`-aware) and gets parallax.

- [ ] **Step 1: Replace the file**

```tsx
import type { ReactNode } from "react";
import { CheckIcon } from "./icons";
import { Stagger, StaggerItem } from "./motion/Stagger";
import { Reveal } from "./motion/Reveal";
import { Parallax } from "./motion/Parallax";

type Tone = "accent" | "warning";
export type Bullet = { bold: string; rest: string };

export function FeatureSection({
  icon,
  tone = "accent",
  title,
  body,
  bullets,
  phone,
  reverse = false,
  className = "",
}: {
  icon: ReactNode;
  tone?: Tone;
  title: string;
  body: ReactNode;
  bullets: Bullet[];
  phone: ReactNode;
  reverse?: boolean;
  className?: string;
}) {
  const toneColor = tone === "accent" ? "text-accent" : "text-warning";
  const chipBg = tone === "accent" ? "bg-accent-soft" : "bg-warning-soft";

  const text = (
    <Stagger stagger={0.07}>
      <StaggerItem>
        <div
          className={`mb-[18px] inline-flex size-11 items-center justify-center rounded-xl ${chipBg} ${toneColor}`}
        >
          {icon}
        </div>
      </StaggerItem>
      <StaggerItem>
        <h3 className="font-display text-[28px] font-semibold tracking-[-.015em] sm:text-[32px]">
          {title}
        </h3>
      </StaggerItem>
      <StaggerItem>
        <p className="mt-[14px] max-w-[26em] text-[17px] leading-[1.6] text-body">
          {body}
        </p>
      </StaggerItem>
      <StaggerItem>
        <div className="mt-[26px] flex flex-col gap-[14px]">
          {bullets.map((b) => (
            <div key={b.bold} className="flex items-start gap-3">
              <CheckIcon
                size={20}
                strokeWidth={2.2}
                className={`mt-0.5 shrink-0 ${toneColor}`}
              />
              <span className="text-[16px] text-ink-soft">
                <strong className="font-semibold">{b.bold}</strong> {b.rest}
              </span>
            </div>
          ))}
        </div>
      </StaggerItem>
    </Stagger>
  );

  const art = (
    <Reveal x={reverse ? -48 : 48} y={0} className="flex justify-center">
      <Parallax range={36}>{phone}</Parallax>
    </Reveal>
  );

  return (
    <div
      className={`mx-auto grid max-w-[1200px] items-center gap-14 px-6 md:grid-cols-2 md:gap-16 md:px-10 ${className}`}
    >
      {reverse ? (
        <>
          <div className="order-2 md:order-1">{art}</div>
          <div className="order-1 md:order-2">{text}</div>
        </>
      ) : (
        <>
          {text}
          {art}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + browser check**

Run: `pnpm --filter web-app typecheck` → PASS.
Browser: each of the 3 feature blocks — text staggers in; phone slides in from the outer edge (right for normal, left for the reversed middle block) and drifts on scroll; phones keep their bezel/scale.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/FeatureSection.tsx
git commit -m "feat(web): stagger feature text and slide/parallax the phone art"
```

---

## Task 13: Animate the ThemeShowcase

**Files:**
- Modify: `apps/web/src/components/landing/ThemeShowcase.tsx`

Stays server. Left text staggers; the two Onyx phones slide in from the right and get parallax.

- [ ] **Step 1: Replace the file**

```tsx
import { PhoneFrame } from "./phone/PhoneFrame";
import { ReviewScreen } from "./phone/ReviewScreen";
import { CardDetailScreen } from "./phone/CardDetailScreen";
import { Stagger, StaggerItem } from "./motion/Stagger";
import { Reveal } from "./motion/Reveal";
import { Parallax } from "./motion/Parallax";

/**
 * The one dark band on the (otherwise Honey/light) marketing page. Wrapped in
 * `.theme-onyx` so both the band chrome and the phone mockups render in Onyx.
 */
export function ThemeShowcase() {
  return (
    <div id="themes" className="theme-onyx mt-[100px] bg-background text-ink">
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-6 py-[84px] md:grid-cols-[.95fr_1.05fr] md:gap-14 md:px-10">
        <Stagger stagger={0.08}>
          <StaggerItem>
            <div className="font-mono text-[12.5px] font-semibold uppercase tracking-[.1em] text-accent">
              Light &amp; dark
            </div>
          </StaggerItem>
          <StaggerItem>
            <h2 className="mt-[14px] font-display text-[34px] font-semibold tracking-[-.02em] text-ink sm:text-[40px]">
              Beautiful at 7am
              <br />
              and midnight
            </h2>
          </StaggerItem>
          <StaggerItem>
            <p className="mt-4 max-w-[28em] text-[17px] leading-[1.6] text-body">
              OfferBee ships two hand-tuned themes — warm{" "}
              <span className="font-semibold text-accent-strong">Honey</span> for
              daylight and deep{" "}
              <span className="font-semibold text-accent-strong">Onyx</span> for
              night. Same layout, same clarity, matched to your system
              automatically.
            </p>
          </StaggerItem>
          <StaggerItem>
            <div className="mt-7 flex gap-3">
              <div className="flex items-center gap-[9px] rounded-chip border border-border bg-surface px-[14px] py-[9px]">
                <span className="size-4 rounded-[5px] bg-[#FBF8F0]" />
                <span className="text-[14px] font-semibold">Honey</span>
              </div>
              <div className="flex items-center gap-[9px] rounded-chip border border-border bg-surface px-[14px] py-[9px]">
                <span className="size-4 rounded-[5px] bg-[#F59E3C]" />
                <span className="text-[14px] font-semibold">Onyx</span>
              </div>
            </div>
          </StaggerItem>
        </Stagger>

        <div className="flex justify-center gap-[26px]">
          <Reveal x={40} y={0}>
            <Parallax range={30}>
              <div className="h-[580px]">
                <PhoneFrame scale={0.92}>
                  <ReviewScreen theme="onyx" />
                </PhoneFrame>
              </div>
            </Parallax>
          </Reveal>
          <Reveal x={40} y={0} delay={0.08} className="hidden sm:block">
            <Parallax range={48}>
              <div className="h-[580px] md:mt-[34px]">
                <PhoneFrame scale={0.92}>
                  <CardDetailScreen theme="onyx" />
                </PhoneFrame>
              </div>
            </Parallax>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + browser check**

Run: `pnpm --filter web-app typecheck` → PASS.
Browser: dark band — text staggers in; both Onyx phones slide in from the right (second slightly later) and drift on scroll; the second phone stays hidden below `sm`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/ThemeShowcase.tsx
git commit -m "feat(web): animate the theme showcase band"
```

---

## Task 14: Animate HowItWorks

**Files:**
- Modify: `apps/web/src/components/landing/HowItWorks.tsx`

Stays server. Heading reveals; the three step cards stagger in; each card gets a small CSS hover lift.

- [ ] **Step 1: Replace the file**

```tsx
import { Reveal } from "./motion/Reveal";
import { Stagger, StaggerItem } from "./motion/Stagger";

const steps = [
  {
    n: "01",
    title: "Add your cards",
    body: "Pick from 65+ premium cards, or import a wallet CSV.",
  },
  {
    n: "02",
    title: "OfferBee maps the perks",
    body: "Every credit, cycle, and reset date is loaded automatically — nothing to type.",
  },
  {
    n: "03",
    title: "Use them, keep score",
    body: "Mark credits used, watch your captured total climb past every annual fee.",
  },
];

export function HowItWorks() {
  return (
    <div id="how" className="mx-auto max-w-[1200px] px-6 pt-[90px] md:px-10">
      <Reveal className="text-center">
        <div className="font-mono text-[12.5px] font-semibold uppercase tracking-[.1em] text-accent">
          How it works
        </div>
        <h2 className="mt-[14px] font-display text-[34px] font-semibold tracking-[-.02em] sm:text-[42px]">
          Set up in three minutes
        </h2>
      </Reveal>
      <Stagger className="mt-12 grid gap-[26px] md:grid-cols-3" stagger={0.1}>
        {steps.map((s) => (
          <StaggerItem
            key={s.n}
            className="rounded-[20px] border border-border bg-surface p-[30px] transition-transform duration-200 hover:-translate-y-1"
          >
            <div className="font-mono text-[13px] font-semibold text-accent">
              {s.n}
            </div>
            <h4 className="mt-[14px] font-display text-[22px] font-semibold">
              {s.title}
            </h4>
            <p className="mt-[10px] text-[15.5px] leading-[1.6] text-body">
              {s.body}
            </p>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + browser check**

Run: `pnpm --filter web-app typecheck` → PASS.
Browser: heading reveals; the three cards stagger in left-to-right; hovering a card lifts it slightly.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/HowItWorks.tsx
git commit -m "feat(web): stagger how-it-works steps with hover lift"
```

---

## Task 15: Animate the Stats (count-up)

**Files:**
- Modify: `apps/web/src/components/landing/Stats.tsx`

Becomes client. Band reveals, columns stagger, figures count up.

- [ ] **Step 1: Replace the file**

```tsx
"use client";

import { Reveal } from "./motion/Reveal";
import { Stagger, StaggerItem } from "./motion/Stagger";
import { CountUp } from "./motion/CountUp";

const stats = [
  { figure: "$1,240", label: "avg. credits left unused per cardholder each year" },
  { figure: "65+", label: "premium cards with perks mapped out of the box" },
  { figure: "3 min", label: "to set up your whole wallet" },
];

export function Stats() {
  return (
    <div className="mx-auto max-w-[1200px] px-6 pt-20 md:px-10">
      <Reveal>
        <Stagger
          className="grid gap-8 rounded-[26px] bg-accent px-8 py-[52px] text-[#FDF1E4] md:grid-cols-3 md:px-12"
          stagger={0.12}
        >
          {stats.map((s, i) => (
            <StaggerItem
              key={s.figure}
              className={i > 0 ? "md:border-l md:border-white/15 md:pl-8" : undefined}
            >
              <div className="font-mono text-[46px] font-semibold tracking-[-.02em]">
                <CountUp value={s.figure} />
              </div>
              <div className="mt-1.5 text-[15px] text-[#F3D3AE]">{s.label}</div>
            </StaggerItem>
          ))}
        </Stagger>
      </Reveal>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + browser check**

Run: `pnpm --filter web-app typecheck` → PASS.
Browser: scrolling to the accent band — it reveals, columns stagger, and figures count up to `$1,240`, `65+`, `3 min` (comma preserved, suffixes intact).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/Stats.tsx
git commit -m "feat(web): count-up and stagger the stats band"
```

---

## Task 16: Animate the Pricing

**Files:**
- Modify: `apps/web/src/components/landing/Pricing.tsx`

Becomes client (for the POPULAR spring). Heading reveals; cards stagger with hover lift; the POPULAR badge springs in.

- [ ] **Step 1: Replace the file**

```tsx
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
        <StaggerItem className="transition-transform duration-200 hover:-translate-y-1">
          <div className="rounded-[22px] border border-border bg-surface p-8">
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
        <StaggerItem className="transition-transform duration-200 hover:-translate-y-1">
          <div className="relative rounded-[22px] bg-[#211D16] p-8 text-[#F5F1E9]">
            <motion.div
              className="absolute right-5 top-5 rounded-[7px] bg-accent px-[9px] py-[5px] font-mono text-[11px] font-semibold tracking-[.06em] text-white"
              initial={reduced ? false : { scale: 0, rotate: -8, opacity: 0 }}
              whileInView={{ scale: 1, rotate: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.5 }}
            >
              POPULAR
            </motion.div>
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
```

- [ ] **Step 2: Typecheck + browser check**

Run: `pnpm --filter web-app typecheck` → PASS.
Browser: heading reveals; both cards stagger in and lift on hover; the POPULAR badge springs in after the Pro card settles.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/Pricing.tsx
git commit -m "feat(web): animate pricing cards and popular badge"
```

---

## Task 17: Reveal the Footer

**Files:**
- Modify: `apps/web/src/components/landing/Footer.tsx`

Stays server. Wrap the main footer content row in `Reveal`.

- [ ] **Step 1: Edit the file**

Add the import at the top:
```tsx
import { Reveal } from "./motion/Reveal";
```
Then wrap the main content row. Replace the existing:
```tsx
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-start justify-between gap-8 px-6 py-12 md:px-10">
```
...with a `Reveal` wrapper carrying the same classes, closing it before the copyright row:
```tsx
      <Reveal className="mx-auto flex max-w-[1200px] flex-wrap items-start justify-between gap-8 px-6 py-12 md:px-10">
```
And change that block's closing `</div>` (the one immediately before the `© 2026` copyright `<div>`) to `</Reveal>`. The copyright row below stays as-is (no wrapper).

- [ ] **Step 2: Typecheck + browser check**

Run: `pnpm --filter web-app typecheck` → PASS.
Browser: footer content fades/slides in when scrolled to; the copyright line renders normally.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/Footer.tsx
git commit -m "feat(web): reveal the footer on scroll"
```

---

## Task 18: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole web app**

Run: `pnpm --filter web-app typecheck`
Expected: PASS.

- [ ] **Step 2: Production build**

Run: `pnpm --filter web-app build`
Expected: build succeeds with no errors (confirms the new client boundaries compile under RSC).

- [ ] **Step 3: Browser QA — normal motion**

With `pnpm --filter web-app dev` running, load http://localhost:3000 and scroll top→bottom. Confirm:
- Nav slides in; border/shadow toggles on scroll.
- Hero staggers, phone floats + parallax, glow breathes.
- Trust strip, features intro, all 3 feature sections, theme band, how-it-works, stats (count-up), pricing (spring badge), footer each animate once on view.
- No section re-animates when scrolling back up.
- No horizontal scrollbar / layout shift; all phone mockups keep their scale.

- [ ] **Step 4: Browser QA — reduced motion**

Enable OS "Reduce motion" (macOS: System Settings → Accessibility → Display → Reduce motion), hard-reload the page. Confirm:
- Every section renders fully visible in its final state.
- No entrance animation, no hero float/breathe, no count-up (stats show final `$1,240` / `65+` / `3 min`), no parallax drift.

- [ ] **Step 5: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore(web): finalize marketing page motion pass"
```
(If nothing changed in this task, skip the commit.)

---

## Self-Review (completed by plan author)

- **Spec coverage:** every section in the spec's per-section table maps to a task (Nav→T8, Hero→T9, TrustStrip→T10, Features intro→T11, FeatureSection→T12, ThemeShowcase→T13, HowItWorks→T14, Stats→T15, Pricing→T16, Footer→T17). All 5 primitives + reduced-motion helper covered (T2–T7). Ambient loops (T9), parallax-vs-scale gotcha (T5 note, T9), reduced-motion bypass (every primitive), verification incl. reduced-motion toggle (T18).
- **Placeholders:** none — every code step shows complete code. The one flagged stray attribute (`as-comment` in T11) is explicitly called out and removed in the same step's final snippet.
- **Type/name consistency:** `useReduced`, `Reveal` (props `x`,`y`,`delay`,`className`), `Stagger`/`StaggerItem` (`className` on both), `Parallax` (`range`), `CountUp` (`value`), `parseFigure` (`{prefix,target,suffix}`) are used identically across all consuming tasks.
