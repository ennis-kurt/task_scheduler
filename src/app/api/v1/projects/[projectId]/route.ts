import { apiSuccess, handleApiError, requireApiUserId } from "@/app/api/v1/_helpers";
import {
  getRemoteProject,
  updateRemoteProject,
} from "@/lib/remote-agent-planner";
import { updateProjectSchema } from "@/lib/planner/validators";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId(request);
    const { projectId } = await context.params;
    return apiSuccess(await getRemoteProject(userId, projectId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId(request);
    const { projectId } = await context.params;
    const input = updateProjectSchema.parse(await request.json());
    return apiSuccess({ project: await updateRemoteProject(userId, projectId, input) });
  } catch (error) {
    return handleApiError(error);
  }
}
