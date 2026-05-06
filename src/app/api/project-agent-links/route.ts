import { requireUserId } from "@/lib/auth";
import {
  listProjectAgentLinks,
  upsertProjectAgentLink,
  upsertProjectAgentLinkSchema,
} from "@/lib/agent-runs";
import { handleRouteError, success } from "@/app/api/_helpers";

export async function GET() {
  try {
    const userId = await requireUserId();
    return success({ links: await listProjectAgentLinks(userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = upsertProjectAgentLinkSchema.parse(await request.json());
    return success({ link: await upsertProjectAgentLink(userId, input) });
  } catch (error) {
    return handleRouteError(error);
  }
}
