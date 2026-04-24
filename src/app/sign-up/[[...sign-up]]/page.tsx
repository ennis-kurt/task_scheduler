import { SignUp } from "@clerk/nextjs";

import { clerkAuthAppearance } from "@/components/auth/clerk-auth-appearance";
import { AuthShell } from "@/components/auth/auth-shell";
import { isClerkConfigured } from "@/lib/env";

export default function SignUpPage() {
  if (!isClerkConfigured()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-6">
        <div className="max-w-md rounded-[32px] border border-[var(--border)] bg-white p-8 text-center shadow-[var(--shadow-soft)]">
          <h1 className="text-2xl font-semibold tracking-[-0.04em]">Clerk is not configured</h1>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">
            Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to enable the
            hosted sign-up experience.
          </p>
        </div>
      </main>
    );
  }

  return (
    <AuthShell
      mode="sign-up"
      title="Create account"
      description="Start with Google or email and land directly in Inflara."
    >
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/"
        oauthFlow="redirect"
        appearance={clerkAuthAppearance}
      />
    </AuthShell>
  );
}
