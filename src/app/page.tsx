import { LandingShell } from "@/components/landing-shell";
import { PlannerApp } from "@/components/planner/planner-app";
import { getSessionContext } from "@/lib/auth";
import { buildDefaultRange } from "@/lib/planner/date";
import { getInitialPlannerPayload } from "@/lib/planner/service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSessionContext();

  if (session.clerkConfigured && !session.userId) {
    return <LandingShell />;
  }

  const range = buildDefaultRange();
  const payload = await getInitialPlannerPayload(range);

  if (!payload) {
    return <LandingShell />;
  }

  return <PlannerApp initialData={payload} initialRange={range} />;
}
