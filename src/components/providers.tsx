"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import { useEffect, type ReactNode } from "react";

import { ThemeProvider, useTheme } from "next-themes";

type ProvidersProps = {
  children: ReactNode;
  clerkEnabled: boolean;
};

function ThemeMaintenance() {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    document.documentElement.classList.remove("pulse");

    if (theme === "pulse") {
      setTheme("aura");
    }
  }, [setTheme, theme]);

  return null;
}

export function Providers({ children, clerkEnabled }: ProvidersProps) {
  const content = (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      themes={["light", "dark", "aura", "neon", "elegant"]}
    >
      <ThemeMaintenance />
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
