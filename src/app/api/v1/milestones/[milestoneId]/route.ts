import { apiSuccess, handleApiError, requireApiAuth } from "@/app/api/v1/_helpers";
import { updateRemoteMilestone } from "@/lib/remote-agent-planner";
import { updateMilestoneSchema } from "@/lib/planner/validators";

type RouteContext = {
  params: Promise<{
    milestoneId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireApiAuth(request);
    const { milestoneId } = await context.params;
    const input = updateMilestoneSchema.parse(await request.json());
    return apiSuccess({
      milestone: await updateRemoteMilestone(auth, milestoneId, input),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
