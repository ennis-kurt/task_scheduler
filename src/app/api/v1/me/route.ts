import { apiSuccess, handleApiError, requireApiAuth } from "@/app/api/v1/_helpers";
import { plannerRepository } from "@/lib/planner/repository";

export async function GET(request: Request) {
  try {
    const auth = await requireApiAuth(request);
    const workspace = await plannerRepository.getWorkspace(auth.userId);
    return apiSuccess({
      user: workspace.user,
      settings: workspace.settings,
      token: {
        scopeType: auth.scopeType,
        projectIds: auth.projectIds,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
