import { requireUserId } from "@/lib/auth";
import { plannerRepository } from "@/lib/planner/repository";
import { taskBlockSchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = taskBlockSchema.parse(await request.json());
    const block = await plannerRepository.createTaskBlock(userId, input);
    return success(block, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
