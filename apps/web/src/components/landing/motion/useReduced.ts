"use client";

import { useReducedMotion } from "motion/react";

/** `useReducedMotion` can return null during SSR/first paint; coerce to a boolean. */
export function useReduced(): boolean {
  return useReducedMotion() ?? false;
}
