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
    // reduced settles right after mount: show the final value, no count-up.
    if (reduced) {
      setDisplay(target);
      return;
    }
    if (!inView) return;
    const controls = animate(0, target, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [reduced, inView, target]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
