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
