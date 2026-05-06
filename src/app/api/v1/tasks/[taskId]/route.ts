import { apiSuccess, handleApiError, requireApiAuth } from "@/app/api/v1/_helpers";
import { updateRemoteTask } from "@/lib/remote-agent-planner";
import { updateTaskSchema } from "@/lib/planner/validators";

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireApiAuth(request);
    const { taskId } = await context.params;
    const input = updateTaskSchema.parse(await request.json());
    return apiSuccess({ task: await updateRemoteTask(auth, taskId, input) });
  } catch (error) {
    return handleApiError(error);
  }
}
