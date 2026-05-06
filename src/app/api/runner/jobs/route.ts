import { authenticateRunnerRequest, listRunnerJobs } from "@/lib/agent-runs";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRunnerRequest(request);
    return success({ jobs: await listRunnerJobs(auth) });
  } catch (error) {
    return handleRouteError(error);
  }
}
