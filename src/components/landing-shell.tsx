"use client";

import {
  ArrowRight,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  GitBranch,
  PanelRight,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { InflaraLogo } from "@/components/brand/inflara-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const featureCards = [
  {
    icon: <CalendarCheck2 className="h-5 w-5" />,
    title: "Calendar-first task planning",
    body: "Tasks, fixed events, focus blocks, and deadlines share one schedule, so the plan exposes conflicts before work starts.",
  },
  {
    icon: <Bot className="h-5 w-5" />,
    title: "AI agents with project context",
    body: "Turn backlog items into agent-ready work with milestones, project memory, status, and QA expectations attached.",
  },
  {
    icon: <Workflow className="h-5 w-5" />,
    title: "Programmatic planning backup",
    body: "When the model is unavailable, deterministic scheduling still respects capacity, fixed events, and task order.",
  },
];

const scheduleRows = [
  { time: "8:30", title: "Plan the day", meta: "AI draft", tone: "accent" },
  { time: "9:15", title: "Train model pipeline", meta: "Agent run", tone: "agent" },
  { time: "11:00", title: "Project review", meta: "Fixed event", tone: "event" },
  { time: "1:30", title: "Score model results", meta: "Depends on train", tone: "task" },
  { time: "3:00", title: "QA release notes", meta: "Focus block", tone: "task" },
];

const agentSteps = [
  "Pick a project milestone",
  "Send scoped work to an agent",
  "Track commits, QA, and handoff notes",
];

export function LandingShell() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f4ec] text-[#18201d]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_8%_8%,rgba(15,118,110,0.18),transparent_30%),radial-gradient(circle_at_92%_12%,rgba(245,158,11,0.16),transparent_26%),linear-gradient(180deg,#fffdf8_0%,#f7f4ec_42%,#efe6d6_100%)]" />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4 rounded-full border border-[#ded4bf]/80 bg-white/62 px-4 py-3 shadow-[0_18px_80px_-52px_rgba(24,32,29,0.45)] backdrop-blur-xl">
          <InflaraLogo compactWordmark />
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#66716b] md:flex">
            <a className="transition hover:text-[#18201d]" href="#planner">
              Planner
            </a>
            <a className="transition hover:text-[#18201d]" href="#agents">
              Agents
            </a>
            <a className="transition hover:text-[#18201d]" href="#workflow">
              Workflow
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className={cn(buttonVariants({ variant: "ghost" }), "rounded-full text-[#3b4741]")}
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants(),
                "rounded-full bg-[#123d36] text-white hover:bg-[#0d2f2a]",
              )}
            >
              Start planning
            </Link>
          </div>
        </header>

        <section className="grid min-h-[calc(100vh-96px)] items-center gap-12 py-16 lg:grid-cols-[0.92fr_1.08fr] lg:py-20">
          <div className="grid gap-8">
            <div className="grid gap-6">
              <h1 className="max-w-5xl text-5xl font-semibold leading-[0.9] tracking-[-0.075em] text-[#111815] text-balance sm:text-6xl lg:text-7xl">
                Plan the day, brief the agents, keep the calendar honest.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[#5b675f] sm:text-xl">
                Inflara turns tasks, meetings, project milestones, and AI agent work into one
                capacity-aware execution plan. No duplicate calendars, no task list guessing, no
                agents working without context.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-up"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-[3.25rem] rounded-full bg-[#123d36] px-6 text-base text-white shadow-[0_22px_58px_-32px_rgba(18,61,54,0.72)] hover:bg-[#0d2f2a]",
                )}
              >
                Build today&apos;s plan
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#planner"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-[3.25rem] rounded-full border-[#cabfa8] bg-white/54 px-6 text-base text-[#24302b] hover:bg-white",
                )}
              >
                See the workspace
              </a>
            </div>

            <div className="grid gap-3 text-sm text-[#5c6861] sm:grid-cols-3">
              <ProofPoint value="Calendar" label="Tasks and events share slots" />
              <ProofPoint value="Agents" label="Work starts with context" />
              <ProofPoint value="Fallback" label="Planner still works offline" />
            </div>
          </div>

          <HeroMockup />
        </section>

        <section id="planner" className="grid gap-6 py-10 md:grid-cols-3">
          {featureCards.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </section>

        <section
          id="agents"
          className="grid gap-10 rounded-[42px] border border-[#dfd3bb] bg-[#111b18] p-6 text-white shadow-[0_34px_120px_-64px_rgba(17,27,24,0.72)] md:p-8 lg:grid-cols-[0.86fr_1.14fr]"
        >
          <div className="flex flex-col justify-between gap-8">
            <div className="grid gap-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d7ff8f] text-[#122019]">
                <GitBranch className="h-5 w-5" />
              </div>
              <h2 className="max-w-xl text-4xl font-semibold leading-[0.95] tracking-[-0.06em] md:text-5xl">
                Agent work belongs inside the plan, not in a separate chat.
              </h2>
              <p className="max-w-lg text-base leading-7 text-white/68">
                Inflara keeps agent runs tied to projects, milestones, tasks, and review status so
                shipped work can be traced back to the plan that requested it.
              </p>
            </div>
            <div className="grid gap-3">
              {agentSteps.map((step, index) => (
                <div
                  key={step}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-sm text-white/82"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-[#111b18]">
                    {index + 1}
                  </span>
                  {step}
                </div>
              ))}
            </div>
          </div>

          <AgentConsoleMockup />
        </section>

        <section id="workflow" className="grid gap-8 py-16 lg:grid-cols-[1fr_0.92fr]">
          <div className="grid gap-5">
            <h2 className="max-w-3xl text-4xl font-semibold leading-[0.98] tracking-[-0.06em] text-[#111815] md:text-6xl">
              Designed for people who run projects from a calendar.
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-[#657068]">
              Build a realistic day, leave fixed meetings untouched, sequence dependent work, and
              send bounded tasks to agents without losing the source of truth.
            </p>
          </div>

          <div className="grid gap-3">
            <WorkflowRow
              icon={<Clock3 className="h-4 w-4" />}
              title="Respects time that is already booked"
              body="Meetings and preserved scheduled tasks reserve their time slots while the planner fills the rest."
            />
            <WorkflowRow
              icon={<Target className="h-4 w-4" />}
              title="Prioritizes real execution order"
              body="Dependencies, due dates, priorities, and capacity shape what gets scheduled first."
            />
            <WorkflowRow
              icon={<PanelRight className="h-4 w-4" />}
              title="Keeps project context visible"
              body="Notes, milestones, task status, and project filters stay close to the calendar."
            />
          </div>
        </section>

        <section className="mb-10 rounded-[38px] border border-[#dfd3bb] bg-white/72 p-6 shadow-[0_30px_100px_-70px_rgba(24,32,29,0.7)] backdrop-blur md:p-10">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="grid gap-3">
              <h2 className="text-3xl font-semibold tracking-[-0.05em] text-[#111815]">
                Start with one day. Scale to every project.
              </h2>
              <p className="max-w-2xl text-base leading-7 text-[#657068]">
                Create a workspace, plan today around what is already booked, then hand off the next
                concrete task to an agent with the right context.
              </p>
            </div>
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "rounded-full bg-[#123d36] px-6 text-white hover:bg-[#0d2f2a]",
              )}
            >
              Start planning
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

type ProofPointProps = {
  value: string;
  label: string;
};

function ProofPoint({ value, label }: ProofPointProps) {
  return (
    <div className="rounded-3xl border border-[#dfd3bb] bg-white/58 p-4 backdrop-blur">
      <p className="text-sm font-semibold text-[#14241f]">{value}</p>
      <p className="mt-1 leading-6">{label}</p>
    </div>
  );
}

type FeatureCardProps = {
  icon: ReactNode;
  title: string;
  body: string;
};

function FeatureCard({ icon, title, body }: FeatureCardProps) {
  return (
    <article className="group grid gap-8 rounded-[34px] border border-[#dfd3bb] bg-white/66 p-6 shadow-[0_26px_90px_-66px_rgba(24,32,29,0.55)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:bg-white/82">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f5d2] text-[#0f766e] transition group-hover:bg-[#d7ff8f] group-hover:text-[#123d36]">
        {icon}
      </div>
      <div className="grid gap-3">
        <h3 className="text-xl font-semibold tracking-[-0.035em] text-[#111815]">{title}</h3>
        <p className="text-sm leading-7 text-[#657068]">{body}</p>
      </div>
    </article>
  );
}

function HeroMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[56px] bg-[radial-gradient(circle_at_50%_0%,rgba(15,118,110,0.22),transparent_48%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-[38px] border border-[#d8cbb4] bg-[#fdfbf5]/92 p-3 shadow-[0_40px_130px_-58px_rgba(24,32,29,0.65)] backdrop-blur">
        <div className="rounded-[30px] border border-[#e5dac6] bg-[#fbf8ef]">
          <div className="grid grid-cols-[72px_1fr] border-b border-[#e5dac6]">
            <aside className="grid gap-3 border-r border-[#e5dac6] p-3">
              {["IN", "AI", "QA", "DO"].map((label, index) => (
                <div
                  key={label}
                  className={[
                    "flex h-11 items-center justify-center rounded-2xl text-xs font-semibold",
                    index === 0 ? "bg-[#123d36] text-white" : "bg-white text-[#7b857e]",
                  ].join(" ")}
                >
                  {label}
                </div>
              ))}
            </aside>
            <div className="grid gap-4 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#879087]">Wednesday</p>
                  <p className="text-2xl font-semibold tracking-[-0.045em] text-[#14241f]">
                    Launch plan
                  </p>
                </div>
                <div className="rounded-full border border-[#d9cdb9] bg-white px-3 py-1 text-xs font-medium text-[#53615a]">
                  6h 15m planned
                </div>
              </div>

              <div className="grid gap-3 rounded-[24px] border border-[#e1d6c2] bg-white/76 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#14241f]">
                    <Sparkles className="h-4 w-4 text-[#0f766e]" />
                    AI Daily Planner
                  </div>
                  <span className="rounded-full bg-[#e8f5d2] px-3 py-1 text-xs font-semibold text-[#123d36]">
                    No overlaps
                  </span>
                </div>
                <div className="grid gap-2">
                  {scheduleRows.map((row) => (
                    <ScheduleRow key={row.time + row.title} {...row} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-[1fr_0.72fr]">
            <div className="rounded-[24px] border border-[#e1d6c2] bg-white p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-[#14241f]">Task flow</p>
                <span className="text-xs text-[#879087]">Planner MVP</span>
              </div>
              <div className="grid gap-2">
                {["Train model", "Score model", "Write QA notes"].map((task, index) => (
                  <div
                    key={task}
                    className="flex items-center justify-between rounded-2xl border border-[#efe5d3] bg-[#fbf8ef] px-3 py-2"
                  >
                    <span className="text-sm font-medium text-[#26332d]">{task}</span>
                    <span className="text-xs text-[#879087]">{index === 0 ? "Now" : "Next"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[24px] border border-[#cdddc8] bg-[#eef8e2] p-4">
              <p className="text-sm font-semibold text-[#14241f]">Agent ready</p>
              <p className="mt-2 text-sm leading-6 text-[#53615a]">
                Score model depends on train model. Schedule order locked before handoff.
              </p>
              <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
                <CheckCircle2 className="h-4 w-4" />
                Ready to run
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type ScheduleRowProps = {
  time: string;
  title: string;
  meta: string;
  tone: string;
};

function ScheduleRow({ time, title, meta, tone }: ScheduleRowProps) {
  const toneClass =
    tone === "agent"
      ? "border-l-[#0f766e]"
      : tone === "event"
        ? "border-l-[#f59e0b]"
        : tone === "accent"
          ? "border-l-[#123d36]"
          : "border-l-[#96a36c]";

  return (
    <div
      className={`grid grid-cols-[52px_1fr_auto] items-center gap-3 rounded-2xl border border-[#efe5d3] border-l-4 ${toneClass} bg-[#fffdfa] px-3 py-2`}
    >
      <span className="font-mono text-xs text-[#879087]">{time}</span>
      <span className="min-w-0 truncate text-sm font-semibold text-[#26332d]">{title}</span>
      <span className="hidden rounded-full bg-[#f2eadb] px-2.5 py-1 text-xs font-medium text-[#67716a] sm:inline-flex">
        {meta}
      </span>
    </div>
  );
}

function AgentConsoleMockup() {
  return (
    <div className="overflow-hidden rounded-[30px] border border-white/12 bg-[#0b1210] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff7a7a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffd166]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#8ee08f]" />
        </div>
        <span className="font-mono text-xs text-white/42">agent-runner</span>
      </div>
      <div className="grid gap-4 p-5">
        <ConsoleLine prompt="inflara" text="claim task score-model-results" />
        <ConsoleLine prompt="context" text="project=Planner MVP milestone=AI Scheduling" />
        <ConsoleLine prompt="depends" text="train-model-pipeline completed 09:58" />
        <div className="rounded-2xl border border-[#d7ff8f]/18 bg-[#d7ff8f]/9 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#d7ff8f]">Handoff memory</p>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/68">
              synced
            </span>
          </div>
          <p className="text-sm leading-6 text-white/66">
            Agent receives acceptance criteria, related project notes, task dependencies, and the
            next open calendar block.
          </p>
        </div>
        <ConsoleLine prompt="commit" text="write qa notes after tests pass" />
      </div>
    </div>
  );
}

type ConsoleLineProps = {
  prompt: string;
  text: string;
};

function ConsoleLine({ prompt, text }: ConsoleLineProps) {
  return (
    <div className="grid grid-cols-[74px_1fr] gap-3 font-mono text-xs">
      <span className="text-[#d7ff8f]">{prompt}</span>
      <span className="min-w-0 truncate text-white/68">{text}</span>
    </div>
  );
}

type WorkflowRowProps = {
  icon: ReactNode;
  title: string;
  body: string;
};

function WorkflowRow({ icon, title, body }: WorkflowRowProps) {
  return (
    <article className="flex gap-4 rounded-[28px] border border-[#dfd3bb] bg-white/62 p-5 backdrop-blur">
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-[#e8f5d2] text-[#0f766e]">
        {icon}
      </div>
      <div className="grid gap-1">
        <h3 className="font-semibold tracking-[-0.02em] text-[#111815]">{title}</h3>
        <p className="text-sm leading-6 text-[#657068]">{body}</p>
      </div>
    </article>
  );
}
