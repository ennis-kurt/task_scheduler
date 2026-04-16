"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import type { ReactNode } from "react";

type ProvidersProps = {
  children: ReactNode;
  clerkEnabled: boolean;
};

export function Providers({ children, clerkEnabled }: ProvidersProps) {
  if (clerkEnabled) {
    return (
      <ClerkProvider>
        {children}
        <Toaster position="top-right" richColors />
      </ClerkProvider>
    );
  }

  return (
    <>
      {children}
      <Toaster position="top-right" richColors />
    </>
  );
}
