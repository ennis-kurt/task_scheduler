import {
  authenticateRunnerRequest,
  heartbeatRunner,
  runnerHeartbeatSchema,
} from "@/lib/agent-runs";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function POST(request: Request) {
  try {
    const auth = await authenticateRunnerRequest(request);
    const input = runnerHeartbeatSchema.parse(await request.json());
    return success(await heartbeatRunner(auth, input));
  } catch (error) {
    return handleRouteError(error);
  }
}
