import crypto from "node:crypto";

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const input = (await request.json().catch(() => ({}))) as {
    client_name?: string;
    redirect_uris?: string[];
  };

  return NextResponse.json(
    {
      client_id: `inflara_oauth_${crypto.randomBytes(12).toString("base64url")}`,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: input.client_name ?? "Inflara MCP client",
      redirect_uris: Array.isArray(input.redirect_uris) ? input.redirect_uris : [],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}
