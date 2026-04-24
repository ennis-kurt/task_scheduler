"use client";

import { useSignIn, useSignUp } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type GoogleAuthButtonProps = {
  mode: "sign-in" | "sign-up";
};

const OAUTH_REDIRECT_URL = "/sso-callback";
const OAUTH_COMPLETE_URL = "/";

export function GoogleAuthButton({ mode }: GoogleAuthButtonProps) {
  const { fetchStatus: signInFetchStatus, signIn } = useSignIn();
  const { fetchStatus: signUpFetchStatus, signUp } = useSignUp();
  const [pending, setPending] = useState(false);

  const loaded =
    mode === "sign-in"
      ? signInFetchStatus === "idle" && Boolean(signIn)
      : signUpFetchStatus === "idle" && Boolean(signUp);

  async function handleGoogleAuth() {
    if (!loaded || pending) {
      return;
    }

    setPending(true);

    try {
      if (mode === "sign-in") {
        await signIn?.sso({
          strategy: "oauth_google",
          redirectUrl: OAUTH_COMPLETE_URL,
          redirectCallbackUrl: OAUTH_REDIRECT_URL,
        });
        return;
      }

      await signUp?.sso({
        strategy: "oauth_google",
        redirectUrl: OAUTH_COMPLETE_URL,
        redirectCallbackUrl: OAUTH_REDIRECT_URL,
      });
    } catch (error) {
      setPending(false);
      toast.error(error instanceof Error ? error.message : "Google sign-in is unavailable.");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleGoogleAuth}
      disabled={!loaded || pending}
      className="h-12 w-full justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--button-outline-bg)] text-[15px] text-[var(--foreground-strong)] shadow-none transition hover:bg-[var(--button-outline-hover)]"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
      Continue with Google
    </Button>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0">
      <path
        d="M21.8 12.22c0-.74-.07-1.45-.19-2.13H12v4.03h5.49a4.7 4.7 0 0 1-2.03 3.08v2.56h3.29c1.92-1.77 3.05-4.39 3.05-7.54Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.75 0 5.06-.91 6.74-2.46l-3.29-2.56c-.91.61-2.08.97-3.45.97-2.65 0-4.9-1.79-5.7-4.19H2.89v2.64A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.3 13.76a5.98 5.98 0 0 1 0-3.52V7.6H2.89a10 10 0 0 0 0 8.8l3.41-2.64Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.05c1.5 0 2.84.52 3.9 1.53l2.92-2.92C17.05 2.99 14.74 2 12 2A10 10 0 0 0 2.89 7.6l3.41 2.64c.8-2.4 3.05-4.19 5.7-4.19Z"
        fill="#EA4335"
      />
    </svg>
  );
}
