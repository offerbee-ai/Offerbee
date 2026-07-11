import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The onboarding wizard imports plain .ts modules from the backend package
  // (convex/onboardingCatalog.ts), which Next only compiles when the package
  // is listed here.
  transpilePackages: ["@packages/backend"],
};

export default nextConfig;
