"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Reduced-motion preference, SSR-safe. `useReducedMotion` returns null on the
 * server and reads matchMedia during the client's hydration render, which would
 * diverge from the server HTML for reduced-motion users. Gating on a mount flag
 * forces the first client render to match the server (false), then flips to the
 * real preference after mount — no hydration mismatch.
 */
export function useReduced(): boolean {
  const prefersReduced = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? prefersReduced : false;
}
