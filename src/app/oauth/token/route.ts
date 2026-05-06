import { NextResponse } from "next/server";

import { createApiAccessToken } from "@/lib/api-tokens";
import { OAuthError, readOAuthCode, verifyPkce } from "@/lib/oauth";

function oauthError(error: OAuthError) {
  return NextResponse.json(
    {
      error: error.code,
      error_description: error.message,
    },
    { status: error.status },
  );
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const grantType = String(form.get("grant_type") ?? "");

    if (grantType !== "authorization_code") {
      throw new OAuthError("unsupported_grant_type", "Inflara only supports authorization_code.");
    }

    const code = String(form.get("code") ?? "");
    const clientId = String(form.get("client_id") ?? "");
    const redirectUri = String(form.get("redirect_uri") ?? "");
    const codeVerifier = String(form.get("code_verifier") ?? "");
    const payload = readOAuthCode(code);

    if (payload.clientId !== clientId || payload.redirectUri !== redirectUri) {
      throw new OAuthError("invalid_grant", "The authorization code does not match this client.");
    }

    verifyPkce(codeVerifier, payload.codeChallenge, payload.codeChallengeMethod);

    const created = await createApiAccessToken(payload.userId, {
      name: `OAuth MCP client ${clientId.slice(0, 32)}`,
      scopeType: payload.scopeType,
      projectIds: payload.projectIds,
    });

    return NextResponse.json({
      access_token: created.token,
      token_type: "Bearer",
      scope: payload.scope,
      expires_in: 31_536_000,
    });
  } catch (error) {
    if (error instanceof OAuthError) {
      return oauthError(error);
    }

    console.error(error);
    return NextResponse.json(
      {
        error: "server_error",
        error_description: "Could not exchange the authorization code.",
      },
      { status: 500 },
    );
  }
}
