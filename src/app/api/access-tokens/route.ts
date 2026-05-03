import { z } from "zod";

import { handleRouteError, success } from "@/app/api/_helpers";
import { requireUserId } from "@/lib/auth";
import {
  createApiAccessToken,
  listApiAccessTokens,
} from "@/lib/api-tokens";

const createTokenSchema = z.object({
  name: z.string().min(1).max(80),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    return success({ tokens: await listApiAccessTokens(userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const input = createTokenSchema.parse(await request.json());
    const token = await createApiAccessToken(userId, input.name);
    return success(token, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
