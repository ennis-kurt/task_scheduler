import { requireUserId } from "@/lib/auth";
import { revokeAgentRunner } from "@/lib/agent-runs";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runnerId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { runnerId } = await params;
    return success({ runner: await revokeAgentRunner(userId, runnerId) });
  } catch (error) {
    return handleRouteError(error);
  }
}
