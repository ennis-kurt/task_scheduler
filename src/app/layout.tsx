import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";
import { isClerkConfigured } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Daycraft Planner",
  description:
    "A visual task planner that combines unscheduled work, hour-by-hour scheduling, and calendar-based planning in one workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--surface)] text-[var(--foreground)]">
        <Providers clerkEnabled={isClerkConfigured()}>{children}</Providers>
      </body>
    </html>
  );
}
