export type GitHubIssueTask = {
  title: string;
  notes?: string | null;
  priority?: string | null;
  estimatedMinutes?: number | null;
  dueAt?: string | null;
};

export type CreatedGitHubIssue = {
  number: number;
  title: string;
  url: string;
};

export class GitHubIssueError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 500,
  ) {
    super(message);
  }
}

export function parseGitHubRepoUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const shorthand = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);

  if (shorthand) {
    return {
      owner: shorthand[1],
      repo: shorthand[2].replace(/\.git$/, ""),
      url: `https://github.com/${shorthand[1]}/${shorthand[2].replace(/\.git$/, "")}`,
    };
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const parts = url.pathname.split("/").filter(Boolean);

    if (!url.hostname.endsWith("github.com") || parts.length < 2) {
      return null;
    }

    return {
      owner: parts[0],
      repo: parts[1].replace(/\.git$/, ""),
      url: `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/, "")}`,
    };
  } catch {
    return null;
  }
}

export function buildGitHubIssueBody(task: GitHubIssueTask) {
  return [
    task.notes?.trim() || "Created from an Inflara task.",
    "",
    "### Inflara task details",
    task.priority ? `- Priority: ${task.priority}` : null,
    task.estimatedMinutes ? `- Estimate: ${task.estimatedMinutes} minutes` : null,
    task.dueAt ? `- Due: ${new Date(task.dueAt).toISOString()}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function createGitHubIssue(repoUrl: string, task: GitHubIssueTask) {
  const token = process.env.GITHUB_ISSUES_TOKEN ?? process.env.GITHUB_TOKEN;

  if (!token) {
    throw new GitHubIssueError(
      "GITHUB_NOT_CONFIGURED",
      "Set GITHUB_ISSUES_TOKEN or GITHUB_TOKEN to create GitHub issues.",
      501,
    );
  }

  const repo = parseGitHubRepoUrl(repoUrl);

  if (!repo) {
    throw new GitHubIssueError(
      "INVALID_GITHUB_REPOSITORY",
      "Use a GitHub repository URL like https://github.com/org/repo.",
      400,
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(
      repo.repo,
    )}/issues`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: task.title,
        body: buildGitHubIssueBody(task),
      }),
    },
  );

  const data = (await response.json().catch(() => null)) as
    | {
        html_url?: string;
        number?: number;
        title?: string;
        message?: string;
      }
    | null;

  if (!response.ok) {
    throw new GitHubIssueError(
      "GITHUB_ISSUE_CREATE_FAILED",
      data?.message ?? "GitHub rejected the issue creation request.",
      response.status,
    );
  }

  if (!data?.html_url || typeof data.number !== "number" || !data.title) {
    throw new GitHubIssueError(
      "GITHUB_ISSUE_RESPONSE_INVALID",
      "GitHub returned an unexpected issue response.",
      502,
    );
  }

  return {
    number: data.number,
    title: data.title,
    url: data.html_url,
  } satisfies CreatedGitHubIssue;
}
