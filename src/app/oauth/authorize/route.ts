import { NextResponse } from "next/server";

import { getSessionContext } from "@/lib/auth";
import { createOAuthCode, htmlEscape, normalizeOAuthScope, safeRedirectUri } from "@/lib/oauth";
import { plannerRepository } from "@/lib/planner/repository";
import type { ApiAccessTokenScopeType } from "@/lib/planner/types";

function invalidRequest(message: string, status = 400) {
  return new NextResponse(
    `<!doctype html><html><body><h1>OAuth request error</h1><p>${htmlEscape(message)}</p></body></html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

async function readAuthorizeParams(request: Request) {
  const url = new URL(request.url);

  return {
    responseType: url.searchParams.get("response_type"),
    clientId: url.searchParams.get("client_id")?.trim() ?? "",
    redirectUri: safeRedirectUri(url.searchParams.get("redirect_uri")),
    state: url.searchParams.get("state") ?? "",
    codeChallenge: url.searchParams.get("code_challenge")?.trim() ?? "",
    codeChallengeMethod:
      url.searchParams.get("code_challenge_method") === "plain" ? "plain" : "S256",
    scope: normalizeOAuthScope(url.searchParams.get("scope")),
  } as const;
}

export async function GET(request: Request) {
  let params: Awaited<ReturnType<typeof readAuthorizeParams>>;

  try {
    params = await readAuthorizeParams(request);
  } catch (error) {
    return invalidRequest(error instanceof Error ? error.message : "Invalid OAuth request");
  }

  if (params.responseType !== "code") {
    return invalidRequest("Inflara only supports the authorization-code response type.");
  }

  if (!params.clientId || !params.codeChallenge) {
    return invalidRequest("Missing client_id or PKCE code_challenge.");
  }

  const session = await getSessionContext();

  if (!session.userId) {
    const signInUrl = new URL("/sign-in", new URL(request.url).origin);
    signInUrl.searchParams.set("redirect_url", request.url);
    return NextResponse.redirect(signInUrl);
  }

  const workspace = await plannerRepository.getWorkspace(session.userId);
  const projectOptions = workspace.projects
    .map(
      (project) => `
        <label class="project-option">
          <input type="checkbox" name="projectIds" value="${htmlEscape(project.id)}" />
          <span>${htmlEscape(project.name)}</span>
        </label>
      `,
    )
    .join("");

  const html = `<!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Authorize Inflara MCP access</title>
        <style>
          body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #111827; }
          main { max-width: 720px; margin: 0 auto; padding: 48px 20px; }
          section { border: 1px solid #dbe3ea; background: white; border-radius: 18px; padding: 24px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08); }
          h1 { margin: 0; font-size: 28px; letter-spacing: -0.04em; }
          p { color: #64748b; line-height: 1.6; }
          .scope { display: grid; gap: 12px; margin: 20px 0; }
          label { display: flex; gap: 10px; align-items: center; font-size: 14px; }
          .projects { display: grid; gap: 8px; max-height: 180px; overflow: auto; margin: 10px 0 0 24px; }
          .project-option { padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 10px; }
          button { border: 0; border-radius: 12px; padding: 12px 16px; background: #111827; color: white; font-weight: 700; cursor: pointer; }
          .muted { font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <main>
          <section>
            <h1>Authorize Inflara MCP access</h1>
            <p>
              ${htmlEscape(params.clientId)} is requesting access to read and update Inflara planner data.
            </p>
            <form method="post" action="/oauth/authorize">
              <input type="hidden" name="client_id" value="${htmlEscape(params.clientId)}" />
              <input type="hidden" name="redirect_uri" value="${htmlEscape(params.redirectUri)}" />
              <input type="hidden" name="state" value="${htmlEscape(params.state)}" />
              <input type="hidden" name="code_challenge" value="${htmlEscape(params.codeChallenge)}" />
              <input type="hidden" name="code_challenge_method" value="${htmlEscape(params.codeChallengeMethod)}" />
              <input type="hidden" name="scope" value="${htmlEscape(params.scope)}" />
              <div class="scope">
                <label>
                  <input type="radio" name="scopeType" value="all_projects" checked />
                  <span>Allow all current and future projects</span>
                </label>
                <label>
                  <input type="radio" name="scopeType" value="selected_projects" />
                  <span>Allow only selected projects</span>
                </label>
                <div class="projects">${projectOptions || "<p class=\"muted\">No projects available.</p>"}</div>
              </div>
              <button type="submit">Authorize access</button>
              <p class="muted">Access tokens can be revoked later from Inflara Settings.</p>
            </form>
          </section>
        </main>
      </body>
    </html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const session = await getSessionContext();

  if (!session.userId) {
    return invalidRequest("You must be signed in to authorize this client.", 401);
  }

  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "").trim();
  const redirectUri = safeRedirectUri(String(form.get("redirect_uri") ?? ""));
  const state = String(form.get("state") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "").trim();
  const codeChallengeMethod = form.get("code_challenge_method") === "plain" ? "plain" : "S256";
  const scope = normalizeOAuthScope(String(form.get("scope") ?? ""));
  const scopeType: ApiAccessTokenScopeType =
    form.get("scopeType") === "selected_projects" ? "selected_projects" : "all_projects";
  const projectIds =
    scopeType === "selected_projects"
      ? form.getAll("projectIds").map((value) => String(value)).filter(Boolean)
      : [];

  if (!clientId || !codeChallenge) {
    return invalidRequest("Missing client_id or PKCE code_challenge.");
  }

  if (scopeType === "selected_projects" && projectIds.length === 0) {
    return invalidRequest("Select at least one project or allow all projects.");
  }

  const code = createOAuthCode({
    userId: session.userId,
    clientId,
    redirectUri,
    scope,
    scopeType,
    projectIds,
    codeChallenge,
    codeChallengeMethod,
  });
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);

  if (state) {
    redirect.searchParams.set("state", state);
  }

  return NextResponse.redirect(redirect);
}
