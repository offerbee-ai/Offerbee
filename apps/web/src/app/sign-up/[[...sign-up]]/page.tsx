import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      {/* New accounts go through first-run onboarding at /welcome. */}
      <SignUp
        fallbackRedirectUrl="/welcome"
        signInFallbackRedirectUrl="/app"
      />
    </div>
  );
}
