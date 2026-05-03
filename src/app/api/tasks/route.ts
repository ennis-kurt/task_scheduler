import { requireUserId } from "@/lib/auth";
import { notePagesRepository } from "@/lib/planner/note-pages";
import { plannerRepository } from "@/lib/planner/repository";
import { taskSchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = taskSchema.parse(await request.json());
    const task = await plannerRepository.createTask(userId, input);
    const workspace = await plannerRepository.getWorkspace(userId);
    const milestone = task.milestoneId
      ? workspace.milestones.find((candidate) => candidate.id === task.milestoneId) ?? null
      : null;

    if (input.addToProjectNotes) {
      await notePagesRepository.syncTaskNote(userId, task, milestone, {
        createIfMissing: true,
      });
    }
    return success(task, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
