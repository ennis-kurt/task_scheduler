import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import type { RunnerJob, RunnerSettings } from "@inflara/agent-protocol";

import { InflaraClient, type RunnerCapabilitiesPayload } from "../runner/inflara-client";
import { executeJob, type JobRunnerLog } from "../runner/job-runner";

const execFileAsync = promisify(execFile);
const devServerUrl = "http://127.0.0.1:5178";
const activeRuns = new Set<string>();
let mainWindow: BrowserWindow | null = null;
let ipcRegistered = false;

type InstalledAgent = {
  type: "codex" | "claude_code";
  label: string;
  command: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  error?: string;
};

function defaultSettings(): RunnerSettings {
  return {
    baseUrl: "http://localhost:3000",
    token: "",
    projectPaths: {},
  };
}

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

async function readSettings(): Promise<RunnerSettings> {
  try {
    const raw = await readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<RunnerSettings>;
    return {
      ...defaultSettings(),
      ...parsed,
      projectPaths: {
        ...defaultSettings().projectPaths,
        ...(parsed.projectPaths ?? {}),
      },
    };
  } catch {
    return defaultSettings();
  }
}

async function saveSettings(settings: RunnerSettings) {
  const next = {
    ...defaultSettings(),
    ...settings,
    baseUrl: settings.baseUrl.trim().replace(/\/+$/, "") || "http://localhost:3000",
    token: settings.token.trim(),
    projectPaths: settings.projectPaths ?? {},
  };
  await mkdir(path.dirname(settingsPath()), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(next, null, 2));
  return next;
}

function requireRunnerSettings(settings: RunnerSettings) {
  if (!settings.baseUrl.trim()) {
    throw new Error("Set the Inflara base URL first.");
  }
  if (!settings.token.trim()) {
    throw new Error("Paste a runner token first.");
  }
}

function clientForSettings(settings: RunnerSettings) {
  requireRunnerSettings(settings);
  return new InflaraClient(settings.baseUrl, settings.token);
}

async function detectAgent(
  type: "codex" | "claude_code",
  label: string,
  command: string,
) {
  try {
    const resolved = await execFileAsync("zsh", ["-lc", `command -v ${command}`], {
      maxBuffer: 1024 * 1024,
    });
    const commandPath = resolved.stdout.trim() || null;
    const version = await execFileAsync(command, ["--version"], {
      maxBuffer: 1024 * 1024,
    }).catch(() => ({ stdout: "" }));

    return {
      type,
      label,
      command,
      installed: Boolean(commandPath),
      path: commandPath,
      version: version.stdout.trim() || null,
    } satisfies InstalledAgent;
  } catch (error) {
    return {
      type,
      label,
      command,
      installed: false,
      path: null,
      version: null,
      error: error instanceof Error ? error.message : String(error),
    } satisfies InstalledAgent;
  }
}

async function detectAgents() {
  return Promise.all([
    detectAgent("codex", "Codex CLI", "codex"),
    detectAgent("claude_code", "Claude Code", "claude"),
  ]);
}

function capabilitiesFromAgents(agents: InstalledAgent[]): RunnerCapabilitiesPayload {
  return {
    supportsWorktrees: true,
    agents: agents.map((agent) => ({
      type: agent.type,
      available: agent.installed,
      version: agent.version,
      path: agent.path,
    })),
  };
}

async function heartbeat(settings: RunnerSettings) {
  const agents = await detectAgents();
  await clientForSettings(settings).heartbeat(capabilitiesFromAgents(agents));
  return agents;
}

function emitLog(runId: string, log: JobRunnerLog) {
  mainWindow?.webContents.send("runner:log", {
    runId,
    createdAt: new Date().toISOString(),
    ...log,
  });
}

function registerIpc() {
  if (ipcRegistered) {
    return;
  }
  ipcRegistered = true;

  ipcMain.handle("settings:get", () => readSettings());
  ipcMain.handle("settings:save", async (_event, settings: RunnerSettings) =>
    saveSettings(settings),
  );
  ipcMain.handle("agents:detect", () => detectAgents());
  ipcMain.handle("runner:heartbeat", async () => {
    const settings = await readSettings();
    return heartbeat(settings);
  });
  ipcMain.handle("runner:listJobs", async () => {
    const settings = await readSettings();
    await heartbeat(settings);
    return clientForSettings(settings).listJobs();
  });
  ipcMain.handle("runner:selectProjectPath", async () => {
    const options: OpenDialogOptions = {
      properties: ["openDirectory"],
      title: "Select local git repository",
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle(
    "runner:saveProjectPath",
    async (_event, input: { projectId: string; projectPath: string }) => {
      const settings = await readSettings();
      const projectPaths = {
        ...settings.projectPaths,
        [input.projectId]: input.projectPath,
      };
      return saveSettings({ ...settings, projectPaths });
    },
  );
  ipcMain.handle("runner:cancelJob", async (_event, runId: string) => {
    const settings = await readSettings();
    return clientForSettings(settings).cancelJob(runId);
  });
  ipcMain.handle(
    "runner:runJob",
    async (_event, input: { job: RunnerJob; projectPath: string }) => {
      if (activeRuns.has(input.job.id)) {
        throw new Error("This run is already active.");
      }

      const settings = await readSettings();
      const client = clientForSettings(settings);
      activeRuns.add(input.job.id);
      try {
        return await executeJob({
          client,
          job: input.job,
          projectPath: input.projectPath,
          onLog: (log) => emitLog(input.job.id, log),
        });
      } finally {
        activeRuns.delete(input.job.id);
      }
    },
  );
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: "Inflara Agent Runner",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  registerIpc();

  if (app.isPackaged) {
    await window.loadFile(path.join(__dirname, "../renderer/index.html"));
  } else {
    await window.loadURL(devServerUrl);
  }
}

app.whenReady().then(() => {
  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
