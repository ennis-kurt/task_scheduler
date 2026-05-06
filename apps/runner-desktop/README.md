# Inflara Agent Runner MVP

The runner is a macOS-first Electron app that connects a local machine to Inflara with a runner token created in Inflara Settings.

## Local Development

```bash
pnpm install
pnpm runner:dev
```

If pnpm reports that Electron build scripts were ignored, approve the Electron build once or run:

```bash
pnpm rebuild electron
```

In the app:

1. Set the Inflara base URL, for example `http://localhost:3000`.
2. Paste the runner token created from `Settings -> Remote agent access -> Local agent runners`.
3. Save settings.
4. Map each project to a local git repository path.
5. Confirm each queued job before the runner launches Codex or Claude Code.

Local repository paths are stored only in Electron user data. They are never sent to Inflara.
