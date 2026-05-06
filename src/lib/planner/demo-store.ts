import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";
import { createSeedSnapshot } from "@/lib/planner/seed";
import type { WorkspaceSnapshot } from "@/lib/planner/types";

const volatileSnapshots = new Map<string, WorkspaceSnapshot>();

function storePath() {
  return path.join(
    process.cwd(),
    "data",
    path.basename(env.demoStorePath),
  );
}

function normalizeSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return {
    ...snapshot,
    projects: snapshot.projects.map((project) => ({
      ...project,
      status: project.status ?? "active",
    })),
    milestones: Array.isArray(snapshot.milestones) ? snapshot.milestones : [],
    apiAccessTokens: Array.isArray(snapshot.apiAccessTokens)
      ? snapshot.apiAccessTokens.map((token) => ({
          ...token,
          scopeType: token.scopeType ?? "all_projects",
          projectIds: Array.isArray(token.projectIds) ? token.projectIds : [],
        }))
      : [],
    agentRunners: Array.isArray(snapshot.agentRunners) ? snapshot.agentRunners : [],
    projectAgentLinks: Array.isArray(snapshot.projectAgentLinks)
      ? snapshot.projectAgentLinks
      : [],
    agentRuns: Array.isArray(snapshot.agentRuns) ? snapshot.agentRuns : [],
    agentRunEvents: Array.isArray(snapshot.agentRunEvents) ? snapshot.agentRunEvents : [],
    taskDependencies: Array.isArray(snapshot.taskDependencies)
      ? snapshot.taskDependencies
      : [],
    tasks: snapshot.tasks.map((task) => ({
      ...task,
      milestoneId: task.milestoneId ?? null,
      availability: task.availability ?? "ready",
    })),
  };
}

function cloneSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return JSON.parse(JSON.stringify(normalizeSnapshot(snapshot))) as WorkspaceSnapshot;
}

function shouldUseVolatileStore(error?: unknown) {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;

  return (
    process.env.VERCEL === "1" ||
    code === "EROFS" ||
    code === "EACCES" ||
    code === "EPERM"
  );
}

export async function readDemoSnapshot(userId = "demo-user") {
  const target = storePath();

  try {
    const raw = await readFile(target, "utf8");
    const parsedRaw = JSON.parse(raw) as WorkspaceSnapshot & {
      milestones?: WorkspaceSnapshot["milestones"];
    };
    const parsed = normalizeSnapshot(parsedRaw as WorkspaceSnapshot);

    if (parsed.user.id === userId) {
      if (Array.isArray(parsedRaw.milestones)) {
        return parsed;
      }

      const seeded = createSeedSnapshot(userId);
      await writeDemoSnapshot(seeded);
      return cloneSnapshot(seeded);
    }
  } catch (error) {
    if (shouldUseVolatileStore(error)) {
      const volatile = volatileSnapshots.get(userId);

      if (volatile) {
        return cloneSnapshot(volatile);
      }
    }
    // Seed below.
  }

  const seeded = createSeedSnapshot(userId);
  await writeDemoSnapshot(seeded);
  return cloneSnapshot(seeded);
}

export async function writeDemoSnapshot(snapshot: WorkspaceSnapshot) {
  const normalized = cloneSnapshot(snapshot);
  volatileSnapshots.set(normalized.user.id, normalized);
  const target = storePath();

  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(normalized, null, 2));
  } catch (error) {
    if (shouldUseVolatileStore(error)) {
      return;
    }

    throw error;
  }
}
