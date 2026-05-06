import { spawn } from "node:child_process";

import type { AgentType } from "@inflara/agent-protocol";

export type AdapterLogEvent = {
  stream: "stdout" | "stderr";
  message: string;
  data?: unknown;
};

export type RunAdapterInput = {
  agentType: AgentType;
  modelName: string | null;
  prompt: string;
  worktreePath: string;
  onEvent: (event: AdapterLogEvent) => Promise<void> | void;
};

export type RunAdapterResult = {
  exitCode: number;
  output: string;
};

function commandForAgent(agentType: AgentType) {
  return agentType === "codex" ? "codex" : "claude";
}

function argsForAgent(input: RunAdapterInput) {
  if (input.agentType === "codex") {
    const args = [
      "exec",
      "--json",
      "--cd",
      input.worktreePath,
      "--sandbox",
      "workspace-write",
      "--ask-for-approval",
      "never",
    ];
    if (input.modelName) {
      args.push("-m", input.modelName);
    }
    args.push("-");
    return args;
  }

  const args = [
    "-p",
    input.prompt,
    "--output-format",
    "stream-json",
    "--cwd",
    input.worktreePath,
  ];
  if (input.modelName) {
    args.push("--model", input.modelName);
  }
  return args;
}

function parseLine(line: string) {
  try {
    const data = JSON.parse(line) as Record<string, unknown>;
    const message =
      stringValue(data.message) ??
      stringValue(data.text) ??
      stringValue(data.summary) ??
      stringValue(data.delta) ??
      stringValue(data.type) ??
      line;
    return { message, data };
  } catch {
    return { message: line };
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function runAgentAdapter(input: RunAdapterInput): Promise<RunAdapterResult> {
  const command = commandForAgent(input.agentType);
  const args = argsForAgent(input);
  const child = spawn(command, args, {
    cwd: input.worktreePath,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const output: string[] = [];

  if (input.agentType === "codex") {
    child.stdin.write(input.prompt);
  }
  child.stdin.end();

  const handleChunk = async (stream: "stdout" | "stderr", chunk: Buffer) => {
    const text = chunk.toString("utf8");
    output.push(text);
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const parsed = parseLine(line);
      await input.onEvent({
        stream,
        message: parsed.message.slice(0, 4000),
        data: parsed.data,
      });
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    void handleChunk("stdout", chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    void handleChunk("stderr", chunk);
  });

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        output: output.join("").trim(),
      });
    });
  });
}
