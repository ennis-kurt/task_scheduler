"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { ArrowRight, CalendarRange, Clock3, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function LandingShell() {
  return (
    <main className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.14),_transparent_32%),linear-gradient(180deg,_#f6f3ec_0%,_#fdfcf9_42%,_#f4efe5_100%)] text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between py-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--muted-foreground)]">
              Daycraft Planner
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SignInButton mode="modal">
              <Button variant="ghost">Sign in</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button>Start planning</Button>
            </SignUpButton>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-8">
            <Badge tone="accent" className="w-fit">
              Manual planning first. AI scheduling later.
            </Badge>
            <div className="grid gap-5">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-balance text-[var(--foreground-strong)] md:text-7xl">
                Shape your day block by block instead of chasing a flat task list.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
                Daycraft combines an inbox for unscheduled work with a real hourly planner,
                so tasks, meetings, and realistic workload all live in one calm workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <SignUpButton mode="modal">
                <Button size="lg">
                  Launch your planner
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </SignUpButton>
              <SignInButton mode="modal">
                <Button size="lg" variant="outline">
                  Continue planning
                </Button>
              </SignInButton>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Feature
                icon={<CalendarRange className="h-4 w-4" />}
                title="Day + week planning"
                body="Drag tasks into a real planner grid and see load by the hour."
              />
              <Feature
                icon={<Clock3 className="h-4 w-4" />}
                title="Capacity-aware"
                body="Work hours, due dates, and event conflicts stay visible while planning."
              />
              <Feature
                icon={<Sparkles className="h-4 w-4" />}
                title="AI-ready model"
                body="Tasks and blocks stay separate so automation can arrive without a rewrite."
              />
            </div>
          </div>

          <div className="rounded-[32px] border border-white/70 bg-white/85 p-4 shadow-[0_40px_120px_-48px_rgba(28,32,24,0.45)] backdrop-blur">
            <div className="rounded-[28px] border border-[var(--border)] bg-[linear-gradient(180deg,_#f7f4ed_0%,_#fffdf8_100%)] p-5">
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                      Today
                    </p>
                    <p className="text-2xl font-semibold tracking-[-0.04em]">
                      Thursday focus plan
                    </p>
                  </div>
                  <Badge tone="success">Balanced</Badge>
                </div>
                <div className="grid gap-3">
                  {[
                    ["08:00", "Daily planning reset", "Task"],
                    ["09:00", "Product standup", "Meeting"],
                    ["10:00", "Outline the onboarding", "Task"],
                    ["14:00", "Project review", "Meeting"],
                  ].map(([time, title, label]) => (
                    <div
                      key={time + title}
                      className="grid grid-cols-[72px_1fr_auto] items-center gap-3 rounded-2xl border border-[var(--border)] bg-white/80 px-4 py-3"
                    >
                      <div className="font-mono text-sm text-[var(--muted-foreground)]">{time}</div>
                      <div className="text-sm font-medium text-[var(--foreground)]">{title}</div>
                      <Badge tone={label === "Task" ? "accent" : "neutral"}>{label}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

type FeatureProps = {
  icon: ReactNode;
  title: string;
  body: string;
};

function Feature({ icon, title, body }: FeatureProps) {
  return (
    <div className="grid gap-3 rounded-[24px] border border-white/70 bg-white/72 p-5 backdrop-blur">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-stronger)]">
        {icon}
      </div>
      <div className="grid gap-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">{body}</p>
      </div>
    </div>
  );
}
