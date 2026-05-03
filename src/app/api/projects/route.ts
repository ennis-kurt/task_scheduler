import { requireUserId } from "@/lib/auth";
import { notePagesRepository } from "@/lib/planner/note-pages";
import { plannerRepository } from "@/lib/planner/repository";
import { taxonomySchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = taxonomySchema.parse(await request.json());
    const project = await plannerRepository.createProject(userId, input);
    await notePagesRepository.syncProjectDescription(userId, project.id, input.notes);
    return success(project, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
