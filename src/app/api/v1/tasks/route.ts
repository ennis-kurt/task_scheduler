import { apiSuccess, handleApiError, requireApiAuth } from "@/app/api/v1/_helpers";
import {
  createRemoteTask,
  listRemoteTasks,
} from "@/lib/remote-agent-planner";
import { taskSchema } from "@/lib/planner/validators";
import { TASK_STATUSES, type TaskStatus } from "@/lib/planner/types";

const TASK_STATUS_SET = new Set(TASK_STATUSES);

function parseTaskStatus(value: string | null): TaskStatus | null {
  return value && TASK_STATUS_SET.has(value as TaskStatus) ? (value as TaskStatus) : null;
}

export async function GET(request: Request) {
  try {
    const auth = await requireApiAuth(request);
    const url = new URL(request.url);
    return apiSuccess({
      tasks: await listRemoteTasks(auth, {
        projectId: url.searchParams.get("projectId"),
        milestoneId: url.searchParams.get("milestoneId"),
        status: parseTaskStatus(url.searchParams.get("status")),
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiAuth(request);
    const input = taskSchema.parse(await request.json());
    return apiSuccess({ task: await createRemoteTask(auth, input) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
