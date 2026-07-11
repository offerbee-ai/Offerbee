"use client";

import { SignUp } from "@clerk/nextjs";

/**
 * Step 1 — the existing Clerk sign-up, unchanged, rendered inside the wizard
 * chrome. Clerk owns the CTA here (the wizard footer is hidden on this step).
 *
 * `routing="hash"` is required: /welcome is not a catch-all route, and Clerk's
 * default path routing throws in dev without one. `forceRedirectUrl` makes
 * OAuth / email-verification round-trips land back on the wizard, beating any
 * stray ?redirect_url= param.
 */
export function StepAccount() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center py-6">
      <div className="w-full max-w-[400px]">
        <SignUp
          routing="hash"
          forceRedirectUrl="/welcome"
          signInUrl="/sign-in"
          appearance={{
            variables: {
              colorPrimary: "#E8680E",
              colorText: "#211D16",
              borderRadius: "8px",
            },
            elements: {
              cardBox: "rounded-[16px] shadow-[0_12px_44px_rgba(33,29,22,.09)]",
              card: "rounded-[16px] border border-[#EAE3D4]",
              headerTitle: "text-[19px] font-bold",
              headerSubtitle: "text-[13.5px] text-[#8A8272]",
              formButtonPrimary:
                "rounded-[9px] bg-[#E8680E] hover:bg-[#C4560B] shadow-none",
              formFieldInput: "rounded-[8px] border-[#E3DCCB] bg-[#FFFEFB]",
              formFieldLabel: "text-[13px] font-semibold",
              socialButtonsBlockButton:
                "rounded-[9px] border-[#E3DCCB] bg-[#FFFEFB]",
            },
          }}
        />
        <p className="mt-[14px] text-center font-mono text-[11px] leading-[1.5] text-[#B4A88E]">
          Step 1 of 5 — OfferBee setup begins right after.
        </p>
      </div>
    </div>
  );
}
