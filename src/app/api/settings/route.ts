import { requireUserId } from "@/lib/auth";
import { plannerRepository } from "@/lib/planner/repository";
import { settingsSchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const input = settingsSchema.parse(await request.json());
    const settings = await plannerRepository.updateSettings(userId, input);
    return success(settings);
  } catch (error) {
    return handleRouteError(error);
  }
}
