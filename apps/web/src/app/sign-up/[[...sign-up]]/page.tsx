import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      {/* Land straight on the wallet, not the /app redirect index. */}
      <SignUp
        fallbackRedirectUrl="/app/cards"
        signInFallbackRedirectUrl="/app/cards"
      />
    </div>
  );
}
