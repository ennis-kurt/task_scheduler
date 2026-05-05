import { NextResponse } from "next/server";

import { originFromRequest } from "@/lib/oauth";

export async function GET(request: Request) {
  const origin = originFromRequest(request);

  return NextResponse.json({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["planner:read", "planner:write"],
    bearer_methods_supported: ["header"],
  });
}
