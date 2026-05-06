import { PlannerApp } from "@/components/planner/planner-app";
import { LandingShell } from "@/components/landing-shell";
import { getSessionContext } from "@/lib/auth";
import { buildDefaultRange } from "@/lib/planner/date";
import { getInitialPlannerPayload } from "@/lib/planner/service";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSessionContext();

  if (session.clerkConfigured && !session.userId) {
    return <LandingShell />;
  }

  const range = buildDefaultRange();
  const payload = await getInitialPlannerPayload(range);

  if (!payload) {
    redirect("/sign-in");
  }

  return <PlannerApp initialData={payload} initialRange={range} />;
}
