"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { InflaraLogo } from "@/components/brand/inflara-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  mode: "sign-in" | "sign-up";
  title: string;
  description: string;
  children: ReactNode;
};

const AUTH_NAV = [
  { href: "/sign-in", label: "Sign in", mode: "sign-in" as const },
  { href: "/sign-up", label: "Create account", mode: "sign-up" as const },
];

export function AuthShell({ mode, title, description, children }: AuthShellProps) {
  const pathname = usePathname();

  return (
    <main
      data-auth-shell
      className="relative min-h-screen overflow-hidden bg-[var(--surface)] text-[var(--foreground)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,106,97,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(79,100,255,0.16),transparent_34%)]" />
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-10 px-6 py-8 lg:grid-cols-[0.85fr_1.15fr] lg:px-10">
        <section className="relative flex flex-col justify-between rounded-[36px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(255,255,255,0.68))] p-8 shadow-[var(--shadow-soft)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(9,11,15,0.92))]">
          <div className="grid gap-14">
            <InflaraLogo />

            <div className="grid gap-5">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--muted-foreground)]">
                {mode === "sign-in" ? "Secure sign in" : "Create your workspace"}
              </p>
              <h1 className="max-w-lg text-5xl font-semibold tracking-[-0.07em] text-[var(--foreground-strong)] md:text-7xl">
                {title}
              </h1>
              <p className="max-w-md text-sm leading-7 text-[var(--muted-foreground)] md:text-base">
                {description}
              </p>
            </div>
          </div>

          <div className="pt-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
              Planner. Calendar. Projects.
            </p>
          </div>
        </section>

        <section className="relative flex items-center justify-center">
          <div className="w-full max-w-[560px] rounded-[40px] border border-[var(--border)] bg-[rgba(255,255,255,0.76)] p-5 shadow-[var(--shadow-float)] backdrop-blur-sm dark:bg-[rgba(11,15,24,0.82)]">
            <div className="mb-5 flex rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] p-1">
              {AUTH_NAV.map((item) => {
                const active = pathname.startsWith(item.href) || mode === item.mode;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "h-10 flex-1 rounded-full text-sm shadow-none",
                      active
                        ? "bg-[var(--foreground-strong)] text-white hover:bg-[var(--foreground-strong)] hover:text-white"
                        : "text-[var(--muted-foreground)] hover:bg-[var(--button-ghost-hover)] hover:text-[var(--foreground-strong)]",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="rounded-[30px] border border-[var(--border)] bg-[var(--card)] p-5 md:p-7">
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
