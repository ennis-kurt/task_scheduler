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

export async function readDemoSnapshot(userId = "demo-user") {
  const target = storePath();

  try {
    const raw = await readFile(target, "utf8");
    const parsed = JSON.parse(raw) as WorkspaceSnapshot;

    if (parsed.user.id === userId) {
      return parsed;
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
  await writeFile(target, JSON.stringify(snapshot, null, 2));
}
