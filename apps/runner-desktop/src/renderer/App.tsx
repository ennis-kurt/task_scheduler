import { useEffect, useMemo, useState } from "react";
import type { AgentType, RunnerJob, RunnerSettings } from "@inflara/agent-protocol";

type InstalledAgent = Awaited<ReturnType<typeof window.inflaraRunner.detectAgents>>[number];
type RunnerLog = Parameters<Parameters<typeof window.inflaraRunner.onLog>[0]>[0];

const emptySettings: RunnerSettings = {
  baseUrl: "http://localhost:3000",
  token: "",
  projectPaths: {},
};

const agentLabels: Record<AgentType, string> = {
  codex: "Codex",
  claude_code: "Claude Code",
};

function statusLabel(value: string) {
  return value.replace(/_/g, " ");
}

function jobTitle(job: RunnerJob) {
  return job.task?.title ?? job.milestone?.name ?? job.id;
}

export default function App() {
  const [settings, setSettings] = useState<RunnerSettings>(emptySettings);
  const [agents, setAgents] = useState<InstalledAgent[]>([]);
  const [jobs, setJobs] = useState<RunnerJob[]>([]);
  const [logs, setLogs] = useState<RunnerLog[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [busyRunIds, setBusyRunIds] = useState<string[]>([]);
  const [status, setStatus] = useState("Disconnected");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.inflaraRunner.getSettings().then(setSettings);
    void refreshAgents();
    const unsubscribe = window.inflaraRunner.onLog((log) => {
      setLogs((current) => [log, ...current].slice(0, 300));
      setSelectedRunId(log.runId);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!settings.token || !settings.baseUrl) {
      return undefined;
    }

    void pollJobs();
    const interval = window.setInterval(() => {
      void pollJobs();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [settings.baseUrl, settings.token]);

  const selectedLogs = useMemo(
    () => logs.filter((log) => !selectedRunId || log.runId === selectedRunId),
    [logs, selectedRunId],
  );

  async function refreshAgents() {
    const detected = await window.inflaraRunner.detectAgents();
    setAgents(detected);
    return detected;
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const next = await window.inflaraRunner.saveSettings(settings);
      setSettings(next);
      setStatus("Settings saved");
      await heartbeat();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function heartbeat() {
    setError(null);
    try {
      const detected = await window.inflaraRunner.heartbeat();
      setAgents(detected);
      setStatus("Connected");
    } catch (heartbeatError) {
      setStatus("Disconnected");
      setError(heartbeatError instanceof Error ? heartbeatError.message : String(heartbeatError));
    }
  }

  async function pollJobs() {
    setError(null);
    try {
      const nextJobs = await window.inflaraRunner.listJobs();
      setJobs(nextJobs);
      setStatus("Connected");
    } catch (pollError) {
      setStatus("Disconnected");
      setError(pollError instanceof Error ? pollError.message : String(pollError));
    }
  }

  async function choosePath(projectId: string) {
    const projectPath = await window.inflaraRunner.selectProjectPath();
    if (!projectPath) return;

    const next = await window.inflaraRunner.saveProjectPath(projectId, projectPath);
    setSettings(next);
  }

  async function runJob(job: RunnerJob) {
    if (!job.projectId) {
      setError("This job is not attached to a project.");
      return;
    }

    const projectPath = settings.projectPaths[job.projectId];
    if (!projectPath) {
      setError("Select a local repository path before running this job.");
      return;
    }

    setError(null);
    setBusyRunIds((current) => [...current, job.id]);
    setSelectedRunId(job.id);
    try {
      await window.inflaraRunner.runJob(job, projectPath);
      await pollJobs();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setBusyRunIds((current) => current.filter((runId) => runId !== job.id));
    }
  }

  async function cancelJob(job: RunnerJob) {
    setError(null);
    try {
      await window.inflaraRunner.cancelJob(job.id);
      await pollJobs();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
    }
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Inflara</p>
          <h1>Agent Runner</h1>
        </div>
        <div className={`connection ${status === "Connected" ? "is-connected" : ""}`}>
          <span />
          {status}
        </div>
      </section>

      <div className="layout">
        <aside className="panel sidebar">
          <h2>Connection</h2>
          <label>
            Inflara URL
            <input
              value={settings.baseUrl}
              onChange={(event) =>
                setSettings((current) => ({ ...current, baseUrl: event.target.value }))
              }
              placeholder="http://localhost:3000"
            />
          </label>
          <label>
            Runner token
            <input
              value={settings.token}
              type="password"
              onChange={(event) =>
                setSettings((current) => ({ ...current, token: event.target.value }))
              }
              placeholder="ifr_..."
            />
          </label>
          <div className="button-row">
            <button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving" : "Save"}
            </button>
            <button type="button" className="secondary" onClick={heartbeat}>
              Ping
            </button>
          </div>

          <div className="divider" />
          <div className="section-heading">
            <h2>Agents</h2>
            <button type="button" className="secondary small" onClick={refreshAgents}>
              Detect
            </button>
          </div>
          <div className="agent-list">
            {agents.map((agent) => (
              <div key={agent.type} className="agent-row">
                <div>
                  <strong>{agent.label}</strong>
                  <span>{agent.path ?? agent.command}</span>
                </div>
                <span className={`pill ${agent.installed ? "success" : "muted"}`}>
                  {agent.installed ? "Installed" : "Missing"}
                </span>
              </div>
            ))}
          </div>
        </aside>

        <section className="panel jobs-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Queue</p>
              <h2>Assigned Jobs</h2>
            </div>
            <button type="button" className="secondary" onClick={pollJobs}>
              Refresh
            </button>
          </div>

          {error ? <div className="error-banner">{error}</div> : null}

          <div className="job-list">
            {jobs.length ? (
              jobs.map((job) => {
                const projectPath = job.projectId ? settings.projectPaths[job.projectId] : "";
                const busy = busyRunIds.includes(job.id);
                return (
                  <article key={job.id} className="job-card">
                    <div className="job-main">
                      <div>
                        <div className="job-meta">
                          <span>{agentLabels[job.agentType]}</span>
                          <span>{statusLabel(job.status)}</span>
                          {job.modelName ? <span>{job.modelName}</span> : null}
                        </div>
                        <h3>{jobTitle(job)}</h3>
                        <p>{job.project?.name ?? "No project"} · {job.id}</p>
                      </div>
                      <div className="job-actions">
                        <button type="button" onClick={() => void runJob(job)} disabled={busy}>
                          {busy ? "Running" : "Confirm & Run"}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void cancelJob(job)}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    <div className="repo-row">
                      <label>
                        Local repository
                        <input value={projectPath ?? ""} readOnly placeholder="No path selected" />
                      </label>
                      {job.projectId ? (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void choosePath(job.projectId!)}
                        >
                          Choose
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty-state">No queued runner jobs.</div>
            )}
          </div>
        </section>

        <section className="panel log-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Timeline</p>
              <h2>Local Logs</h2>
            </div>
            {selectedRunId ? <span className="pill muted">{selectedRunId}</span> : null}
          </div>
          <div className="log-list">
            {selectedLogs.length ? (
              selectedLogs.map((log, index) => (
                <div key={`${log.createdAt}-${index}`} className={`log-row ${log.level}`}>
                  <time>{new Date(log.createdAt).toLocaleTimeString()}</time>
                  <p>{log.message}</p>
                </div>
              ))
            ) : (
              <div className="empty-state">Logs will appear after a job starts.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
