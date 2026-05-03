import { apiSuccess, handleApiError, requireApiUserId } from "@/app/api/v1/_helpers";
import { updateRemoteMilestone } from "@/lib/remote-agent-planner";
import { updateMilestoneSchema } from "@/lib/planner/validators";

type RouteContext = {
  params: Promise<{
    milestoneId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId(request);
    const { milestoneId } = await context.params;
    const input = updateMilestoneSchema.parse(await request.json());
    return apiSuccess({
      milestone: await updateRemoteMilestone(userId, milestoneId, input),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
