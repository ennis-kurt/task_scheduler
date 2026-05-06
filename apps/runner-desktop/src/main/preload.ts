import { contextBridge, ipcRenderer } from "electron";
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

contextBridge.exposeInMainWorld("inflaraRunner", {
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<RunnerSettings>,
  saveSettings: (settings: RunnerSettings) =>
    ipcRenderer.invoke("settings:save", settings) as Promise<RunnerSettings>,
  detectAgents: () => ipcRenderer.invoke("agents:detect") as Promise<InstalledAgent[]>,
  heartbeat: () => ipcRenderer.invoke("runner:heartbeat") as Promise<InstalledAgent[]>,
  listJobs: () => ipcRenderer.invoke("runner:listJobs") as Promise<RunnerJob[]>,
  selectProjectPath: () => ipcRenderer.invoke("runner:selectProjectPath") as Promise<string | null>,
  saveProjectPath: (projectId: string, projectPath: string) =>
    ipcRenderer.invoke("runner:saveProjectPath", {
      projectId,
      projectPath,
    }) as Promise<RunnerSettings>,
  cancelJob: (runId: string) => ipcRenderer.invoke("runner:cancelJob", runId) as Promise<unknown>,
  runJob: (job: RunnerJob, projectPath: string) =>
    ipcRenderer.invoke("runner:runJob", { job, projectPath }) as Promise<RunnerFinalResult>,
  onLog: (callback: (log: RunnerLog) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, log: RunnerLog) => callback(log);
    ipcRenderer.on("runner:log", listener);
    return () => ipcRenderer.off("runner:log", listener);
  },
});
