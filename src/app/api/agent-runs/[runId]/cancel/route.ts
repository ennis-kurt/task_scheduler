import { requireUserId } from "@/lib/auth";
import { cancelAgentRun } from "@/lib/agent-runs";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { runId } = await params;
    return success({ run: await cancelAgentRun(userId, runId) });
  } catch (error) {
    return handleRouteError(error);
  }
}
