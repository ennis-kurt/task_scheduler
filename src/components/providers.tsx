"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import type { ReactNode } from "react";

import { ThemeProvider } from "next-themes";

type ProvidersProps = {
  children: ReactNode;
  clerkEnabled: boolean;
};

export function Providers({ children, clerkEnabled }: ProvidersProps) {
  const content = (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster position="top-right" richColors />
    </ThemeProvider>
  );

  if (clerkEnabled) {
    return (
      <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
        {content}
      </ClerkProvider>
    );
  }

  return content;
}
