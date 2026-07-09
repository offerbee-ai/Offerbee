"use client";

import Link from "next/link";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

export function NavAuthButtons() {
  const { isSignedIn } = useUser();

  if (isSignedIn) {
    return (
      <>
        <Link
          href="/app"
          className="text-[15px] font-semibold text-ink transition-colors hover:text-accent"
        >
          Open app
        </Link>
        <UserButton />
      </>
    );
  }

  return (
    <>
      <SignInButton mode="modal">
        <button
          type="button"
          className="text-[15px] font-semibold text-ink transition-colors hover:text-accent"
        >
          Sign in
        </button>
      </SignInButton>
      <Link
        href="/sign-up"
        className="rounded-button bg-accent px-[18px] py-[9px] text-[15px] font-semibold text-white transition-colors hover:bg-accent-strong"
      >
        Get OfferBee
      </Link>
    </>
  );
}

export function HeroAuthButton() {
  const { isSignedIn } = useUser();
  return (
    <Link
      href={isSignedIn ? "/app" : "/sign-up"}
      className="rounded-[13px] bg-accent px-[26px] py-[14px] text-[16px] font-semibold text-white shadow-[0_8px_20px_rgba(232,104,14,.24)] transition-colors hover:bg-accent-strong"
    >
      {isSignedIn ? "Open app" : "Get started"}
    </Link>
  );
}
