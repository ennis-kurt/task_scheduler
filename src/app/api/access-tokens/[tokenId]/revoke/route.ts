import { handleRouteError, success } from "@/app/api/_helpers";
import { requireUserId } from "@/lib/auth";
import { revokeApiAccessToken } from "@/lib/api-tokens";

type RouteContext = {
  params: Promise<{
    tokenId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { tokenId } = await context.params;
    return success({ token: await revokeApiAccessToken(userId, tokenId) });
  } catch (error) {
    return handleRouteError(error);
  }
}
