import { requireUserId } from "@/lib/auth";
import { plannerRepository } from "@/lib/planner/repository";
import { updateTaskSchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

type Params = {
  params: Promise<{ taskId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { taskId } = await params;
    const input = updateTaskSchema.parse(await request.json());
    const task = await plannerRepository.updateTask(userId, taskId, input);
    return success(task);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { taskId } = await params;
    const result = await plannerRepository.deleteTask(userId, taskId);
    return success(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
