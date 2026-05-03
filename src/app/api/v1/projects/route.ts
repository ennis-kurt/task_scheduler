import { apiSuccess, handleApiError, requireApiUserId } from "@/app/api/v1/_helpers";
import {
  createRemoteProject,
  listRemoteProjects,
} from "@/lib/remote-agent-planner";
import { taxonomySchema } from "@/lib/planner/validators";

export async function GET(request: Request) {
  try {
    const userId = await requireApiUserId(request);
    return apiSuccess({ projects: await listRemoteProjects(userId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId(request);
    const input = taxonomySchema.parse(await request.json());
    return apiSuccess({ project: await createRemoteProject(userId, input) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
