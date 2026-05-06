import { NextResponse } from "next/server";

import { originFromRequest } from "@/lib/oauth";

export async function GET(request: Request) {
  const origin = originFromRequest(request);

  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["planner:read", "planner:write"],
    service_documentation: `${origin}/mcp`,
  });
}
