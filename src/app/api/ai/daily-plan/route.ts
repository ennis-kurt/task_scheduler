import { z } from "zod";

import { handleRouteError, success } from "@/app/api/_helpers";
import { requireUserId } from "@/lib/auth";
import {
  generateDeterministicDailyPlan,
  type DailyPlanRequest,
} from "@/lib/planner/ai-daily-plan";

const dailyPlanRequestSchema = z.object({
  planningMode: z.enum(["deep_focus", "standard", "chill", "custom"]),
  scheduledTaskHandling: z.enum(["preserve_future", "rearrange_future"]).optional(),
  date: z.string().min(1),
  timezone: z.string().min(1),
  currentTime: z.string().optional(),
  tasks: z.array(z.any()),
  projects: z.array(z.any()),
  milestones: z.array(z.any()),
  projectPlans: z.array(z.any()),
  scheduledItems: z.array(z.any()),
  capacity: z.array(z.any()),
  settings: z.any(),
  customInstructions: z
    .object({
      intensity: z.string().optional(),
      priorityFocus: z.string().optional(),
      avoidTasks: z.string().optional(),
      sessionLength: z.string().optional(),
    })
    .optional(),
  dependencies: z.array(z.any()).default([]),
});

export async function POST(request: Request) {
  try {
    await requireUserId();
    const input = dailyPlanRequestSchema.parse(await request.json()) as DailyPlanRequest;
    return success(generateDeterministicDailyPlan(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
