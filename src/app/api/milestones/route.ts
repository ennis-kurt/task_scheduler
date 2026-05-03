import { requireUserId } from "@/lib/auth";
import { notePagesRepository } from "@/lib/planner/note-pages";
import { plannerRepository } from "@/lib/planner/repository";
import { milestoneSchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = milestoneSchema.parse(await request.json());
    const milestone = await plannerRepository.createMilestone(userId, input);
    await notePagesRepository.syncMilestoneNotes(userId, milestone);
    return success(milestone, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
