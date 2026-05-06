import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { RunnerJob } from "@inflara/agent-protocol";

const execFileAsync = promisify(execFile);

export type PreparedWorktree = {
  repoRoot: string;
  worktreePath: string;
  branchName: string;
};

async function git(args: string[], cwd: string) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024 * 20,
  });
  return stdout.trim();
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function branchNameForJob(job: RunnerJob) {
  const title = job.task?.title ?? job.milestone?.name ?? "agent-run";
  return `inflara/${slug(title) || "agent-run"}-${job.id.replace(/^run_/, "").slice(0, 10)}`;
}

export async function prepareWorktree(repoPath: string, job: RunnerJob) {
  const repoRoot = await git(["rev-parse", "--show-toplevel"], repoPath);
  const branchName = job.branchName ?? branchNameForJob(job);
  const parent = path.join(os.homedir(), ".inflara", "agent-worktrees");
  const worktreePath = path.join(parent, job.id);

  await mkdir(parent, { recursive: true });
  await rm(worktreePath, { recursive: true, force: true });
  await git(["worktree", "add", "-b", branchName, worktreePath, "HEAD"], repoRoot);

  return {
    repoRoot,
    worktreePath,
    branchName,
  } satisfies PreparedWorktree;
}

export async function collectChangedFiles(worktreePath: string) {
  const status = await git(["status", "--short"], worktreePath);
  return status
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

export async function collectVerification(worktreePath: string) {
  const [status, diffStat] = await Promise.all([
    git(["status", "--short"], worktreePath),
    git(["diff", "--stat"], worktreePath).catch((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    ),
  ]);

  return {
    gitStatus: status,
    diffStat,
  };
}
