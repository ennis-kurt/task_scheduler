import { requireUserId } from "@/lib/auth";
import { plannerRepository } from "@/lib/planner/repository";
import { updateTaskBlockSchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

type Params = {
  params: Promise<{ blockId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { blockId } = await params;
    const input = updateTaskBlockSchema.parse(await request.json());
    const block = await plannerRepository.updateTaskBlock(userId, blockId, input);
    return success(block);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { blockId } = await params;
    const result = await plannerRepository.deleteTaskBlock(userId, blockId);
    return success(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
