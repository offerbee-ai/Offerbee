# Marketing Page Motion — Design Spec

Date: 2026-07-10
Status: Approved for planning
Scope: `apps/web` marketing (landing) page only. No changes to the authenticated app shell.

## Goal

The marketing page (`apps/web/src/app/page.tsx` + `src/components/landing/*`) is fully static — zero animation. Add a cohesive, **rich & orchestrated** motion layer that reads as calm and premium (matching the "one calm place" brand), covering **every** section in one pass, including tasteful **ambient loops** on the hero.

## Constraints & Principles

- **Library:** add `motion` (framer-motion successor, React 19 compatible) to the `web-app` package. Import from `motion/react`.
- **Accessibility:** every animation must honor `prefers-reduced-motion`. When reduced motion is set, content renders in its final state instantly — no transforms, no loops, no scroll-linked movement.
- **Performance:** animate `transform` and `opacity` only (GPU-friendly). Scroll reveals use `once: true` so they never re-trigger. Ambient loops are the only perpetual motion and are disabled under reduced motion.
- **SSR boundary:** landing components are currently server components. Motion requires client components. Keep content server-rendered where practical by using client *wrapper* primitives that accept `children`; only components with their own internal motion state (Nav scroll listener, Hero orchestration, Stats count-up) get a `"use client"` directive.
- **Design tokens:** reuse existing CSS variables / Tailwind tokens. Do not introduce new colors. Motion is additive; visual design is unchanged in its resting state.

## Architecture — Reusable Motion Primitives

New directory: `apps/web/src/components/landing/motion/`

1. **`Reveal.tsx`** — wraps children; fades + slides up (`opacity 0→1`, `translateY y→0`) when scrolled into view.
   - Props: `y` (default 16), `delay` (default 0), `as` (element/tag, default `div`), `className`, `children`.
   - Uses `whileInView` with `viewport={{ once: true, margin: "-10% 0px" }}` so it fires slightly before fully visible.
   - Reduced motion → renders a plain element in final state.

2. **`Stagger.tsx`** — exports `Stagger` (parent, orchestrates `staggerChildren`) + `StaggerItem` (child).
   - `Stagger` props: `stagger` (default 0.06s), `delayChildren` (default 0), `className`, `as`, `children`. Uses `whileInView` + `once`.
   - `StaggerItem` inherits the fade+slide variant from the parent via variants.
   - Reduced motion → both render plain elements, no variants.

3. **`Parallax.tsx`** — wraps children in an **outer** `motion.div` and translates it on scroll via `useScroll` + `useTransform`.
   - Props: `range` (px of drift, default ~40), `className`, `children`.
   - MUST be an outer wrapper so it composes with `PhoneFrame`'s inner inline `transform: scale(...)` instead of overwriting it.
   - Reduced motion → renders a static wrapper, no transform.

4. **`CountUp.tsx`** — animates a numeric figure from 0 to its target when scrolled into view, once.
   - Handles the existing Stats formats: `$1,240`, `65+`, `3 min`. Parse into `{ prefix, number, suffix }`, animate only `number`, re-apply thousands separators, keep prefix/suffix static.
   - Uses `useInView` + `useMotionValue`/`animate` (or `useSpring`), rounding to integer during the tween.
   - Reduced motion → renders the final formatted string immediately.

All four primitives centralize the reduced-motion check (a small shared `useReduced()` helper wrapping `useReducedMotion()` is acceptable).

## Per-Section Motion Plan

Applied by wrapping sections in `page.tsx` and/or editing the section components.

- **Nav** (`Nav.tsx`, becomes client): slides down + fades on mount. A scroll listener strengthens the bottom border / adds shadow once `scrollY > 20`. Existing hover color transitions kept.
- **Hero** (`Hero.tsx`, becomes client): staggered entrance of the left column — badge → headline → paragraph → CTA row → trust row. Right column phone: scale + fade in on mount, then an **ambient float loop** (`translateY 0 ↔ -8px`, ~6s ease-in-out, infinite) plus **parallax** drift on scroll. Radial glow behind the phone gets a slow **breathe** loop (subtle opacity/scale pulse). All loops disabled under reduced motion.
- **TrustStrip** (`TrustStrip.tsx`): the "Tracks credits on" label and the card-name list stagger in on view.
- **Features intro** (inline block in `page.tsx`): `Reveal` on the eyebrow + heading + paragraph.
- **FeatureSection ×3** (`FeatureSection.tsx`): text column staggers (icon chip → title → body → bullets). The phone/art column slides in from the side and gets parallax on scroll. Direction respects the `reverse` prop (art enters from the correct edge in each layout).
- **ThemeShowcase** (`ThemeShowcase.tsx`): text column reveals; the two Onyx phones stagger in and each gets parallax.
- **HowItWorks** (`HowItWorks.tsx`): heading reveals; the three step cards stagger in sequence; subtle hover lift on each card.
- **Stats** (`Stats.tsx`, becomes client): the accent band reveals; the three figures **count up** on view; labels stagger.
- **Pricing** (`Pricing.tsx`): heading reveals; Free + Pro cards stagger in with hover lift; the Pro "POPULAR" chip gets a small spring pop after the card settles.
- **Footer** (`Footer.tsx`): gentle fade in on view.

## Testing / Verification

- `pnpm --filter web-app typecheck` and `pnpm --filter web-app build` pass.
- Browser QA: scroll the full page top-to-bottom; confirm each section animates once, reveals fire before fully in view, hero loops run, phones parallax without breaking their scale.
- Toggle OS `prefers-reduced-motion: reduce`; confirm the page renders fully static with all content in final state and no loops.
- Sanity-check both marketing contexts render (Honey page + the Onyx `ThemeShowcase` band).

## Out of Scope

- Authenticated app shell (`src/components/app/*`) and its existing `obfade` animation.
- Any visual redesign of resting-state layout, color, or copy.
- Route-transition / page-load animations beyond per-section entrance.
