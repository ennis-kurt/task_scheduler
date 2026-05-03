import crypto from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { apiAccessTokens } from "@/db/schema";
import { getDb } from "@/db";
import { isDatabaseConfigured } from "@/lib/env";
import { readDemoSnapshot, writeDemoSnapshot } from "@/lib/planner/demo-store";
import { plannerRepository } from "@/lib/planner/repository";
import type {
  ApiAccessTokenPublicRecord,
  ApiAccessTokenRecord,
  ApiAccessTokenScopeType,
  CreatedApiAccessToken,
} from "@/lib/planner/types";

export type CreateApiAccessTokenInput = {
  name: string;
  scopeType?: ApiAccessTokenScopeType;
  projectIds?: string[];
};

export type ApiTokenAuthContext = {
  token: string;
  tokenId: string;
  tokenPrefix: string;
  userId: string;
  scopeType: ApiAccessTokenScopeType;
  projectIds: string[];
  scopes: string[];
};

export class ApiTokenAuthError extends Error {
  constructor(
    public code:
      | "MISSING_TOKEN"
      | "INVALID_TOKEN"
      | "REVOKED_TOKEN"
      | "FORBIDDEN_PROJECT",
    message: string,
  ) {
    super(message);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function nowDate() {
  return new Date();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function randomPart(bytes: number) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createRawToken() {
  const tokenPrefix = `ifl_${randomPart(6)}`;
  return {
    tokenPrefix,
    token: `${tokenPrefix}_${randomPart(32)}`,
  };
}

function toPublic(record: ApiAccessTokenRecord): ApiAccessTokenPublicRecord {
  const { tokenHash, ...publicRecord } = record;
  void tokenHash;
  return publicRecord;
}

function mapDbToken(record: typeof apiAccessTokens.$inferSelect): ApiAccessTokenRecord {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    tokenPrefix: record.tokenPrefix,
    tokenHash: record.tokenHash,
    scopeType: normalizeScopeType(record.scopeType),
    projectIds: normalizeProjectIds(record.projectIds),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function bearerTokenFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function normalizeScopeType(value: unknown): ApiAccessTokenScopeType {
  return value === "selected_projects" ? "selected_projects" : "all_projects";
}

function normalizeProjectIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter((item): item is string => typeof item === "string" && item.length > 0),
    ),
  );
}

function normalizeCreateInput(input: CreateApiAccessTokenInput) {
  const scopeType = normalizeScopeType(input.scopeType);
  const projectIds =
    scopeType === "selected_projects" ? normalizeProjectIds(input.projectIds) : [];

  if (scopeType === "selected_projects" && projectIds.length === 0) {
    throw new Error("PROJECT_SCOPE_REQUIRED");
  }

  return {
    name: input.name,
    scopeType,
    projectIds,
  };
}

function validateProjectScope(availableProjectIds: string[], record: ApiAccessTokenRecord) {
  if (record.scopeType !== "selected_projects") {
    return;
  }

  const allowedProjectIds = new Set(availableProjectIds);
  const invalidProjectIds = record.projectIds.filter(
    (projectId) => !allowedProjectIds.has(projectId),
  );

  if (invalidProjectIds.length) {
    throw new Error("INVALID_PROJECT_SCOPE");
  }
}

let ensureApiAccessTokensTablePromise: Promise<void> | null = null;

async function ensureApiAccessTokensTable() {
  if (!isDatabaseConfigured()) {
    return;
  }

  ensureApiAccessTokensTablePromise ??= (async () => {
    const db = getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "api_access_tokens" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL,
        "token_prefix" text NOT NULL,
        "token_hash" text NOT NULL,
        "scope_type" text DEFAULT 'all_projects' NOT NULL,
        "project_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "last_used_at" timestamp with time zone,
        "revoked_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      ALTER TABLE "api_access_tokens"
      ADD COLUMN IF NOT EXISTS "scope_type" text DEFAULT 'all_projects' NOT NULL
    `);
    await db.execute(sql`
      ALTER TABLE "api_access_tokens"
      ADD COLUMN IF NOT EXISTS "project_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "api_access_tokens_token_hash_idx"
      ON "api_access_tokens" USING btree ("token_hash")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "api_access_tokens_user_id_idx"
      ON "api_access_tokens" USING btree ("user_id")
    `);
  })().catch((error) => {
    ensureApiAccessTokensTablePromise = null;
    throw error;
  });

  return ensureApiAccessTokensTablePromise;
}

export async function listApiAccessTokens(userId: string) {
  if (isDatabaseConfigured()) {
    await ensureApiAccessTokensTable();
    const db = getDb();
    const rows = await db
      .select()
      .from(apiAccessTokens)
      .where(eq(apiAccessTokens.userId, userId));
    return rows
      .map((record) => toPublic(mapDbToken(record)))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const snapshot = await readDemoSnapshot(userId);
  return snapshot.apiAccessTokens
    .map(toPublic)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createApiAccessToken(
  userId: string,
  input: CreateApiAccessTokenInput,
): Promise<CreatedApiAccessToken> {
  const normalizedInput = normalizeCreateInput(input);
  const timestamp = nowIso();
  const { token, tokenPrefix } = createRawToken();
  const record: ApiAccessTokenRecord = {
    id: id("token"),
    userId,
    name: normalizedInput.name,
    tokenPrefix,
    tokenHash: hashToken(token),
    scopeType: normalizedInput.scopeType,
    projectIds: normalizedInput.projectIds,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (isDatabaseConfigured()) {
    const workspace = await plannerRepository.getWorkspace(userId);
    validateProjectScope(workspace.projects.map((project) => project.id), record);
    await ensureApiAccessTokensTable();
    const db = getDb();
    await db.insert(apiAccessTokens).values({
      id: record.id,
      userId,
      name: record.name,
      tokenPrefix,
      tokenHash: record.tokenHash,
      scopeType: record.scopeType,
      projectIds: record.projectIds,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: nowDate(),
      updatedAt: nowDate(),
    });
  } else {
    const snapshot = await readDemoSnapshot(userId);
    validateProjectScope(snapshot.projects.map((project) => project.id), record);
    snapshot.apiAccessTokens.unshift(record);
    await writeDemoSnapshot(snapshot);
  }

  return {
    token,
    record: toPublic(record),
  };
}

export async function revokeApiAccessToken(userId: string, tokenId: string) {
  const timestamp = nowIso();

  if (isDatabaseConfigured()) {
    await ensureApiAccessTokensTable();
    const db = getDb();
    const [existing] = await db
      .select()
      .from(apiAccessTokens)
      .where(and(eq(apiAccessTokens.id, tokenId), eq(apiAccessTokens.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new Error("NOT_FOUND");
    }

    await db
      .update(apiAccessTokens)
      .set({
        revokedAt: existing.revokedAt ?? nowDate(),
        updatedAt: nowDate(),
      })
      .where(and(eq(apiAccessTokens.id, tokenId), eq(apiAccessTokens.userId, userId)));

    const [updated] = await db
      .select()
      .from(apiAccessTokens)
      .where(and(eq(apiAccessTokens.id, tokenId), eq(apiAccessTokens.userId, userId)))
      .limit(1);
    return toPublic(mapDbToken(updated));
  }

  const snapshot = await readDemoSnapshot(userId);
  const record = snapshot.apiAccessTokens.find((token) => token.id === tokenId);

  if (!record) {
    throw new Error("NOT_FOUND");
  }

  record.revokedAt ??= timestamp;
  record.updatedAt = timestamp;
  await writeDemoSnapshot(snapshot);
  return toPublic(record);
}

export async function authenticateApiToken(token: string | null) {
  if (!token) {
    throw new ApiTokenAuthError("MISSING_TOKEN", "Missing bearer token.");
  }

  const tokenHash = hashToken(token);

  if (isDatabaseConfigured()) {
    await ensureApiAccessTokensTable();
    const db = getDb();
    const [record] = await db
      .select()
      .from(apiAccessTokens)
      .where(eq(apiAccessTokens.tokenHash, tokenHash))
      .limit(1);

    if (!record) {
      throw new ApiTokenAuthError("INVALID_TOKEN", "Invalid bearer token.");
    }

    if (record.revokedAt) {
      throw new ApiTokenAuthError("REVOKED_TOKEN", "This bearer token has been revoked.");
    }

    await db
      .update(apiAccessTokens)
      .set({ lastUsedAt: nowDate(), updatedAt: nowDate() })
      .where(eq(apiAccessTokens.id, record.id));

    return {
      token,
      tokenId: record.id,
      tokenPrefix: record.tokenPrefix,
      userId: record.userId,
      scopeType: normalizeScopeType(record.scopeType),
      projectIds: normalizeProjectIds(record.projectIds),
      scopes: ["planner:read", "planner:write"],
    } satisfies ApiTokenAuthContext;
  }

  const snapshot = await readDemoSnapshot("demo-user");
  const record = snapshot.apiAccessTokens.find(
    (candidate) => candidate.tokenHash === tokenHash,
  );

  if (!record) {
    throw new ApiTokenAuthError("INVALID_TOKEN", "Invalid bearer token.");
  }

  if (record.revokedAt) {
    throw new ApiTokenAuthError("REVOKED_TOKEN", "This bearer token has been revoked.");
  }

  record.lastUsedAt = nowIso();
  record.updatedAt = record.lastUsedAt;
  await writeDemoSnapshot(snapshot);

  return {
    token,
    tokenId: record.id,
    tokenPrefix: record.tokenPrefix,
    userId: record.userId,
    scopeType: normalizeScopeType(record.scopeType),
    projectIds: normalizeProjectIds(record.projectIds),
    scopes: ["planner:read", "planner:write"],
  } satisfies ApiTokenAuthContext;
}

export async function authenticateApiTokenRequest(request: Request) {
  return authenticateApiToken(bearerTokenFromRequest(request));
}

export function canAccessProject(
  auth: ApiTokenAuthContext,
  projectId: string | null | undefined,
) {
  if (auth.scopeType === "all_projects") {
    return true;
  }

  return Boolean(projectId && auth.projectIds.includes(projectId));
}

export function assertApiTokenProjectAccess(
  auth: ApiTokenAuthContext,
  projectId: string | null | undefined,
) {
  if (!canAccessProject(auth, projectId)) {
    throw new ApiTokenAuthError(
      "FORBIDDEN_PROJECT",
      "This token does not have access to the requested project.",
    );
  }
}

export function assertApiTokenAccountAccess(auth: ApiTokenAuthContext) {
  if (auth.scopeType === "selected_projects") {
    throw new ApiTokenAuthError(
      "FORBIDDEN_PROJECT",
      "This action requires an all-projects token.",
    );
  }
}
