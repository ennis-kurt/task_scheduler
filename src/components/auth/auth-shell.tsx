"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  alternateHref: string;
  alternateLabel: string;
  alternateText: string;
  children: ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  alternateHref,
  alternateLabel,
  alternateText,
  children,
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--foreground)]">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-10 px-6 py-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
        <section className="flex flex-col justify-between rounded-[36px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.58))] p-8 shadow-[var(--shadow-soft)] dark:bg-[linear-gradient(180deg,rgba(17,24,39,0.92),rgba(15,23,42,0.84))]">
          <div className="grid gap-8">
            <div className="grid gap-4">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--muted-foreground)]">
                Daycraft Planner
              </p>
              <Badge tone="accent" className="w-fit">
                Secure workspace access
              </Badge>
            </div>

            <div className="grid gap-5">
              <div className="grid gap-3">
                <p className="font-mono text-xs uppercase tracking-[0.26em] text-[var(--muted-foreground)]">
                  {eyebrow}
                </p>
                <h1 className="max-w-xl text-4xl font-semibold tracking-[-0.05em] text-[var(--foreground-strong)] md:text-6xl">
                  {title}
                </h1>
              </div>
              <p className="max-w-xl text-base leading-7 text-[var(--muted-foreground)] md:text-lg">
                {description}
              </p>
            </div>

            <div className="grid gap-3 text-sm text-[var(--muted-foreground)]">
              <p>Supported login methods will appear automatically once enabled in Clerk.</p>
              <p>Google, Microsoft, Apple, and email all flow through the same secure auth layer.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-8">
            <Link href={alternateHref} className={buttonVariants({ variant: "outline" })}>
              {alternateLabel}
            </Link>
            <p className="text-sm text-[var(--muted-foreground)]">{alternateText}</p>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-[520px] rounded-[36px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[var(--shadow-soft)]">
            <div className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-4 md:p-6">
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
