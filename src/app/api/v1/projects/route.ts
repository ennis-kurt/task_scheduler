import { apiSuccess, handleApiError, requireApiAuth } from "@/app/api/v1/_helpers";
import {
  createRemoteProject,
  listRemoteProjects,
} from "@/lib/remote-agent-planner";
import { taxonomySchema } from "@/lib/planner/validators";

export async function GET(request: Request) {
  try {
    const auth = await requireApiAuth(request);
    return apiSuccess({ projects: await listRemoteProjects(auth) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiAuth(request);
    const input = taxonomySchema.parse(await request.json());
    return apiSuccess({ project: await createRemoteProject(auth, input) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
