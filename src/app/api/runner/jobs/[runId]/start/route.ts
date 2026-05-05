import {
  authenticateRunnerRequest,
  startAgentRunSchema,
  startRunnerJob,
} from "@/lib/agent-runs";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const auth = await authenticateRunnerRequest(request);
    const { runId } = await params;
    const input = startAgentRunSchema.parse(await request.json());
    return success({ run: await startRunnerJob(auth, runId, input) });
  } catch (error) {
    return handleRouteError(error);
  }
}
