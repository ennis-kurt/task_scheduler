import { requireUserId } from "@/lib/auth";
import { plannerRepository } from "@/lib/planner/repository";
import { taxonomySchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = taxonomySchema.parse(await request.json());
    const area = await plannerRepository.createArea(userId, input);
    return success(area, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
