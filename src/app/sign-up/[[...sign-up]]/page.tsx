import { SignUp } from "@clerk/nextjs";

import { clerkAuthAppearance } from "@/components/auth/clerk-auth-appearance";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
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
      <div className="grid gap-5">
        <GoogleAuthButton mode="sign-up" />
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
            Or use email
          </span>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>
        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/"
          oauthFlow="redirect"
          appearance={clerkAuthAppearance}
        />
      </div>
    </AuthShell>
  );
}
