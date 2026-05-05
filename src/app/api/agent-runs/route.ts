import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import {
  createAgentRun,
  createAgentRunSchema,
  listAgentRuns,
} from "@/lib/agent-runs";
import { handleRouteError, success } from "@/app/api/_helpers";

const querySchema = z.object({
  taskId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const query = querySchema.parse({
      taskId: url.searchParams.get("taskId"),
      projectId: url.searchParams.get("projectId"),
    });
    return success({ runs: await listAgentRuns(userId, query) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = createAgentRunSchema.parse(await request.json());
    return success({ run: await createAgentRun(userId, input) }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
