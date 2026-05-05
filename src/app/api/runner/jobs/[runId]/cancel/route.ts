import { authenticateRunnerRequest, cancelRunnerJob } from "@/lib/agent-runs";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const auth = await authenticateRunnerRequest(request);
    const { runId } = await params;
    return success({ run: await cancelRunnerJob(auth, runId) });
  } catch (error) {
    return handleRouteError(error);
  }
}
