export type AgentType = "codex" | "claude_code";

export type AgentRunStatus =
  | "queued"
  | "awaiting_local_confirmation"
  | "running"
  | "blocked"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AgentRunEventType =
  | "created"
  | "claimed"
  | "confirmation_requested"
  | "started"
  | "log"
  | "status"
  | "finished"
  | "failed"
  | "cancelled"
  | "heartbeat";

export type RunnerSettings = {
  baseUrl: string;
  token: string;
  projectPaths: Record<string, string>;
};

export type RunnerJob = {
  id: string;
  taskId: string | null;
  milestoneId: string | null;
  projectId: string | null;
  agentType: AgentType;
  modelName: string | null;
  status: AgentRunStatus;
  extraPrompt: string;
  branchName: string | null;
  task: {
    id: string;
    title: string;
    notes: string;
    priority: string;
    estimatedMinutes: number;
    status: string;
  } | null;
  milestone: {
    id: string;
    name: string;
    description: string;
  } | null;
  project: {
    id: string;
    name: string;
  } | null;
  projectAgentLink: {
    repoUrl: string;
    defaultBranch: string;
  } | null;
};

export type RunnerCommandEvent = {
  type: "log" | "status";
  message: string;
  data?: unknown;
};

export type RunnerFinalResult = {
  summary: string;
  changedFiles: string[];
  verification: unknown;
  confidence?: number | null;
  riskyAreas?: string[];
  branchName: string;
};
