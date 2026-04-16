import { requireUserId } from "@/lib/auth";
import { plannerRepository } from "@/lib/planner/repository";
import { taskSchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = taskSchema.parse(await request.json());
    const task = await plannerRepository.createTask(userId, input);
    return success(task, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
