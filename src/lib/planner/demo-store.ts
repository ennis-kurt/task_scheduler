import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";
import { createSeedSnapshot } from "@/lib/planner/seed";
import type { WorkspaceSnapshot } from "@/lib/planner/types";

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
    tasks: snapshot.tasks.map((task) => ({
      ...task,
      milestoneId: task.milestoneId ?? null,
    })),
  };
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
      return seeded;
    }
  } catch {
    // Seed below.
  }

  const seeded = createSeedSnapshot(userId);
  await writeDemoSnapshot(seeded);
  return seeded;
}

export async function writeDemoSnapshot(snapshot: WorkspaceSnapshot) {
  const target = storePath();

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(normalizeSnapshot(snapshot), null, 2));
}
