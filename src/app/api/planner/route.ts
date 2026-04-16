import { getInitialPlannerPayload } from "@/lib/planner/service";
import { success, handleRouteError } from "@/app/api/_helpers";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const payload = await getInitialPlannerPayload(
      start && end ? { start, end } : undefined,
    );

    return success(payload);
  } catch (error) {
    return handleRouteError(error);
  }
}
