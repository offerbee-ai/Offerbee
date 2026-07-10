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

  const className = `sticky top-0 z-50 border-b bg-glass backdrop-blur-[16px] backdrop-saturate-150 transition-[border-color,box-shadow] duration-300 ${
    scrolled ? "border-border shadow-ob-sm" : "border-transparent"
  }`;

  const inner = (
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
  );

  // Reduced motion settles right after mount: render the bar statically, no entrance.
  // (SSR bakes the entrance's initial hidden state; acceptable here since the app
  // requires JS — Clerk/Convex — so a no-JS render is not a supported state.)
  if (reduced) return <div className={className}>{inner}</div>;

  return (
    <motion.div
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {inner}
    </motion.div>
  );
}
