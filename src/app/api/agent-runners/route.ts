import { requireUserId } from "@/lib/auth";
import {
  createAgentRunner,
  createAgentRunnerSchema,
  listAgentRunners,
} from "@/lib/agent-runs";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function GET() {
  try {
    const userId = await requireUserId();
    return success({ runners: await listAgentRunners(userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = createAgentRunnerSchema.parse(await request.json());
    return success(await createAgentRunner(userId, input), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
