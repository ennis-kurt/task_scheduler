import { requireUserId } from "@/lib/auth";
import { plannerRepository } from "@/lib/planner/repository";
import { updateProjectSchema } from "@/lib/planner/validators";
import { handleRouteError, success } from "@/app/api/_helpers";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { projectId } = await context.params;
    const input = updateProjectSchema.parse(await request.json());
    const project = await plannerRepository.updateProject(userId, projectId, input);
    return success(project);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { projectId } = await context.params;
    const result = await plannerRepository.deleteProject(userId, projectId);
    return success(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
