import type {
  AgentRunEventType,
  RunnerFinalResult,
  RunnerJob,
} from "@inflara/agent-protocol";

export type RunnerEventInput = {
  type: AgentRunEventType;
  message?: string;
  data?: unknown;
};

export type RunnerCapabilitiesPayload = {
  supportsWorktrees: true;
  agents: Array<{
    type: "codex" | "claude_code";
    available: boolean;
    version?: string | null;
    path?: string | null;
  }>;
};

export class InflaraClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  async heartbeat(capabilities: RunnerCapabilitiesPayload) {
    return this.request<{ ok: true }>("/api/runner/heartbeat", {
      method: "POST",
      body: {
        appVersion: "0.1.0",
        platform: process.platform === "darwin" ? "macos" : process.platform,
        capabilities,
      },
    });
  }

  async listJobs() {
    const response = await this.request<{ jobs: RunnerJob[] }>("/api/runner/jobs");
    return response.jobs;
  }

  async claimJob(runId: string) {
    return this.request<{ run: unknown }>(`/api/runner/jobs/${runId}/claim`, {
      method: "POST",
      body: {},
    });
  }

  async startJob(runId: string, input: { branchName: string; modelName: string | null }) {
    return this.request<{ run: unknown }>(`/api/runner/jobs/${runId}/start`, {
      method: "POST",
      body: input,
    });
  }

  async appendEvents(runId: string, events: RunnerEventInput[]) {
    if (!events.length) {
      return { events: [] };
    }

    return this.request<{ events: unknown[] }>(`/api/runner/jobs/${runId}/events`, {
      method: "POST",
      body: { events },
    });
  }

  async finishJob(runId: string, result: RunnerFinalResult) {
    return this.request<{ run: unknown }>(`/api/runner/jobs/${runId}/finish`, {
      method: "POST",
      body: result,
    });
  }

  async failJob(runId: string, errorMessage: string) {
    return this.request<{ run: unknown }>(`/api/runner/jobs/${runId}/fail`, {
      method: "POST",
      body: { errorMessage },
    });
  }

  async cancelJob(runId: string) {
    return this.request<{ run: unknown }>(`/api/runner/jobs/${runId}/cancel`, {
      method: "POST",
      body: {},
    });
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : `Inflara request failed with ${response.status}`;
      throw new Error(message);
    }

    return payload as T;
  }
}
