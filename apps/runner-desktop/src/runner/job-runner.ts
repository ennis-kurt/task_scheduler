import type { RunnerFinalResult, RunnerJob } from "@inflara/agent-protocol";

import { runAgentAdapter } from "./adapters";
import { InflaraClient } from "./inflara-client";
import { collectChangedFiles, collectVerification, prepareWorktree } from "./git";

export type JobRunnerLog = {
  level: "info" | "error";
  message: string;
  data?: unknown;
};

export type ExecuteJobInput = {
  client: InflaraClient;
  job: RunnerJob;
  projectPath: string;
  onLog: (log: JobRunnerLog) => void;
};

function buildPrompt(job: RunnerJob) {
  const task = job.task;
  const milestone = job.milestone;
  const project = job.project;
  const projectLink = job.projectAgentLink;

  return [
    "You are running from the Inflara local agent runner.",
    "Work inside the current git worktree only. Preserve unrelated user changes. Do not mark the task done; Inflara will route successful output to review.",
    "",
    "Inflara context:",
    `Project: ${project?.name ?? "Unassigned"}`,
    `Repository: ${projectLink?.repoUrl || "Not recorded in Inflara"}`,
    `Default branch: ${projectLink?.defaultBranch || "main"}`,
    milestone
      ? `Milestone: ${milestone.name}\nMilestone details: ${milestone.description || "None"}`
      : "Milestone: None",
    task
      ? [
          `Task: ${task.title}`,
          `Task notes: ${task.notes || "None"}`,
          `Priority: ${task.priority}`,
          `Current status: ${task.status}`,
          `Estimate: ${task.estimatedMinutes} minutes`,
        ].join("\n")
      : "Task: None",
    "",
    job.extraPrompt ? `Additional human instructions:\n${job.extraPrompt}` : "",
    "",
    "Before finishing, run the most relevant verification that is safe for this repository and mention what you ran. If you cannot run verification, explain why.",
    "Final response should include a concise summary, changed files, verification, confidence from 1-100 when possible, and risky areas.",
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeOutput(output: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-40).join("\n").slice(0, 8000) || "Agent finished without text output.";
}

export async function executeJob(input: ExecuteJobInput): Promise<RunnerFinalResult> {
  const { client, job, onLog, projectPath } = input;
  let branchName = job.branchName ?? "";

  try {
    onLog({ level: "info", message: `Claiming ${job.id}` });
    await client.claimJob(job.id);

    onLog({ level: "info", message: "Creating isolated git worktree" });
    const worktree = await prepareWorktree(projectPath, job);
    branchName = worktree.branchName;
    await client.appendEvents(job.id, [
      {
        type: "status",
        message: "Created local git worktree",
        data: {
          branchName,
          repoRoot: worktree.repoRoot,
        },
      },
    ]);

    await client.startJob(job.id, {
      branchName,
      modelName: job.modelName,
    });
    onLog({ level: "info", message: `Running ${job.agentType} on ${branchName}` });

    const prompt = buildPrompt(job);
    const adapterResult = await runAgentAdapter({
      agentType: job.agentType,
      modelName: job.modelName,
      prompt,
      worktreePath: worktree.worktreePath,
      onEvent: async (event) => {
        onLog({
          level: event.stream === "stderr" ? "error" : "info",
          message: event.message,
          data: event.data,
        });
        await client.appendEvents(job.id, [
          {
            type: "log",
            message: event.message,
            data: {
              stream: event.stream,
              payload: event.data,
            },
          },
        ]);
      },
    });

    const changedFiles = await collectChangedFiles(worktree.worktreePath);
    const verification = await collectVerification(worktree.worktreePath);
    const summary = summarizeOutput(adapterResult.output);

    if (adapterResult.exitCode !== 0) {
      throw new Error(`${job.agentType} exited with code ${adapterResult.exitCode}\n${summary}`);
    }

    const result: RunnerFinalResult = {
      summary,
      changedFiles,
      verification,
      confidence: null,
      riskyAreas: [],
      branchName,
    };
    await client.finishJob(job.id, result);
    onLog({ level: "info", message: `Finished ${job.id}` });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onLog({ level: "error", message });
    await client.failJob(job.id, message).catch(() => undefined);
    throw error;
  }
}
