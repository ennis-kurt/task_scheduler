import { requireUserId } from "@/lib/auth";
import { plannerRepository } from "@/lib/planner/repository";
import { milestoneSchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = milestoneSchema.parse(await request.json());
    const milestone = await plannerRepository.createMilestone(userId, input);
    return success(milestone, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
