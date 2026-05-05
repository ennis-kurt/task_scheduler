/// <reference types="vite/client" />

import type { RunnerFinalResult, RunnerJob, RunnerSettings } from "@inflara/agent-protocol";

type InstalledAgent = {
  type: "codex" | "claude_code";
  label: string;
  command: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  error?: string;
};

type RunnerLog = {
  runId: string;
  level: "info" | "error";
  message: string;
  data?: unknown;
  createdAt: string;
};

declare global {
  interface Window {
    inflaraRunner: {
      getSettings: () => Promise<RunnerSettings>;
      saveSettings: (settings: RunnerSettings) => Promise<RunnerSettings>;
      detectAgents: () => Promise<InstalledAgent[]>;
      heartbeat: () => Promise<InstalledAgent[]>;
      listJobs: () => Promise<RunnerJob[]>;
      selectProjectPath: () => Promise<string | null>;
      saveProjectPath: (projectId: string, projectPath: string) => Promise<RunnerSettings>;
      cancelJob: (runId: string) => Promise<unknown>;
      runJob: (job: RunnerJob, projectPath: string) => Promise<RunnerFinalResult>;
      onLog: (callback: (log: RunnerLog) => void) => () => void;
    };
  }
}
