import { apiSuccess, handleApiError, requireApiUserId } from "@/app/api/v1/_helpers";
import { updateRemoteTask } from "@/lib/remote-agent-planner";
import { updateTaskSchema } from "@/lib/planner/validators";

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId(request);
    const { taskId } = await context.params;
    const input = updateTaskSchema.parse(await request.json());
    return apiSuccess({ task: await updateRemoteTask(userId, taskId, input) });
  } catch (error) {
    return handleApiError(error);
  }
}
