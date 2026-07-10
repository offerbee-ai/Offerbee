import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      {/* Land straight on the wallet, not the /app redirect index. */}
      <SignIn
        fallbackRedirectUrl="/app"
        signUpFallbackRedirectUrl="/app"
      />
    </div>
  );
}
