import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      {/* Sign-ins land on the app; brand-new accounts start at /welcome. */}
      <SignIn
        fallbackRedirectUrl="/app"
        signUpFallbackRedirectUrl="/welcome"
      />
    </div>
  );
}
