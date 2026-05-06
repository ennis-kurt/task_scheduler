import crypto from "node:crypto";

import type { ApiAccessTokenScopeType } from "@/lib/planner/types";

export type OAuthCodeChallengeMethod = "plain" | "S256";

export type OAuthAuthorizationCodePayload = {
  version: 1;
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  scopeType: ApiAccessTokenScopeType;
  projectIds: string[];
  codeChallenge: string;
  codeChallengeMethod: OAuthCodeChallengeMethod;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function signingSecret() {
  return (
    process.env.INFLARA_OAUTH_SECRET ||
    process.env.CLERK_SECRET_KEY ||
    process.env.NEXTAUTH_SECRET ||
    "inflara-local-oauth-development-secret"
  );
}

function sign(value: string) {
  return crypto.createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function originFromRequest(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const protocol = forwardedProto ?? url.protocol.replace(":", "");

  return `${protocol}://${host}`;
}

export function createOAuthCode(
  input: Omit<OAuthAuthorizationCodePayload, "version" | "issuedAt" | "expiresAt" | "nonce">,
) {
  const now = Math.floor(Date.now() / 1000);
  const payload: OAuthAuthorizationCodePayload = {
    ...input,
    version: 1,
    issuedAt: now,
    expiresAt: now + 5 * 60,
    nonce: crypto.randomBytes(16).toString("base64url"),
  };
  const body = base64url(JSON.stringify(payload));

  return `${body}.${sign(body)}`;
}

export function readOAuthCode(code: string) {
  const [body, signature] = code.split(".");

  if (!body || !signature || !timingSafeEqual(sign(body), signature)) {
    throw new OAuthError("invalid_grant", "The authorization code is invalid.");
  }

  let payload: OAuthAuthorizationCodePayload;

  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new OAuthError("invalid_grant", "The authorization code is malformed.");
  }

  if (payload.version !== 1 || payload.expiresAt < Math.floor(Date.now() / 1000)) {
    throw new OAuthError("invalid_grant", "The authorization code has expired.");
  }

  return payload;
}

export function normalizeOAuthScope(value: string | null | undefined) {
  const scopes = new Set(
    (value ?? "planner:read planner:write")
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
  scopes.add("planner:read");

  return Array.from(scopes).join(" ");
}

export function verifyPkce(
  verifier: string | null | undefined,
  challenge: string,
  method: OAuthCodeChallengeMethod,
) {
  if (!verifier) {
    throw new OAuthError("invalid_request", "Missing PKCE code verifier.");
  }

  const computed =
    method === "S256"
      ? crypto.createHash("sha256").update(verifier).digest("base64url")
      : verifier;

  if (!timingSafeEqual(computed, challenge)) {
    throw new OAuthError("invalid_grant", "The PKCE verifier does not match.");
  }
}

export function safeRedirectUri(value: string | null | undefined) {
  if (!value) {
    throw new OAuthError("invalid_request", "Missing redirect_uri.");
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Unsupported protocol");
    }

    return url.toString();
  } catch {
    throw new OAuthError("invalid_request", "Invalid redirect_uri.");
  }
}

export function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
