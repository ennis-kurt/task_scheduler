import { apiSuccess, handleApiError, requireApiUserId } from "@/app/api/v1/_helpers";
import { plannerRepository } from "@/lib/planner/repository";

export async function GET(request: Request) {
  try {
    const userId = await requireApiUserId(request);
    const workspace = await plannerRepository.getWorkspace(userId);
    return apiSuccess({ user: workspace.user, settings: workspace.settings });
  } catch (error) {
    return handleApiError(error);
  }
}
