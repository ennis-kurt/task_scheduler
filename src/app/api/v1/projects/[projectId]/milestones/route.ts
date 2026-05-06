import { apiSuccess, handleApiError, requireApiAuth } from "@/app/api/v1/_helpers";
import {
  createRemoteMilestone,
  listRemoteMilestones,
} from "@/lib/remote-agent-planner";
import { milestoneSchema } from "@/lib/planner/validators";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireApiAuth(request);
    const { projectId } = await context.params;
    return apiSuccess({ milestones: await listRemoteMilestones(auth, projectId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireApiAuth(request);
    const { projectId } = await context.params;
    const input = milestoneSchema.parse({
      ...(await request.json()),
      projectId,
    });
    return apiSuccess(
      { milestone: await createRemoteMilestone(auth, input) },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
