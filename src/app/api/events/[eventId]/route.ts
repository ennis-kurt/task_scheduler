import { requireUserId } from "@/lib/auth";
import { plannerRepository } from "@/lib/planner/repository";
import { eventSchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

type Params = {
  params: Promise<{ eventId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { eventId } = await params;
    const input = eventSchema.partial().parse(await request.json());
    const event = await plannerRepository.updateEvent(userId, eventId, input);
    return success(event);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { eventId } = await params;
    const result = await plannerRepository.deleteEvent(userId, eventId);
    return success(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
