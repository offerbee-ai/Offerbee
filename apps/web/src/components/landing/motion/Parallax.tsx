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
