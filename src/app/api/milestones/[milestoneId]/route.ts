import { requireUserId } from "@/lib/auth";
import { plannerRepository } from "@/lib/planner/repository";
import { updateMilestoneSchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

type RouteContext = {
  params: Promise<{
    milestoneId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { milestoneId } = await context.params;
    const input = updateMilestoneSchema.parse(await request.json());
    const milestone = await plannerRepository.updateMilestone(userId, milestoneId, input);
    return success(milestone);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { milestoneId } = await context.params;
    const result = await plannerRepository.deleteMilestone(userId, milestoneId);
    return success(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
