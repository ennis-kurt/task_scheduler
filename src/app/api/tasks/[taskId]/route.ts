import { requireUserId } from "@/lib/auth";
import { notePagesRepository } from "@/lib/planner/note-pages";
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
    const previousWorkspace = await plannerRepository.getWorkspace(userId);
    const previousTask = previousWorkspace.tasks.find((candidate) => candidate.id === taskId);
    const task = await plannerRepository.updateTask(userId, taskId, input);
    const workspace = await plannerRepository.getWorkspace(userId);
    const milestone = task.milestoneId
      ? workspace.milestones.find((candidate) => candidate.id === task.milestoneId) ?? null
      : null;

    if (previousTask?.projectId && previousTask.projectId !== task.projectId) {
      await notePagesRepository.deleteTaskNote(userId, previousTask);
    }

    await notePagesRepository.syncTaskNote(userId, task, milestone);
    return success(task);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { taskId } = await params;
    const workspaceBeforeDelete = await plannerRepository.getWorkspace(userId);
    const task = workspaceBeforeDelete.tasks.find((candidate) => candidate.id === taskId);
    const result = await plannerRepository.deleteTask(userId, taskId);

    if (task) {
      await notePagesRepository.deleteTaskNote(userId, task);
    }

    return success(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
