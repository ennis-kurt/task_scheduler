import { requireUserId } from "@/lib/auth";
import { plannerRepository } from "@/lib/planner/repository";
import { eventSchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = eventSchema.parse(await request.json());
    const event = await plannerRepository.createEvent(userId, input);
    return success(event, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
