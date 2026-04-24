import { PlannerApp } from "@/components/planner/planner-app";
import { getSessionContext } from "@/lib/auth";
import { buildDefaultRange } from "@/lib/planner/date";
import { getInitialPlannerPayload } from "@/lib/planner/service";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSessionContext();

  if (!session.clerkConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-6">
        <div className="max-w-xl rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-8 shadow-[var(--shadow-soft)]">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--muted-foreground)]">
            Authentication setup required
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-[var(--foreground-strong)]">
            Inflara is ready for real accounts, but Clerk is not connected yet.
          </h1>
          <p className="mt-4 text-sm leading-7 text-[var(--muted-foreground)]">
            Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and
            `DATABASE_URL` to switch this deployment out of demo mode.
          </p>
        </div>
      </main>
    );
  }

  if (!session.userId) {
    redirect("/sign-in");
  }

  const range = buildDefaultRange();
  const payload = await getInitialPlannerPayload(range);

  if (!payload) {
    redirect("/sign-in");
  }

  return <PlannerApp initialData={payload} initialRange={range} />;
}
