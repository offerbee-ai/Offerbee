import { defineConfig } from "vitest/config";

// Pure-logic tests only (no Convex runtime). DB-touching functions are verified
// manually against a dev deployment — see the plan's rollout steps.
export default defineConfig({
  test: {
    environment: "node",
    include: ["convex/**/*.test.ts"],
  },
});
