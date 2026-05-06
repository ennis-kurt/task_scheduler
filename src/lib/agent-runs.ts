import crypto from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  agentRunEvents,
  agentRunners,
  agentRuns,
  projectAgentLinks,
} from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";
import { readDemoSnapshot, writeDemoSnapshot } from "@/lib/planner/demo-store";
import { plannerRepository } from "@/lib/planner/repository";
import type {
  AgentRunEventRecord,
  AgentRunnerCapabilities,
  AgentRunnerPublicRecord,
  AgentRunnerRecord,
  AgentRunRecord,
  AgentRunStatus,
  AgentRunWithEvents,
  AgentType,
  CreatedAgentRunner,
  ProjectAgentLinkRecord,
  WorkspaceSnapshot,
} from "@/lib/planner/types";

export const createAgentRunnerSchema = z.object({
  name: z.string().min(1).max(100),
  platform: z.string().min(1).max(40).default("macos"),
  appVersion: z.string().min(1).max(40).default("0.1.0"),
  capabilities: z.unknown().optional(),
});

export const upsertProjectAgentLinkSchema = z.object({
  projectId: z.string().min(1),
  repoUrl: z.string().max(300).default(""),
  defaultBranch: z.string().min(1).max(80).default("main"),
});

export const createAgentRunSchema = z.object({
  taskId: z.string().min(1),
  milestoneId: z.string().nullable().optional(),
  runnerId: z.string().min(1),
  agentType: z.enum(["codex", "claude_code"]),
  modelName: z.string().max(120).nullable().optional(),
  extraPrompt: z.string().max(8000).optional(),
});

export const runnerHeartbeatSchema = z.object({
  appVersion: z.string().max(40).optional(),
  platform: z.string().max(40).optional(),
  capabilities: z.unknown().optional(),
});

export const appendAgentRunEventSchema = z.object({
  events: z
    .array(
      z.object({
        type: z.enum([
          "created",
          "claimed",
          "confirmation_requested",
          "started",
          "log",
          "status",
          "finished",
          "failed",
          "cancelled",
          "heartbeat",
        ]),
        message: z.string().max(4000).optional(),
        data: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(25),
});

export const startAgentRunSchema = z.object({
  branchName: z.string().max(160).nullable().optional(),
  modelName: z.string().max(120).nullable().optional(),
});

export const finishAgentRunSchema = z.object({
  summary: z.string().max(8000),
  changedFiles: z.array(z.string().max(500)).max(500).default([]),
  verification: z.unknown().optional(),
  confidence: z.number().int().min(1).max(100).nullable().optional(),
  riskyAreas: z.array(z.string().max(240)).max(100).default([]),
  branchName: z.string().max(160).nullable().optional(),
});

export const failAgentRunSchema = z.object({
  errorMessage: z.string().max(4000),
});

export type RunnerAuthContext = {
  token: string;
  runner: AgentRunnerRecord;
};

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
  const tokenPrefix = `ifr_${randomPart(6)}`;
  return {
    tokenPrefix,
    token: `${tokenPrefix}_${randomPart(32)}`,
  };
}

function iso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeCapabilities(value: unknown): AgentRunnerCapabilities {
  return value && typeof value === "object" ? (value as AgentRunnerCapabilities) : {};
}

function toRunnerPublic(record: AgentRunnerRecord): AgentRunnerPublicRecord {
  const { tokenHash, ...publicRecord } = record;
  void tokenHash;
  return publicRecord;
}

function mapDbRunner(record: typeof agentRunners.$inferSelect): AgentRunnerRecord {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    tokenPrefix: record.tokenPrefix,
    tokenHash: record.tokenHash,
    platform: record.platform,
    appVersion: record.appVersion,
    capabilities: normalizeCapabilities(record.capabilities),
    lastSeenAt: iso(record.lastSeenAt),
    revokedAt: iso(record.revokedAt),
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapDbProjectAgentLink(
  record: typeof projectAgentLinks.$inferSelect,
): ProjectAgentLinkRecord {
  return {
    id: record.id,
    userId: record.userId,
    projectId: record.projectId,
    repoUrl: record.repoUrl,
    defaultBranch: record.defaultBranch,
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapDbRun(record: typeof agentRuns.$inferSelect): AgentRunRecord {
  return {
    id: record.id,
    userId: record.userId,
    taskId: record.taskId,
    milestoneId: record.milestoneId,
    projectId: record.projectId,
    runnerId: record.runnerId,
    agentType: record.agentType as AgentType,
    modelName: record.modelName,
    status: record.status as AgentRunStatus,
    extraPrompt: record.extraPrompt,
    branchName: record.branchName,
    summary: record.summary,
    changedFiles: Array.isArray(record.changedFiles) ? record.changedFiles : [],
    verification: record.verification,
    confidence: record.confidence,
    riskyAreas: Array.isArray(record.riskyAreas) ? record.riskyAreas : [],
    errorMessage: record.errorMessage,
    startedAt: iso(record.startedAt),
    finishedAt: iso(record.finishedAt),
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapDbEvent(record: typeof agentRunEvents.$inferSelect): AgentRunEventRecord {
  return {
    id: record.id,
    userId: record.userId,
    runId: record.runId,
    type: record.type as AgentRunEventRecord["type"],
    message: record.message,
    data: record.data,
    createdAt: iso(record.createdAt)!,
  };
}

function bearerTokenFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

let ensureAgentTablesPromise: Promise<void> | null = null;

async function ensureAgentTables() {
  if (!isDatabaseConfigured()) {
    return;
  }

  ensureAgentTablesPromise ??= (async () => {
    const db = getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "agent_runners" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL,
        "token_prefix" text NOT NULL,
        "token_hash" text NOT NULL,
        "platform" text NOT NULL,
        "app_version" text DEFAULT '0.1.0' NOT NULL,
        "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "last_seen_at" timestamp with time zone,
        "revoked_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "project_agent_links" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
        "repo_url" text DEFAULT '' NOT NULL,
        "default_branch" text DEFAULT 'main' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "agent_runs" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "task_id" text REFERENCES "tasks"("id") ON DELETE set null,
        "milestone_id" text REFERENCES "milestones"("id") ON DELETE set null,
        "project_id" text REFERENCES "projects"("id") ON DELETE set null,
        "runner_id" text REFERENCES "agent_runners"("id") ON DELETE set null,
        "agent_type" text NOT NULL,
        "model_name" text,
        "status" text NOT NULL,
        "extra_prompt" text DEFAULT '' NOT NULL,
        "branch_name" text,
        "summary" text,
        "changed_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "verification" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "confidence" integer,
        "risky_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "error_message" text,
        "started_at" timestamp with time zone,
        "finished_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "agent_run_events" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "run_id" text NOT NULL REFERENCES "agent_runs"("id") ON DELETE cascade,
        "type" text NOT NULL,
        "message" text DEFAULT '' NOT NULL,
        "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "agent_runners_token_hash_idx" ON "agent_runners" ("token_hash")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "agent_runners_user_id_idx" ON "agent_runners" ("user_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "project_agent_links_project_id_idx" ON "project_agent_links" ("project_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "project_agent_links_user_id_idx" ON "project_agent_links" ("user_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "agent_runs_user_id_idx" ON "agent_runs" ("user_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "agent_runs_task_id_idx" ON "agent_runs" ("task_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "agent_runs_runner_id_idx" ON "agent_runs" ("runner_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "agent_runs_status_idx" ON "agent_runs" ("status")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "agent_run_events_run_id_idx" ON "agent_run_events" ("run_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "agent_run_events_user_id_idx" ON "agent_run_events" ("user_id")`);
  })().catch((error) => {
    ensureAgentTablesPromise = null;
    throw error;
  });

  return ensureAgentTablesPromise;
}

async function withDemoSnapshot<T>(
  userId: string,
  mutator: (snapshot: WorkspaceSnapshot) => T | Promise<T>,
) {
  const snapshot = await readDemoSnapshot(userId);
  const result = await mutator(snapshot);
  await writeDemoSnapshot(snapshot);
  return result;
}

function findRun(snapshot: WorkspaceSnapshot, userId: string, runId: string) {
  const run = snapshot.agentRuns.find(
    (candidate) => candidate.id === runId && candidate.userId === userId,
  );

  if (!run) {
    throw new Error("NOT_FOUND");
  }

  return run;
}

function findRunner(snapshot: WorkspaceSnapshot, userId: string, runnerId: string) {
  const runner = snapshot.agentRunners.find(
    (candidate) => candidate.id === runnerId && candidate.userId === userId,
  );

  if (!runner) {
    throw new Error("NOT_FOUND");
  }

  return runner;
}

function decorateRuns(
  runs: AgentRunRecord[],
  runners: AgentRunnerRecord[],
  events: AgentRunEventRecord[],
): AgentRunWithEvents[] {
  return runs.map((run) => ({
    ...run,
    runner: run.runnerId
      ? toRunnerPublic(runners.find((runner) => runner.id === run.runnerId) ?? {
          id: run.runnerId,
          userId: run.userId,
          name: "Unknown runner",
          tokenPrefix: "",
          tokenHash: "",
          platform: "unknown",
          appVersion: "",
          capabilities: {},
          lastSeenAt: null,
          revokedAt: null,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
        })
      : null,
    events: events
      .filter((event) => event.runId === run.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
  }));
}

async function createRunEvent(
  userId: string,
  runId: string,
  type: AgentRunEventRecord["type"],
  message = "",
  data: unknown = {},
) {
  const eventId = id("event");
  const timestamp = nowIso();

  if (isDatabaseConfigured()) {
    await ensureAgentTables();
    const db = getDb();
    await db.insert(agentRunEvents).values({
      id: eventId,
      userId,
      runId,
      type,
      message,
      data,
      createdAt: nowDate(),
    });
    const [record] = await db
      .select()
      .from(agentRunEvents)
      .where(eq(agentRunEvents.id, eventId))
      .limit(1);
    return mapDbEvent(record);
  }

  return withDemoSnapshot(userId, (snapshot) => {
    const event: AgentRunEventRecord = {
      id: eventId,
      userId,
      runId,
      type,
      message,
      data,
      createdAt: timestamp,
    };
    snapshot.agentRunEvents.push(event);
    return event;
  });
}

export async function listAgentRunners(userId: string) {
  if (isDatabaseConfigured()) {
    await ensureAgentTables();
    const db = getDb();
    const rows = await db
      .select()
      .from(agentRunners)
      .where(eq(agentRunners.userId, userId))
      .orderBy(desc(agentRunners.createdAt));
    return rows.map(mapDbRunner).map(toRunnerPublic);
  }

  const snapshot = await readDemoSnapshot(userId);
  return snapshot.agentRunners
    .filter((runner) => runner.userId === userId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(toRunnerPublic);
}

export async function createAgentRunner(
  userId: string,
  input: z.infer<typeof createAgentRunnerSchema>,
): Promise<CreatedAgentRunner> {
  const workspace = await plannerRepository.getWorkspace(userId);
  void workspace;
  const timestamp = nowIso();
  const { token, tokenPrefix } = createRawToken();
  const runner: AgentRunnerRecord = {
    id: id("runner"),
    userId,
    name: input.name,
    tokenPrefix,
    tokenHash: hashToken(token),
    platform: input.platform,
    appVersion: input.appVersion,
    capabilities: normalizeCapabilities(input.capabilities),
    lastSeenAt: null,
    revokedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (isDatabaseConfigured()) {
    await ensureAgentTables();
    const db = getDb();
    await db.insert(agentRunners).values({
      id: runner.id,
      userId,
      name: runner.name,
      tokenPrefix,
      tokenHash: runner.tokenHash,
      platform: runner.platform,
      appVersion: runner.appVersion,
      capabilities: runner.capabilities,
      createdAt: nowDate(),
      updatedAt: nowDate(),
    });
  } else {
    const snapshot = await readDemoSnapshot(userId);
    snapshot.agentRunners.unshift(runner);
    await writeDemoSnapshot(snapshot);
  }

  return {
    token,
    runner: toRunnerPublic(runner),
  };
}

export async function revokeAgentRunner(userId: string, runnerId: string) {
  if (isDatabaseConfigured()) {
    await ensureAgentTables();
    const db = getDb();
    await db
      .update(agentRunners)
      .set({ revokedAt: nowDate(), updatedAt: nowDate() })
      .where(and(eq(agentRunners.id, runnerId), eq(agentRunners.userId, userId)));
    const [record] = await db
      .select()
      .from(agentRunners)
      .where(and(eq(agentRunners.id, runnerId), eq(agentRunners.userId, userId)))
      .limit(1);
    if (!record) throw new Error("NOT_FOUND");
    return toRunnerPublic(mapDbRunner(record));
  }

  return withDemoSnapshot(userId, (snapshot) => {
    const runner = findRunner(snapshot, userId, runnerId);
    runner.revokedAt ??= nowIso();
    runner.updatedAt = nowIso();
    return toRunnerPublic(runner);
  });
}

export async function listProjectAgentLinks(userId: string) {
  if (isDatabaseConfigured()) {
    await ensureAgentTables();
    const db = getDb();
    const rows = await db
      .select()
      .from(projectAgentLinks)
      .where(eq(projectAgentLinks.userId, userId));
    return rows.map(mapDbProjectAgentLink);
  }

  const snapshot = await readDemoSnapshot(userId);
  return snapshot.projectAgentLinks.filter((link) => link.userId === userId);
}

export async function upsertProjectAgentLink(
  userId: string,
  input: z.infer<typeof upsertProjectAgentLinkSchema>,
) {
  const workspace = await plannerRepository.getWorkspace(userId);
  if (!workspace.projects.some((project) => project.id === input.projectId)) {
    throw new Error("NOT_FOUND");
  }

  if (isDatabaseConfigured()) {
    await ensureAgentTables();
    const db = getDb();
    const [existing] = await db
      .select()
      .from(projectAgentLinks)
      .where(eq(projectAgentLinks.projectId, input.projectId))
      .limit(1);

    if (existing) {
      await db
        .update(projectAgentLinks)
        .set({
          repoUrl: input.repoUrl,
          defaultBranch: input.defaultBranch,
          updatedAt: nowDate(),
        })
        .where(eq(projectAgentLinks.id, existing.id));
      const [updated] = await db
        .select()
        .from(projectAgentLinks)
        .where(eq(projectAgentLinks.id, existing.id))
        .limit(1);
      return mapDbProjectAgentLink(updated);
    }

    const linkId = id("agent_link");
    await db.insert(projectAgentLinks).values({
      id: linkId,
      userId,
      projectId: input.projectId,
      repoUrl: input.repoUrl,
      defaultBranch: input.defaultBranch,
      createdAt: nowDate(),
      updatedAt: nowDate(),
    });
    const [record] = await db
      .select()
      .from(projectAgentLinks)
      .where(eq(projectAgentLinks.id, linkId))
      .limit(1);
    return mapDbProjectAgentLink(record);
  }

  return withDemoSnapshot(userId, (snapshot) => {
    const existing = snapshot.projectAgentLinks.find(
      (link) => link.projectId === input.projectId,
    );
    const timestamp = nowIso();
    if (existing) {
      existing.repoUrl = input.repoUrl;
      existing.defaultBranch = input.defaultBranch;
      existing.updatedAt = timestamp;
      return existing;
    }

    const link: ProjectAgentLinkRecord = {
      id: id("agent_link"),
      userId,
      projectId: input.projectId,
      repoUrl: input.repoUrl,
      defaultBranch: input.defaultBranch,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    snapshot.projectAgentLinks.push(link);
    return link;
  });
}

export async function listAgentRuns(
  userId: string,
  filters: { taskId?: string | null; projectId?: string | null } = {},
) {
  if (isDatabaseConfigured()) {
    await ensureAgentTables();
    const db = getDb();
    const clauses = [eq(agentRuns.userId, userId)];
    if (filters.taskId) clauses.push(eq(agentRuns.taskId, filters.taskId));
    if (filters.projectId) clauses.push(eq(agentRuns.projectId, filters.projectId));
    const runRows = await db
      .select()
      .from(agentRuns)
      .where(and(...clauses))
      .orderBy(desc(agentRuns.createdAt));
    const runs = runRows.map(mapDbRun);
    const runnerIds = Array.from(
      new Set(runs.map((run) => run.runnerId).filter((runnerId): runnerId is string => Boolean(runnerId))),
    );
    const runIds = runs.map((run) => run.id);
    const [runnerRows, eventRows] = await Promise.all([
      runnerIds.length
        ? db.select().from(agentRunners).where(inArray(agentRunners.id, runnerIds))
        : [],
      runIds.length
        ? db.select().from(agentRunEvents).where(inArray(agentRunEvents.runId, runIds))
        : [],
    ]);
    return decorateRuns(runs, runnerRows.map(mapDbRunner), eventRows.map(mapDbEvent));
  }

  const snapshot = await readDemoSnapshot(userId);
  const runs = snapshot.agentRuns
    .filter((run) => run.userId === userId)
    .filter((run) => (filters.taskId ? run.taskId === filters.taskId : true))
    .filter((run) => (filters.projectId ? run.projectId === filters.projectId : true))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return decorateRuns(runs, snapshot.agentRunners, snapshot.agentRunEvents);
}

export async function createAgentRun(
  userId: string,
  input: z.infer<typeof createAgentRunSchema>,
) {
  const workspace = await plannerRepository.getWorkspace(userId);
  const task = workspace.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task) throw new Error("NOT_FOUND");
  const runner = isDatabaseConfigured()
    ? null
    : workspace.agentRunners.find((candidate) => candidate.id === input.runnerId);
  if (!isDatabaseConfigured() && (!runner || runner.revokedAt)) {
    throw new Error("NOT_FOUND");
  }

  const runId = id("run");
  const timestamp = nowIso();
  const run: AgentRunRecord = {
    id: runId,
    userId,
    taskId: task.id,
    milestoneId: input.milestoneId ?? task.milestoneId,
    projectId: task.projectId,
    runnerId: input.runnerId,
    agentType: input.agentType,
    modelName: input.modelName ?? null,
    status: "queued",
    extraPrompt: input.extraPrompt ?? "",
    branchName: null,
    summary: null,
    changedFiles: [],
    verification: {},
    confidence: null,
    riskyAreas: [],
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (isDatabaseConfigured()) {
    await ensureAgentTables();
    const db = getDb();
    const [runnerRecord] = await db
      .select()
      .from(agentRunners)
      .where(and(eq(agentRunners.id, input.runnerId), eq(agentRunners.userId, userId)))
      .limit(1);
    if (!runnerRecord || runnerRecord.revokedAt) throw new Error("NOT_FOUND");
    await db.insert(agentRuns).values({
      id: run.id,
      userId,
      taskId: run.taskId,
      milestoneId: run.milestoneId,
      projectId: run.projectId,
      runnerId: run.runnerId,
      agentType: run.agentType,
      modelName: run.modelName,
      status: run.status,
      extraPrompt: run.extraPrompt,
      changedFiles: [],
      verification: {},
      riskyAreas: [],
      createdAt: nowDate(),
      updatedAt: nowDate(),
    });
  } else {
    await withDemoSnapshot(userId, (snapshot) => {
      snapshot.agentRuns.unshift(run);
    });
  }

  await createRunEvent(userId, runId, "created", "Agent run queued", {
    agentType: input.agentType,
    modelName: input.modelName ?? null,
  });
  return (await listAgentRuns(userId, { taskId: task.id })).find(
    (candidate) => candidate.id === runId,
  )!;
}

export async function cancelAgentRun(userId: string, runId: string) {
  if (isDatabaseConfigured()) {
    await ensureAgentTables();
    const db = getDb();
    await db
      .update(agentRuns)
      .set({ status: "cancelled", finishedAt: nowDate(), updatedAt: nowDate() })
      .where(and(eq(agentRuns.id, runId), eq(agentRuns.userId, userId)));
  } else {
    await withDemoSnapshot(userId, (snapshot) => {
      const run = findRun(snapshot, userId, runId);
      run.status = "cancelled";
      run.finishedAt = nowIso();
      run.updatedAt = nowIso();
    });
  }
  await createRunEvent(userId, runId, "cancelled", "Agent run cancelled");
  return (await listAgentRuns(userId)).find((run) => run.id === runId) ?? null;
}

export async function authenticateRunnerRequest(request: Request): Promise<RunnerAuthContext> {
  const token = bearerTokenFromRequest(request);
  if (!token) throw new Error("UNAUTHORIZED");
  const tokenHash = hashToken(token);

  if (isDatabaseConfigured()) {
    await ensureAgentTables();
    const db = getDb();
    const [record] = await db
      .select()
      .from(agentRunners)
      .where(eq(agentRunners.tokenHash, tokenHash))
      .limit(1);
    if (!record || record.revokedAt) throw new Error("UNAUTHORIZED");
    return { token, runner: mapDbRunner(record) };
  }

  const snapshot = await readDemoSnapshot("demo-user");
  const runner = snapshot.agentRunners.find(
    (candidate) => candidate.tokenHash === tokenHash && !candidate.revokedAt,
  );
  if (!runner) throw new Error("UNAUTHORIZED");
  return { token, runner };
}

export async function heartbeatRunner(
  auth: RunnerAuthContext,
  input: z.infer<typeof runnerHeartbeatSchema>,
) {
  const timestamp = nowIso();
  if (isDatabaseConfigured()) {
    await ensureAgentTables();
    const db = getDb();
    await db
      .update(agentRunners)
      .set({
        lastSeenAt: nowDate(),
        appVersion: input.appVersion,
        platform: input.platform,
        capabilities:
          input.capabilities === undefined ? undefined : normalizeCapabilities(input.capabilities),
        updatedAt: nowDate(),
      })
      .where(eq(agentRunners.id, auth.runner.id));
  } else {
    await withDemoSnapshot(auth.runner.userId, (snapshot) => {
      const runner = findRunner(snapshot, auth.runner.userId, auth.runner.id);
      runner.lastSeenAt = timestamp;
      runner.appVersion = input.appVersion ?? runner.appVersion;
      runner.platform = input.platform ?? runner.platform;
      runner.capabilities =
        input.capabilities === undefined
          ? runner.capabilities
          : normalizeCapabilities(input.capabilities);
      runner.updatedAt = timestamp;
    });
  }
  return { ok: true };
}

export async function listRunnerJobs(auth: RunnerAuthContext) {
  const [runs, workspace, projectLinks] = await Promise.all([
    listAgentRuns(auth.runner.userId),
    plannerRepository.getWorkspace(auth.runner.userId),
    listProjectAgentLinks(auth.runner.userId),
  ]);
  return runs.filter(
    (run) =>
      run.runnerId === auth.runner.id &&
      ["queued", "awaiting_local_confirmation", "running"].includes(run.status),
  ).map((run) => {
    const task = run.taskId
      ? workspace.tasks.find((candidate) => candidate.id === run.taskId) ?? null
      : null;
    const milestone = run.milestoneId
      ? workspace.milestones.find((candidate) => candidate.id === run.milestoneId) ?? null
      : null;
    const project = run.projectId
      ? workspace.projects.find((candidate) => candidate.id === run.projectId) ?? null
      : null;
    const projectAgentLink = run.projectId
      ? projectLinks.find((link) => link.projectId === run.projectId) ?? null
      : null;

    return {
      ...run,
      task,
      milestone,
      project,
      projectAgentLink,
    };
  });
}

async function updateRunStatus(
  auth: RunnerAuthContext,
  runId: string,
  status: AgentRunStatus,
  patch: Partial<AgentRunRecord> = {},
) {
  const existingRun = (await listAgentRuns(auth.runner.userId)).find(
    (candidate) => candidate.id === runId,
  );
  if (!existingRun || existingRun.runnerId !== auth.runner.id) {
    throw new Error("NOT_FOUND");
  }

  if (isDatabaseConfigured()) {
    await ensureAgentTables();
    const db = getDb();
    await db
      .update(agentRuns)
      .set({
        status,
        modelName: patch.modelName === undefined ? undefined : patch.modelName,
        branchName: patch.branchName === undefined ? undefined : patch.branchName,
        summary: patch.summary === undefined ? undefined : patch.summary,
        changedFiles: patch.changedFiles === undefined ? undefined : patch.changedFiles,
        verification: patch.verification === undefined ? undefined : patch.verification,
        confidence: patch.confidence === undefined ? undefined : patch.confidence,
        riskyAreas: patch.riskyAreas === undefined ? undefined : patch.riskyAreas,
        errorMessage: patch.errorMessage === undefined ? undefined : patch.errorMessage,
        startedAt:
          patch.startedAt === undefined
            ? undefined
            : patch.startedAt
              ? new Date(patch.startedAt)
              : null,
        finishedAt:
          patch.finishedAt === undefined
            ? undefined
            : patch.finishedAt
              ? new Date(patch.finishedAt)
              : null,
        updatedAt: nowDate(),
      })
      .where(
        and(
          eq(agentRuns.id, runId),
          eq(agentRuns.userId, auth.runner.userId),
          eq(agentRuns.runnerId, auth.runner.id),
        ),
      );
  } else {
    await withDemoSnapshot(auth.runner.userId, (snapshot) => {
      const run = findRun(snapshot, auth.runner.userId, runId);
      if (run.runnerId !== auth.runner.id) throw new Error("NOT_FOUND");
      Object.assign(run, patch, {
        status,
        updatedAt: nowIso(),
      });
    });
  }
  return (await listAgentRuns(auth.runner.userId)).find((run) => run.id === runId)!;
}

export async function claimRunnerJob(auth: RunnerAuthContext, runId: string) {
  const run = await updateRunStatus(auth, runId, "awaiting_local_confirmation");
  await createRunEvent(auth.runner.userId, runId, "claimed", "Runner claimed job", {
    runnerId: auth.runner.id,
  });
  await createRunEvent(
    auth.runner.userId,
    runId,
    "confirmation_requested",
    "Waiting for local confirmation",
  );
  return run;
}

export async function startRunnerJob(
  auth: RunnerAuthContext,
  runId: string,
  input: z.infer<typeof startAgentRunSchema>,
) {
  const startedAt = nowIso();
  const run = await updateRunStatus(auth, runId, "running", {
    branchName: input.branchName ?? null,
    modelName: input.modelName ?? undefined,
    startedAt,
  });
  if (run.taskId) {
    await plannerRepository.updateTask(auth.runner.userId, run.taskId, {
      status: "in_progress",
    });
  }
  await createRunEvent(auth.runner.userId, runId, "started", "Agent started locally", {
    branchName: input.branchName ?? null,
  });
  return run;
}

export async function appendRunnerJobEvents(
  auth: RunnerAuthContext,
  runId: string,
  input: z.infer<typeof appendAgentRunEventSchema>,
) {
  const runs = await listAgentRuns(auth.runner.userId);
  const run = runs.find((candidate) => candidate.id === runId);
  if (!run || run.runnerId !== auth.runner.id) throw new Error("NOT_FOUND");
  const events = [];
  for (const event of input.events) {
    events.push(
      await createRunEvent(
        auth.runner.userId,
        runId,
        event.type,
        event.message ?? "",
        event.data ?? {},
      ),
    );
  }
  return { events };
}

export async function finishRunnerJob(
  auth: RunnerAuthContext,
  runId: string,
  input: z.infer<typeof finishAgentRunSchema>,
) {
  const finishedAt = nowIso();
  const run = await updateRunStatus(auth, runId, "succeeded", {
    summary: input.summary,
    changedFiles: input.changedFiles,
    verification: input.verification ?? {},
    confidence: input.confidence ?? null,
    riskyAreas: input.riskyAreas,
    branchName: input.branchName ?? undefined,
    finishedAt,
  });
  if (run.taskId) {
    await plannerRepository.updateTask(auth.runner.userId, run.taskId, {
      status: "review",
    });
  }
  await createRunEvent(auth.runner.userId, runId, "finished", "Agent finished work", {
    branchName: input.branchName ?? run.branchName,
    changedFiles: input.changedFiles,
    confidence: input.confidence ?? null,
  });
  return run;
}

export async function failRunnerJob(
  auth: RunnerAuthContext,
  runId: string,
  input: z.infer<typeof failAgentRunSchema>,
) {
  const run = await updateRunStatus(auth, runId, "failed", {
    errorMessage: input.errorMessage,
    finishedAt: nowIso(),
  });
  await createRunEvent(auth.runner.userId, runId, "failed", input.errorMessage);
  return run;
}

export async function cancelRunnerJob(auth: RunnerAuthContext, runId: string) {
  const run = await updateRunStatus(auth, runId, "cancelled", {
    finishedAt: nowIso(),
  });
  await createRunEvent(auth.runner.userId, runId, "cancelled", "Runner cancelled job");
  return run;
}
