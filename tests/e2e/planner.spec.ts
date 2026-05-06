import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

const demoStorePath = path.join(process.cwd(), "data", ".planner-demo-store.json");
const demoNotePagesPath = path.join(process.cwd(), "data", ".planner-demo-note-pages.json");

type DemoSnapshot = {
  settings: {
    slotMinutes: number;
    weekStart: number;
  };
  areas: Array<{
    id: string;
    name: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    areaId: string | null;
  }>;
  milestones: Array<{
    id: string;
    name: string;
    projectId: string;
    startDate: string;
    deadline: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    priority: "low" | "medium" | "high" | "critical";
    dueAt: string | null;
    status: "todo" | "in_progress" | "review" | "qa" | "done";
    availability: "ready" | "later";
    areaId: string | null;
    projectId: string | null;
  }>;
  taskBlocks: Array<{
    id: string;
    taskId: string;
    startsAt: string;
    endsAt: string;
  }>;
  taskDependencies: Array<{
    taskId: string;
    dependsOnTaskId: string;
  }>;
  events: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
  }>;
};

type AgentTokenResponse = {
  token: string;
  record: {
    id: string;
    name: string;
    tokenPrefix: string;
    scopeType: "all_projects" | "selected_projects";
    projectIds: string[];
    revokedAt: string | null;
  };
};

type AgentRunnerResponse = {
  token: string;
  runner: {
    id: string;
    name: string;
    tokenPrefix: string;
    revokedAt: string | null;
  };
};

type AgentRunResponse = {
  run: {
    id: string;
    taskId: string | null;
    runnerId: string | null;
    status: string;
    branchName: string | null;
    changedFiles: string[];
    events: Array<{
      type: string;
      message: string;
    }>;
  };
};

type RunnerJobsResponse = {
  jobs: Array<{
    id: string;
    status: string;
    agentType: string;
    task: { id: string; title: string } | null;
    projectAgentLink: { repoUrl: string; defaultBranch: string } | null;
  }>;
};

type OAuthTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  scope: string;
};

type ApiEnvelope<T> = {
  data: T;
};

type FocusSessionApiResponse = {
  session: {
    selectedTaskId: string | null;
    selectedProfileId: string;
    running: boolean;
    remainingSeconds: number;
    updatedAt: string;
  } | null;
  history: Array<{
    id: string;
    taskId: string | null;
    taskTitle: string;
    minutes: number;
    completedAt: string;
  }>;
};

type McpResponse = {
  id?: number | string;
  result?: {
    content?: Array<{
      type: string;
      text?: string;
    }>;
    [key: string]: unknown;
  };
  error?: unknown;
};

async function resetDemoStore() {
  await rm(demoStorePath, { force: true });
  await rm(demoNotePagesPath, { force: true });
}

async function readSnapshot() {
  return JSON.parse(await readFile(demoStorePath, "utf8")) as DemoSnapshot;
}

async function readNotePagesStore() {
  return JSON.parse(await readFile(demoNotePagesPath, "utf8")) as Record<string, Record<string, Array<{ title: string; comments: Array<{ body: string }> }>>>;
}

async function expectJson<T>(response: APIResponse, status: number) {
  const body = await response.text();
  expect(response.status(), body).toBe(status);
  return JSON.parse(body) as T;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number.parseInt(part, 10));
  return hours * 60 + minutes;
}

function localTimeInNewYork(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function installChimeSpy(page: Page) {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __inflaraChimeStarts?: number;
      webkitAudioContext?: typeof AudioContext;
    };

    class FakeAudioParam {
      setValueAtTime() {}
      exponentialRampToValueAtTime() {}
    }

    class FakeAudioNode {
      gain = new FakeAudioParam();
      frequency = new FakeAudioParam();
      type = "sine";

      connect() {
        return this;
      }

      start() {
        target.__inflaraChimeStarts = (target.__inflaraChimeStarts ?? 0) + 1;
      }

      stop() {}
    }

    class FakeAudioContext {
      currentTime = 0;
      destination = {};

      resume() {
        return Promise.resolve();
      }

      createGain() {
        return new FakeAudioNode();
      }

      createOscillator() {
        return new FakeAudioNode();
      }
    }

    target.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
    target.webkitAudioContext = FakeAudioContext as unknown as typeof AudioContext;
  });
}

async function readCalendarResizeMetrics(
  page: Page,
  eventClassName: string,
  title: string,
) {
  const event = page
    .locator(`.planning-calendar-shell .fc-event.${eventClassName}`, { hasText: title })
    .first();
  await expect(event).toBeVisible();

  return event.evaluate((element) => {
    const resizer = element.querySelector<HTMLElement>(".fc-event-resizer-end");
    if (!resizer) return null;

    const eventRect = element.getBoundingClientRect();
    const resizerRect = resizer.getBoundingClientRect();
    const resizerStyle = window.getComputedStyle(resizer);
    const beforeStyle = window.getComputedStyle(resizer, "::before");
    const afterStyle = window.getComputedStyle(resizer, "::after");

    return {
      cursor: resizerStyle.cursor,
      eventWidth: eventRect.width,
      handleHeight: resizerRect.height,
      handleWidth: resizerRect.width,
      leftInset: resizerRect.left - eventRect.left,
      rightInset: eventRect.right - resizerRect.right,
      bottomInset: eventRect.bottom - resizerRect.bottom,
      bottomRuleHeight: Number.parseFloat(beforeStyle.height),
      gripWidth: Number.parseFloat(afterStyle.width),
    };
  });
}

async function createAgentToken(
  request: APIRequestContext,
  name = "E2E remote agent",
  options: {
    scopeType?: "all_projects" | "selected_projects";
    projectIds?: string[];
  } = {},
) {
  const response = await request.post("/api/access-tokens", {
    data: { name, ...options },
  });
  return expectJson<AgentTokenResponse>(response, 201);
}

function bearerHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function parseMcpResponse(response: APIResponse) {
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  const trimmed = body.trim();

  if (trimmed.startsWith("event:") || trimmed.includes("\ndata:")) {
    const data = trimmed
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter(Boolean)
      .join("\n");
    expect(data, trimmed).not.toBe("");
    return JSON.parse(data) as McpResponse;
  }

  return JSON.parse(trimmed) as McpResponse;
}

let mcpRequestId = 0;

async function mcpCall(
  request: APIRequestContext,
  token: string,
  method: string,
  params: Record<string, unknown> = {},
) {
  const id = ++mcpRequestId;
  const response = await request.post("/mcp", {
    headers: {
      ...bearerHeaders(token),
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
    },
    data: {
      jsonrpc: "2.0",
      id,
      method,
      params,
    },
  });
  const payload = await parseMcpResponse(response);
  expect(payload.id).toBe(id);
  expect(payload.error).toBeUndefined();
  return payload.result;
}

function parseMcpToolJson<T>(result: McpResponse["result"]) {
  const text = result?.content?.[0]?.text;
  expect(text).toBeTruthy();
  return JSON.parse(text!) as T;
}

async function waitForTask(title: string) {
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.tasks.find((task) => task.title === title) ?? null;
    })
    .not.toBeNull();

  const snapshot = await readSnapshot();
  return snapshot.tasks.find((task) => task.title === title)!;
}

async function waitForProject(name: string) {
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.projects.find((project) => project.name === name) ?? null;
    })
    .not.toBeNull();

  const snapshot = await readSnapshot();
  return snapshot.projects.find((project) => project.name === name)!;
}

async function waitForArea(name: string) {
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.areas.find((area) => area.name === name) ?? null;
    })
    .not.toBeNull();

  const snapshot = await readSnapshot();
  return snapshot.areas.find((area) => area.name === name)!;
}

test.beforeEach(async () => {
  await resetDemoStore();
});

test("local demo mode opens the redesigned workspace without Clerk", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("aside").first().getByText("INFLARA")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Planner MVP" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Planning", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Focus", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capacity", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Task" })).toBeVisible();
  await expect(page.getByText("Welcome back")).toHaveCount(0);
});

test("left rail navigates planning, inbox, capacity, areas, and project tabs", async ({
  page,
}) => {
  await page.goto("/");
  const sidebar = page.locator("aside");

  await page.getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Planning", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Task Flow" })).toBeVisible();
  await expect(page.getByTestId("planning-workload")).toBeVisible();
  await expect(page.locator(".fc").first()).toBeVisible();

  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(page.getByTestId("focus-view")).toBeVisible();
  await expect(page.getByText("Focus Time")).toBeVisible();
  await expect(page.getByTestId("focus-task-menu")).toBeVisible();

  await page.getByRole("button", { name: /Inbox/ }).click();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.getByText("Unscheduled work that still needs a plan.")).toBeVisible();

  await page.getByRole("button", { name: "Capacity" }).click();
  await expect(page.getByRole("heading", { name: "Capacity" })).toBeVisible();
  await expect(page.getByText("Work-hour load from tasks and fixed events.")).toBeVisible();

  await page.getByRole("button", { name: "Work" }).click();
  await expect(page.getByRole("heading", { name: "Work" })).toBeVisible();

  await sidebar.getByRole("button", { name: "Planner MVP", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Planner MVP" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Project Design" })).toBeVisible();
  const addProjectAction = page.getByTestId("sidebar-add-project-action");
  const projectRow = page.getByTestId("sidebar-project-row-project-launch");
  const projectAction = page.getByTestId("sidebar-project-action-project-launch");
  await expect(addProjectAction).toBeVisible();
  await projectRow.hover();
  await expect(projectAction).toHaveCSS("opacity", "1");
  const projectRowBox = await projectRow.boundingBox();
  const projectActionBox = await projectAction.boundingBox();
  expect(projectRowBox).not.toBeNull();
  expect(projectActionBox).not.toBeNull();
  expect(projectActionBox!.width).toBeGreaterThanOrEqual(28);
  expect(projectActionBox!.x + projectActionBox!.width).toBeLessThanOrEqual(
    projectRowBox!.x + projectRowBox!.width + 1,
  );

  await page.getByRole("button", { name: "Gantt Chart" }).click();
  await expect(page.getByText("Gantt Timeline")).toBeVisible();

  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(page.getByText("Overall Progress")).toBeVisible();
  await expect(page.getByText(/10000%/)).toHaveCount(0);

  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByTestId("project-notes")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show collaboration" })).toBeVisible();
  await page.getByRole("button", { name: "Show collaboration" }).click();
  await expect(page.getByText("Collaboration")).toBeVisible();
});

test("focus view selects a task, marks it in progress, and starts a sprint", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(page.getByTestId("focus-view")).toBeVisible();
  await expect(page.getByText("Focus Time")).toBeVisible();

  await page.getByTestId("focus-task-category-todo").click();
  await page.getByRole("button", { name: /Review overdue follow-ups/ }).click();
  await expect(page.getByText("Mark this task In Progress?")).toBeVisible();
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(page.getByText("Mark this task In Progress?")).toHaveCount(0);
  await expect(page.getByText("Review overdue follow-ups").first()).toBeVisible();

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Planning", exact: true }).click();
  const globalFocusTimer = page.getByTestId("global-focus-timer");
  await expect(globalFocusTimer).toBeVisible();
  await expect(globalFocusTimer).toContainText(/Focus|Break/);
  await expect(globalFocusTimer).toContainText(/24:|25:/);

  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.tasks.find((task) => task.title === "Review overdue follow-ups")?.status;
    })
    .toBe("in_progress");
});

test("focus session API syncs active timer state and history across clients", async ({
  page,
  request,
}) => {
  const updatedAt = new Date().toISOString();
  const completedAt = new Date(Date.now() - 60_000).toISOString();

  await expectJson<FocusSessionApiResponse>(
    await request.patch("/api/focus-session", {
      data: {
        session: {
          version: 1,
          selectedTaskId: "task-plan",
          selectedProfileId: "dynamic",
          profileName: "Dynamic Ramp",
          customFocusMinutes: 38,
          customBreakMinutes: 5,
          customLongBreakMinutes: 15,
          customRounds: 4,
          phaseIndex: 0,
          remainingSeconds: 120,
          running: true,
          phases: [
            {
              id: "dynamic-focus-1",
              kind: "focus",
              label: "Work 1",
              minutes: 10,
            },
            {
              id: "dynamic-break-1",
              kind: "break",
              label: "Break",
              minutes: 3,
            },
          ],
          updatedAt,
        },
        history: [
          {
            id: "focus-history-synced",
            taskId: "task-plan",
            taskTitle: "Daily planning reset",
            projectName: "Planner MVP",
            profileName: "Dynamic Ramp",
            minutes: 10,
            completedAt,
          },
        ],
      },
    }),
    200,
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Planning", exact: true }).click();

  const globalFocusTimer = page.getByTestId("global-focus-timer");
  await expect(globalFocusTimer).toBeVisible();
  await expect(globalFocusTimer).toContainText("Focus");

  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(page.getByTestId("focus-view")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daily planning reset" })).toBeVisible();
  await expect(page.getByText("10 min").first()).toBeVisible();

  const synced = await expectJson<FocusSessionApiResponse>(
    await request.get("/api/focus-session"),
    200,
  );
  expect(synced.session?.selectedTaskId).toBe("task-plan");
  expect(synced.session?.running).toBe(true);
  expect(synced.history.some((record) => record.id === "focus-history-synced")).toBe(
    true,
  );
});

test("project notes support markdown blocks, comments, and cloud persistence", async ({
  browser,
  page,
  request,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("inflara:project-notes:project-launch")) {
        window.localStorage.removeItem(key);
      }
    }

    window.localStorage.setItem("inflara:project-notes-sidebar-width", "296");
  });
  await page.reload();
  await page.locator("aside").getByRole("button", { name: "Planner MVP", exact: true }).click();
  await page.getByRole("button", { name: "Notes" }).click();

  await expect(page.getByTestId("project-notes")).toBeVisible();
  await expect(page.getByTestId("project-note-folder-structure")).toBeVisible();
  await page.getByTestId("project-note-folder-search").fill("General");
  await expect(page.getByRole("button", { name: "General Notes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear folder search" }).click();
  await expect(page.getByLabel("Block style")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy Markdown" })).toBeVisible();
  const folderPanelBoxBefore = await page.getByTestId("project-note-folder-structure").boundingBox();
  const resizeHandleBox = await page.getByTestId("project-notes-sidebar-resize-handle").boundingBox();
  expect(folderPanelBoxBefore).not.toBeNull();
  expect(resizeHandleBox).not.toBeNull();
  expect(Math.round(folderPanelBoxBefore?.width ?? 0)).toBeGreaterThanOrEqual(320);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("inflara:project-notes-sidebar-width")))
    .toBe("385");
  if (folderPanelBoxBefore && resizeHandleBox) {
    await page.mouse.move(
      resizeHandleBox.x + resizeHandleBox.width / 2,
      resizeHandleBox.y + resizeHandleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(resizeHandleBox.x - 72, resizeHandleBox.y + resizeHandleBox.height / 2);
    await page.mouse.up();
    const folderPanelBoxAfter = await page.getByTestId("project-note-folder-structure").boundingBox();
    expect(folderPanelBoxAfter?.width ?? 0).toBeGreaterThan(folderPanelBoxBefore.width + 40);
  }
  await page.getByRole("button", { name: "Show writing tools" }).click();
  await expect(page.getByTestId("project-note-writing-tools")).toBeVisible();
  const boldWritingTool = page.getByTestId("project-note-writing-tool-bold");
  await expect(boldWritingTool).toBeVisible();
  await expect(boldWritingTool).toBeEnabled();
  await expect(page.getByTestId("project-note-writing-tool-tooltip-bold")).toBeHidden();
  await boldWritingTool.hover();
  await expect(page.getByTestId("project-note-writing-tool-tooltip-bold")).toBeVisible();
  await page.getByTestId("project-note-title").fill("Architecture Notes");

  const editor = page.getByTestId("project-note-rich-surface");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("Temporary paragraph");
  await expect(editor).toContainText("Temporary paragraph");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await expect(editor).not.toContainText("Temporary paragraph");

  await page.keyboard.type("# Launch Readiness");
  await page.keyboard.press("Enter");
  await page.keyboard.type("First paragraph with ");
  await page.keyboard.type("**bold** ");
  await page.keyboard.type("and ");
  await page.keyboard.type("*italic* ");
  await page.keyboard.type("text.");

  await expect(editor.locator("h1")).toContainText("Launch Readiness");
  await expect(editor.locator("strong").filter({ hasText: "bold" })).toBeVisible();
  await expect(editor.locator("em").filter({ hasText: "italic" })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/bold");
  await expect(page.getByTestId("notes-slash-menu")).toBeVisible();
  await page.getByTestId("notes-slash-menu").getByRole("button", { name: /Bold text/ }).click();
  await page.keyboard.type("Slash bold");
  await page.keyboard.press("ControlOrMeta+B");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/italic");
  await expect(page.getByTestId("notes-slash-menu")).toBeVisible();
  await page.getByTestId("notes-slash-menu").getByRole("button", { name: /Italic text/ }).click();
  await page.keyboard.type("Slash italic");
  await page.keyboard.press("ControlOrMeta+I");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/blue");
  await expect(page.getByTestId("notes-slash-menu")).toBeVisible();
  await page.getByTestId("notes-slash-menu").getByRole("button", { name: /Blue text/ }).click();
  await page.keyboard.type("Slash blue");
  await expect(editor.locator("strong").filter({ hasText: "Slash bold" })).toBeVisible();
  await expect(editor.locator("em").filter({ hasText: "Slash italic" })).toBeVisible();
  const blueSlashText = editor.locator("span").filter({ hasText: "Slash blue" }).last();
  await expect(blueSlashText).toBeVisible();
  await expect
    .poll(() => blueSlashText.evaluate((node) => window.getComputedStyle(node).color))
    .toBe("rgb(37, 99, 235)");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/default");
  await expect(page.getByTestId("notes-slash-menu")).toBeVisible();
  await page.getByTestId("notes-slash-menu").getByRole("button", { name: /Default color/ }).click();
  await page.keyboard.press("Enter");
  await page.keyboard.type("/todo");
  await expect(page.getByTestId("notes-slash-menu")).toBeVisible();
  await page.getByTestId("notes-slash-menu").getByRole("button", { name: /Checklist/ }).click();
  await page.keyboard.type("Confirm rollout checklist");
  await expect(
    editor.getByRole("checkbox", { name: /Confirm rollout checklist/ }),
  ).toBeVisible();

  await page.setInputFiles('[data-testid="project-note-image-input"]', {
    name: "note.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(editor.locator('img[alt="note.png"]')).toBeVisible();

  await editor.getByText("bold", { exact: true }).click();
  await expect(editor).not.toContainText("**bold**");

  await page.getByRole("button", { name: "Show comments" }).click();
  await page.getByTestId("project-note-comment-input").fill("Add rollout risks to this note.");
  await page.getByRole("button", { name: "Send comment" }).click();
  await expect(page.getByText("Add rollout risks to this note.")).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(() => window.localStorage.getItem("inflara:project-notes:project-launch:v2")),
    )
    .toContain("Add rollout risks to this note.");
  await expect
    .poll(async () => {
      const response = await request.get("/api/projects/project-launch/notes");
      const pages = (await response.json()) as Array<{
        title: string;
        markdown: string;
        comments: Array<{ body: string }>;
      }>;

      return pages.some(
        (notePage) =>
          notePage.title === "Architecture Notes" &&
          notePage.markdown.includes("Launch Readiness") &&
          notePage.comments.some((comment) => comment.body === "Add rollout risks to this note."),
      );
    })
    .toBe(true);

  await page.reload();
  await page.locator("aside").getByRole("button", { name: "Planner MVP", exact: true }).click();
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByTestId("project-note-title")).toHaveValue("Architecture Notes");
  const reloadedEditor = page.getByTestId("project-note-rich-surface");
  await expect(reloadedEditor.locator("h1")).toContainText("Launch Readiness");
  await expect(reloadedEditor.getByText("bold", { exact: true })).toBeVisible();
  await expect(reloadedEditor.locator("strong").filter({ hasText: "Slash bold" })).toBeVisible();
  await expect(reloadedEditor.locator("em").filter({ hasText: "Slash italic" })).toBeVisible();
  const reloadedBlueSlashText = reloadedEditor.locator("span").filter({ hasText: "Slash blue" }).last();
  await expect(reloadedBlueSlashText).toBeVisible();
  await expect
    .poll(() => reloadedBlueSlashText.evaluate((node) => window.getComputedStyle(node).color))
    .toBe("rgb(37, 99, 235)");
  await expect(
    reloadedEditor.getByRole("checkbox", { name: /Confirm rollout checklist/ }),
  ).toBeVisible();
  await expect(reloadedEditor.locator('img[alt="note.png"]')).toBeVisible();
  await page.getByRole("button", { name: "Show comments" }).click();
  await expect(page.getByText("Add rollout risks to this note.")).toBeVisible();
  await expect
    .poll(async () => {
      const store = await readNotePagesStore();
      const projectPages = store["demo-user"]?.["project-launch"] ?? [];
      return projectPages.some(
        (notePage) =>
          notePage.title === "Architecture Notes" &&
          notePage.comments.some((comment) => comment.body === "Add rollout risks to this note."),
      );
    })
    .toBe(true);

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await secondPage.goto("/");
  await secondPage.locator("aside").getByRole("button", { name: "Planner MVP", exact: true }).click();
  await secondPage.getByRole("button", { name: "Notes" }).click();
  await expect(secondPage.getByTestId("project-note-title")).toHaveValue("Architecture Notes");
  await expect(secondPage.getByTestId("project-note-rich-surface").locator("h1")).toContainText("Launch Readiness");
  await secondPage.getByRole("button", { name: "Show comments" }).click();
  await expect(secondPage.getByText("Add rollout risks to this note.")).toBeVisible();
  await secondContext.close();
});

test("project notes support manual sections, subsections, notes, and drag moves", async ({
  page,
  request,
}) => {
  type ProjectNotePageSummary = {
    id: string;
    kind: string;
    title: string;
    sectionId: string | null;
    parentSectionId: string | null;
  };
  const readProjectNotePages = async () => {
    const response = await request.get("/api/projects/project-launch/notes");
    return (await response.json()) as ProjectNotePageSummary[];
  };

  await page.goto("/");
  await page.locator("aside").getByRole("button", { name: "Planner MVP", exact: true }).click();
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByTestId("project-notes")).toBeVisible();
  await expect(page.getByRole("button", { name: "Milestones", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "General Notes", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Discovery", exact: true }),
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept("Manual Research"));
  await page.getByRole("button", { name: "Create section", exact: true }).click();
  await expect(page.getByRole("button", { name: "Manual Research", exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      (await readProjectNotePages()).some(
        (notePage) => notePage.kind === "section" && notePage.title === "Manual Research",
      ),
    )
    .toBe(true);

  page.once("dialog", (dialog) => dialog.accept("Evidence"));
  await page.getByRole("button", { name: "Create subsection in Manual Research" }).click();
  await expect(page.getByRole("button", { name: "Evidence", exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const pages = await readProjectNotePages();
      const manualSection = pages.find(
        (notePage) => notePage.kind === "section" && notePage.title === "Manual Research",
      );

      return pages.some(
        (notePage) =>
          notePage.kind === "section" &&
          notePage.title === "Evidence" &&
          notePage.parentSectionId === manualSection?.id,
      );
    })
    .toBe(true);

  await page.getByRole("button", { name: "Create note in Manual Research" }).click();
  await expect(page.getByTestId("project-note-title")).toHaveValue("Untitled page");
  await page.getByTestId("project-note-title").fill("Research Note");
  await expect(page.getByTestId("project-note-title")).toHaveValue("Research Note");
  await page.getByTestId("project-note-rich-surface").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("Research content inside a manual section.");
  await expect(page.getByRole("button", { name: "Research Note", exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const pages = await readProjectNotePages();
      const manualSection = pages.find(
        (notePage) => notePage.kind === "section" && notePage.title === "Manual Research",
      );

      return pages.some(
        (notePage) =>
          notePage.kind === "note" &&
          notePage.title === "Research Note" &&
          notePage.sectionId === manualSection?.id,
      );
    })
    .toBe(true);

  await page.getByRole("button", { name: "Create note page", exact: true }).click();
  await expect(page.getByTestId("project-note-title")).toHaveValue("Untitled page");
  await page.getByTestId("project-note-title").fill("Drag Me Note");
  await expect(page.getByTestId("project-note-title")).toHaveValue("Drag Me Note");
  await page.getByTestId("project-note-rich-surface").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("This note will be moved into Manual Research.");
  const dragMeNote = page.locator('[data-note-kind="note"][data-note-title="Drag Me Note"]');
  await expect(dragMeNote).toBeAttached();
  await expect
    .poll(async () =>
      (await readProjectNotePages()).some(
        (notePage) =>
          notePage.kind === "note" &&
          notePage.title === "Drag Me Note" &&
          notePage.sectionId === null,
      ),
    )
    .toBe(true);
  await dragMeNote.scrollIntoViewIfNeeded();

  await dragMeNote.dragTo(
    page.locator('[data-note-kind="section"][data-note-title="Manual Research"]'),
  );

  await expect
    .poll(async () => {
      const pages = await readProjectNotePages();
      const manualSection = pages.find(
        (page) => page.kind === "section" && page.title === "Manual Research",
      );
      const subsection = pages.find(
        (page) =>
          page.kind === "section" &&
          page.title === "Evidence" &&
          page.parentSectionId === manualSection?.id,
      );
      const sectionNote = pages.find(
        (page) =>
          page.kind === "note" &&
          page.title === "Research Note" &&
          page.sectionId === manualSection?.id,
      );
      const movedNote = pages.find(
        (page) =>
          page.kind === "note" &&
          page.title === "Drag Me Note" &&
          page.sectionId === manualSection?.id,
      );

      return Boolean(manualSection && subsection && sectionNote && movedNote);
    })
    .toBe(true);
});

test("project note page API supports one-level page CRUD", async ({ request }) => {
  const firstResponse = await request.post("/api/projects/project-launch/notes", {
    data: {
      title: "Planning Notes",
      status: "Draft",
      markdown: "# Planning Notes\n\nInitial project page.",
    },
  });
  expect(firstResponse.status()).toBe(201);
  const firstPage = await firstResponse.json();
  expect(firstPage.title).toBe("Planning Notes");

  const secondResponse = await request.post("/api/projects/project-launch/notes", {
    data: {
      title: "Decision Log",
      status: "Draft",
      markdown: "Key decisions stay flat in this project notebook.",
    },
  });
  expect(secondResponse.status()).toBe(201);
  const secondPage = await secondResponse.json();

  const updateResponse = await request.patch(
    `/api/projects/project-launch/notes/${secondPage.id}`,
    {
      data: {
        title: "Renamed Decision Log",
        status: "Shared",
        markdown: "Updated decision log content.",
      },
    },
  );
  expect(updateResponse.ok()).toBeTruthy();
  const updatedSecondPage = await updateResponse.json();
  expect(updatedSecondPage).toMatchObject({
    id: secondPage.id,
    title: "Renamed Decision Log",
    status: "Shared",
    markdown: "Updated decision log content.",
  });

  const listResponse = await request.get("/api/projects/project-launch/notes");
  expect(listResponse.ok()).toBeTruthy();
  const pages = await listResponse.json();
  expect(
    pages
      .filter((page: { linkedEntityType: string }) => page.linkedEntityType === "manual")
      .map((page: { title: string }) => page.title),
  ).toEqual([
    "Planning Notes",
    "Renamed Decision Log",
  ]);
  expect(
    pages.map((page: { title: string; kind: string; systemKey: string | null }) => ({
      title: page.title,
      kind: page.kind,
      systemKey: page.systemKey,
    })),
  ).toEqual(
    expect.arrayContaining([
      {
        title: "Project Description",
        kind: "note",
        systemKey: "project:description",
      },
      {
        title: "Milestones",
        kind: "section",
        systemKey: "project:milestones",
      },
      {
        title: "General Notes",
        kind: "section",
        systemKey: "project:general-notes",
      },
    ]),
  );

  const deleteFirstResponse = await request.delete(
    `/api/projects/project-launch/notes/${firstPage.id}`,
  );
  expect(deleteFirstResponse.ok()).toBeTruthy();

  const deleteLastResponse = await request.delete(
    `/api/projects/project-launch/notes/${secondPage.id}`,
  );
  expect(deleteLastResponse.ok()).toBeTruthy();

  const remainingResponse = await request.get("/api/projects/project-launch/notes");
  expect(remainingResponse.ok()).toBeTruthy();
  const remainingPages = await remainingResponse.json();
  expect(
    remainingPages.some(
      (page: { title: string; systemKey: string | null }) =>
        page.title === "Project Description" && page.systemKey === "project:description",
    ),
  ).toBe(true);
});

test("task notes stay on tasks unless explicitly added to project notes", async ({
  request,
}) => {
  const defaultTaskResponse = await request.post("/api/tasks", {
    data: {
      title: "Task notes stay private",
      notes: "This should stay on the task record only.",
      projectId: "project-launch",
      milestoneId: "milestone-discovery",
      estimatedMinutes: 45,
      priority: "medium",
    },
  });
  expect(defaultTaskResponse.status()).toBe(201);
  const defaultTask = await defaultTaskResponse.json();

  let notesResponse = await request.get("/api/projects/project-launch/notes");
  expect(notesResponse.ok()).toBeTruthy();
  let pages = (await notesResponse.json()) as Array<{
    id: string;
    kind: string;
    title: string;
    markdown: string;
    sectionId: string | null;
    systemKey: string | null;
  }>;
  expect(
    pages.some(
      (page) =>
        page.title === defaultTask.title ||
        page.systemKey === `task:${defaultTask.id}:project-note`,
    ),
  ).toBe(false);

  const optInTaskResponse = await request.post("/api/tasks", {
    data: {
      title: "Task notes go to project notes",
      notes: "This should become a project note.",
      projectId: "project-launch",
      milestoneId: "milestone-discovery",
      estimatedMinutes: 45,
      priority: "medium",
      addToProjectNotes: true,
    },
  });
  expect(optInTaskResponse.status()).toBe(201);
  const optInTask = await optInTaskResponse.json();

  notesResponse = await request.get("/api/projects/project-launch/notes");
  expect(notesResponse.ok()).toBeTruthy();
  pages = (await notesResponse.json()) as Array<{
    id: string;
    kind: string;
    title: string;
    markdown: string;
    sectionId: string | null;
    systemKey: string | null;
  }>;
  const milestonesSection = pages.find(
    (page) => page.kind === "section" && page.systemKey === "project:milestones",
  );
  const taskNote = pages.find(
    (page) => page.systemKey === `task:${optInTask.id}:project-note`,
  );

  expect(taskNote).toMatchObject({
    title: "Task notes go to project notes",
    markdown: "This should become a project note.",
    sectionId: milestonesSection?.id,
  });
});

test("tasks without projects cannot retain milestones and extend milestone deadlines", async ({
  request,
}) => {
  let response = await request.post("/api/tasks", {
    data: {
      title: "No project means no milestone",
      projectId: null,
      milestoneId: "milestone-discovery",
      estimatedMinutes: 30,
    },
  });
  const noProjectTask = await expectJson<{
    projectId: string | null;
    milestoneId: string | null;
  }>(response, 201);
  expect(noProjectTask).toMatchObject({
    projectId: null,
    milestoneId: null,
  });

  response = await request.post("/api/tasks", {
    data: {
      title: "Push milestone deadline from task",
      projectId: "project-launch",
      milestoneId: "milestone-discovery",
      dueAt: "2026-06-15T18:00:00.000Z",
      estimatedMinutes: 45,
    },
  });
  expect(response.status()).toBe(201);
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.milestones.find(
        (milestone) => milestone.id === "milestone-discovery",
      )?.deadline;
    })
    .toBe("2026-06-15T18:00:00.000Z");

  response = await request.patch("/api/tasks/task-plan", {
    data: {
      dueAt: "2026-06-20T12:00:00.000Z",
    },
  });
  expect(response.status()).toBe(200);
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.milestones.find(
        (milestone) => milestone.id === "milestone-discovery",
      )?.deadline;
    })
    .toBe("2026-06-20T12:00:00.000Z");

  response = await request.patch("/api/tasks/task-outline", {
    data: {
      projectId: null,
    },
  });
  const clearedProjectTask = await expectJson<{
    projectId: string | null;
    milestoneId: string | null;
  }>(response, 200);
  expect(clearedProjectTask).toMatchObject({
    projectId: null,
    milestoneId: null,
  });
});

test("project notes cleanup flattens legacy generated milestone and task nodes", async ({
  request,
}) => {
  let notesResponse = await request.get("/api/projects/project-launch/notes");
  expect(notesResponse.ok()).toBeTruthy();
  let pages = (await notesResponse.json()) as Array<{
    id: string;
    kind: string;
    title: string;
    markdown: string;
    sectionId: string | null;
    parentSectionId: string | null;
    systemKey: string | null;
  }>;
  const milestonesSection = pages.find(
    (page) => page.kind === "section" && page.systemKey === "project:milestones",
  );
  expect(milestonesSection).toBeTruthy();

  const legacySectionResponse = await request.post("/api/projects/project-launch/notes", {
    data: {
      kind: "section",
      title: "Legacy Discovery Folder",
      parentSectionId: milestonesSection!.id,
      linkedEntityType: "milestone",
      linkedEntityId: "milestone-discovery",
      systemKey: "milestone:milestone-discovery:section",
    },
  });
  expect(legacySectionResponse.status()).toBe(201);
  const legacySection = await legacySectionResponse.json();

  const legacyTasksResponse = await request.post("/api/projects/project-launch/notes", {
    data: {
      kind: "section",
      title: "Tasks",
      parentSectionId: legacySection.id,
      linkedEntityType: "milestone",
      linkedEntityId: "milestone-discovery",
      systemKey: "milestone:milestone-discovery:tasks",
    },
  });
  expect(legacyTasksResponse.status()).toBe(201);
  const legacyTasksSection = await legacyTasksResponse.json();

  await request.post("/api/projects/project-launch/notes", {
    data: {
      title: "Milestone Details",
      sectionId: legacySection.id,
      linkedEntityType: "milestone",
      linkedEntityId: "milestone-discovery",
      systemKey: "milestone:milestone-discovery:details",
      markdown: "# Legacy details",
    },
  });
  await request.post("/api/projects/project-launch/notes", {
    data: {
      title: "Milestone Description",
      sectionId: legacySection.id,
      linkedEntityType: "milestone",
      linkedEntityId: "milestone-discovery",
      systemKey: "milestone:milestone-discovery:description",
      markdown: "Legacy milestone note body.",
    },
  });
  await request.post("/api/projects/project-launch/notes", {
    data: {
      title: "Legacy Task Mirror",
      sectionId: legacyTasksSection.id,
      linkedEntityType: "task",
      linkedEntityId: "task-outline",
      systemKey: "task:task-outline:note",
      markdown: "Legacy task note mirror.",
    },
  });
  await request.post("/api/projects/project-launch/notes", {
    data: {
      title: "Manual legacy idea",
      sectionId: legacyTasksSection.id,
      markdown: "Keep this user-authored note visible.",
    },
  });

  notesResponse = await request.get("/api/projects/project-launch/notes");
  expect(notesResponse.ok()).toBeTruthy();
  pages = (await notesResponse.json()) as Array<{
    id: string;
    kind: string;
    title: string;
    markdown: string;
    sectionId: string | null;
    parentSectionId: string | null;
    systemKey: string | null;
  }>;
  const refreshedMilestonesSection = pages.find(
    (page) => page.kind === "section" && page.systemKey === "project:milestones",
  );
  const discoveryNote = pages.find(
    (page) => page.systemKey === "milestone:milestone-discovery:note",
  );
  const manualLegacyNote = pages.find((page) => page.title === "Manual legacy idea");

  expect(discoveryNote).toMatchObject({
    title: "Discovery",
    markdown: "Legacy milestone note body.",
    sectionId: refreshedMilestonesSection?.id,
  });
  expect(manualLegacyNote).toMatchObject({
    sectionId: refreshedMilestonesSection?.id,
  });
  expect(
    pages.some((page) =>
      [
        "milestone:milestone-discovery:section",
        "milestone:milestone-discovery:tasks",
        "milestone:milestone-discovery:details",
        "milestone:milestone-discovery:description",
        "task:task-outline:note",
      ].includes(page.systemKey ?? ""),
    ),
  ).toBe(false);
});

test("remote API enforces bearer tokens and rejects revoked tokens", async ({
  request,
}) => {
  let response = await request.get("/api/v1/projects");
  let body = await expectJson<{ error: { code: string } }>(response, 401);
  expect(body.error.code).toBe("UNAUTHORIZED");

  response = await request.get("/api/v1/projects", {
    headers: bearerHeaders("ifl_invalid"),
  });
  body = await expectJson<{ error: { code: string } }>(response, 401);
  expect(body.error.code).toBe("UNAUTHORIZED");

  const { token, record } = await createAgentToken(request, "Revoked API agent");
  response = await request.get("/api/v1/projects", {
    headers: bearerHeaders(token),
  });
  const validBody = await expectJson<ApiEnvelope<{ projects: Array<{ id: string }> }>>(
    response,
    200,
  );
  expect(validBody.data.projects.length).toBeGreaterThan(0);

  response = await request.post(`/api/access-tokens/${record.id}/revoke`, {
    data: {},
  });
  await expectJson<{ token: { revokedAt: string } }>(response, 200);

  response = await request.get("/api/v1/projects", {
    headers: bearerHeaders(token),
  });
  body = await expectJson<{ error: { code: string } }>(response, 401);
  expect(body.error.code).toBe("UNAUTHORIZED");
});

test("remote API creates and updates projects, milestones, and tasks without delete access", async ({
  request,
}) => {
  const { token } = await createAgentToken(request, "Planner API agent");
  const headers = bearerHeaders(token);

  let response = await request.post("/api/v1/projects", {
    headers,
    data: {
      name: "Remote API Project",
      notes: "Seeded from a remote agent.",
      status: "active",
    },
  });
  const projectBody = await expectJson<ApiEnvelope<{ project: { id: string; name: string } }>>(
    response,
    201,
  );
  expect(projectBody.data.project.name).toBe("Remote API Project");

  response = await request.patch(`/api/v1/projects/${projectBody.data.project.id}`, {
    headers,
    data: {
      name: "Remote API Project Updated",
    },
  });
  const updatedProjectBody = await expectJson<
    ApiEnvelope<{ project: { id: string; name: string } }>
  >(response, 200);
  expect(updatedProjectBody.data.project.name).toBe("Remote API Project Updated");

  response = await request.post(
    `/api/v1/projects/${projectBody.data.project.id}/milestones`,
    {
      headers,
      data: {
        name: "Remote API Milestone",
        description: "Milestone notes from the API.",
        startDate: "2026-05-05T13:00:00.000Z",
        deadline: "2026-05-15T21:00:00.000Z",
      },
    },
  );
  const milestoneBody = await expectJson<
    ApiEnvelope<{ milestone: { id: string; name: string; description: string } }>
  >(response, 201);
  expect(milestoneBody.data.milestone.description).toBe("Milestone notes from the API.");

  response = await request.patch(`/api/v1/milestones/${milestoneBody.data.milestone.id}`, {
    headers,
    data: {
      description: "Updated milestone notes from the API.",
    },
  });
  const updatedMilestoneBody = await expectJson<
    ApiEnvelope<{ milestone: { id: string; description: string } }>
  >(response, 200);
  expect(updatedMilestoneBody.data.milestone.description).toBe(
    "Updated milestone notes from the API.",
  );

  response = await request.post("/api/v1/tasks", {
    headers,
    data: {
      title: "Remote API Task",
      notes: "Task notes stay task-only by default.",
      projectId: projectBody.data.project.id,
      milestoneId: milestoneBody.data.milestone.id,
      estimatedMinutes: 45,
      priority: "high",
    },
  });
  const taskBody = await expectJson<ApiEnvelope<{ task: { id: string; status: string } }>>(
    response,
    201,
  );
  expect(taskBody.data.task.status).toBe("todo");

  response = await request.patch(`/api/v1/tasks/${taskBody.data.task.id}`, {
    headers,
    data: {
      status: "in_progress",
      notes: "Updated through the remote API.",
    },
  });
  const updatedTaskBody = await expectJson<
    ApiEnvelope<{ task: { id: string; status: string; notes: string } }>
  >(response, 200);
  expect(updatedTaskBody.data.task).toMatchObject({
    status: "in_progress",
    notes: "Updated through the remote API.",
  });

  response = await request.get(
    `/api/v1/tasks?projectId=${projectBody.data.project.id}&status=in_progress`,
    { headers },
  );
  const tasksBody = await expectJson<ApiEnvelope<{ tasks: Array<{ id: string }> }>>(
    response,
    200,
  );
  expect(tasksBody.data.tasks.some((task) => task.id === taskBody.data.task.id)).toBe(true);

  response = await request.delete(`/api/v1/tasks/${taskBody.data.task.id}`, {
    headers,
  });
  expect(response.status()).toBe(405);
});

test("project-scoped remote API tokens only access selected projects", async ({
  request,
}) => {
  const { token, record } = await createAgentToken(request, "Project scoped agent", {
    scopeType: "selected_projects",
    projectIds: ["project-launch"],
  });
  const headers = bearerHeaders(token);
  expect(record).toMatchObject({
    scopeType: "selected_projects",
    projectIds: ["project-launch"],
  });

  let response = await request.get("/api/v1/me", { headers });
  const meBody = await expectJson<
    ApiEnvelope<{ token: { scopeType: string; projectIds: string[] } }>
  >(response, 200);
  expect(meBody.data.token).toEqual({
    scopeType: "selected_projects",
    projectIds: ["project-launch"],
  });

  response = await request.get("/api/v1/projects", { headers });
  const projectsBody = await expectJson<
    ApiEnvelope<{ projects: Array<{ id: string }> }>
  >(response, 200);
  expect(projectsBody.data.projects.map((project) => project.id)).toEqual([
    "project-launch",
  ]);

  response = await request.get("/api/v1/projects/project-wellness", { headers });
  await expectJson<{ error: { code: string } }>(response, 403);

  response = await request.get("/api/v1/tasks", { headers });
  const tasksBody = await expectJson<
    ApiEnvelope<{ tasks: Array<{ projectId: string | null }> }>
  >(response, 200);
  expect(tasksBody.data.tasks.length).toBeGreaterThan(0);
  expect(
    tasksBody.data.tasks.every((task) => task.projectId === "project-launch"),
  ).toBe(true);

  response = await request.post("/api/v1/projects", {
    headers,
    data: {
      name: "Blocked scoped project",
    },
  });
  await expectJson<{ error: { code: string } }>(response, 403);

  response = await request.post("/api/v1/tasks", {
    headers,
    data: {
      title: "Blocked wellness task",
      projectId: "project-wellness",
      milestoneId: "milestone-foundation",
      estimatedMinutes: 30,
    },
  });
  await expectJson<{ error: { code: string } }>(response, 403);

  response = await request.post("/api/v1/tasks", {
    headers,
    data: {
      title: "Allowed project scoped task",
      projectId: "project-launch",
      milestoneId: "milestone-discovery",
      estimatedMinutes: 30,
    },
  });
  const createdTask = await expectJson<ApiEnvelope<{ task: { projectId: string } }>>(
    response,
    201,
  );
  expect(createdTask.data.task.projectId).toBe("project-launch");
});

test("remote API task notes stay task-only unless project note opt-in is set", async ({
  request,
}) => {
  const { token } = await createAgentToken(request, "Task note API agent");
  const headers = bearerHeaders(token);

  let response = await request.post("/api/v1/tasks", {
    headers,
    data: {
      title: "Remote task-only note",
      notes: "Do not mirror this task note.",
      projectId: "project-launch",
      milestoneId: "milestone-discovery",
      estimatedMinutes: 30,
    },
  });
  const defaultTaskBody = await expectJson<ApiEnvelope<{ task: { id: string } }>>(
    response,
    201,
  );

  response = await request.get("/api/projects/project-launch/notes");
  const initialPages = (await expectJson<
    Array<{ title: string; systemKey: string | null }>
  >(response, 200));
  expect(
    initialPages.some(
      (page) =>
        page.title === "Remote task-only note" ||
        page.systemKey === `task:${defaultTaskBody.data.task.id}:project-note`,
    ),
  ).toBe(false);

  response = await request.post("/api/v1/tasks", {
    headers,
    data: {
      title: "Remote task mirrored note",
      notes: "Mirror this explicit opt-in task note.",
      projectId: "project-launch",
      milestoneId: "milestone-discovery",
      estimatedMinutes: 30,
      addToProjectNotes: true,
    },
  });
  const optedInTaskBody = await expectJson<ApiEnvelope<{ task: { id: string } }>>(
    response,
    201,
  );

  response = await request.get("/api/projects/project-launch/notes");
  const pages = await expectJson<Array<{
    id: string;
    title: string;
    markdown: string;
    sectionId: string | null;
    systemKey: string | null;
  }>>(response, 200);
  const milestonesSection = pages.find(
    (page) => page.systemKey === "project:milestones",
  );
  const taskNote = pages.find(
    (page) => page.systemKey === `task:${optedInTaskBody.data.task.id}:project-note`,
  );
  expect(taskNote).toMatchObject({
    title: "Remote task mirrored note",
    markdown: "Mirror this explicit opt-in task note.",
    sectionId: milestonesSection?.id,
  });
});

test("agent runner dispatch API claims, logs, finishes, and routes task to review", async ({
  request,
}) => {
  let response = await request.post("/api/agent-runners", {
    data: {
      name: "E2E Mac runner",
      platform: "macos",
      appVersion: "0.1.0",
      capabilities: {
        supportsWorktrees: true,
        agents: [{ type: "codex", available: true }],
      },
    },
  });
  const runnerBody = await expectJson<AgentRunnerResponse>(response, 201);
  const runnerHeaders = bearerHeaders(runnerBody.token);

  response = await request.post("/api/project-agent-links", {
    data: {
      projectId: "project-launch",
      repoUrl: "https://github.com/example/inflara-demo",
      defaultBranch: "main",
    },
  });
  await expectJson<{ link: { projectId: string } }>(response, 200);

  response = await request.post("/api/agent-runs", {
    data: {
      taskId: "task-outline",
      runnerId: runnerBody.runner.id,
      agentType: "codex",
      modelName: "gpt-5.2",
      extraPrompt: "E2E runner lifecycle verification.",
    },
  });
  const createdRun = await expectJson<AgentRunResponse>(response, 201);
  expect(createdRun.run.status).toBe("queued");

  response = await request.get("/api/runner/jobs", {
    headers: runnerHeaders,
  });
  const jobsBody = await expectJson<RunnerJobsResponse>(response, 200);
  const job = jobsBody.jobs.find((candidate) => candidate.id === createdRun.run.id);
  expect(job).toMatchObject({
    status: "queued",
    agentType: "codex",
    task: { id: "task-outline" },
    projectAgentLink: {
      repoUrl: "https://github.com/example/inflara-demo",
      defaultBranch: "main",
    },
  });

  response = await request.post(`/api/runner/jobs/${createdRun.run.id}/claim`, {
    headers: runnerHeaders,
    data: {},
  });
  const claimedRun = await expectJson<AgentRunResponse>(response, 200);
  expect(claimedRun.run.status).toBe("awaiting_local_confirmation");

  response = await request.post(`/api/runner/jobs/${createdRun.run.id}/start`, {
    headers: runnerHeaders,
    data: {
      branchName: "inflara/outline-onboarding-run",
      modelName: "gpt-5.2",
    },
  });
  const startedRun = await expectJson<AgentRunResponse>(response, 200);
  expect(startedRun.run.status).toBe("running");

  response = await request.post(`/api/runner/jobs/${createdRun.run.id}/events`, {
    headers: runnerHeaders,
    data: {
      events: [
        {
          type: "log",
          message: "Fake Codex output from e2e",
          data: { stream: "stdout" },
        },
      ],
    },
  });
  await expectJson<{ events: Array<{ type: string }> }>(response, 200);

  response = await request.post(`/api/runner/jobs/${createdRun.run.id}/finish`, {
    headers: runnerHeaders,
    data: {
      summary: "Updated onboarding outline.",
      changedFiles: ["src/onboarding.ts"],
      verification: { command: "pnpm test", result: "mocked" },
      confidence: 88,
      riskyAreas: ["onboarding-copy"],
      branchName: "inflara/outline-onboarding-run",
    },
  });
  const finishedRun = await expectJson<AgentRunResponse>(response, 200);
  expect(finishedRun.run.status).toBe("succeeded");

  const snapshot = await readSnapshot();
  expect(snapshot.tasks.find((task) => task.id === "task-outline")?.status).toBe("review");

  response = await request.get(`/api/agent-runs?taskId=task-outline`);
  const runsBody = await expectJson<{ runs: AgentRunResponse["run"][] }>(response, 200);
  const run = runsBody.runs.find((candidate) => candidate.id === createdRun.run.id);
  expect(run).toMatchObject({
    branchName: "inflara/outline-onboarding-run",
    changedFiles: ["src/onboarding.ts"],
  });
  expect(run?.events.map((event) => event.type)).toEqual(
    expect.arrayContaining(["created", "claimed", "started", "log", "finished"]),
  );
});

test("MCP endpoint initializes, lists tools, and creates and updates tasks", async ({
  request,
}) => {
  const { token } = await createAgentToken(request, "MCP agent");

  const initializeResult = await mcpCall(request, token, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: {
      name: "inflara-e2e",
      version: "1.0.0",
    },
  });
  expect(initializeResult?.serverInfo).toMatchObject({ name: "inflara" });

  const toolsResult = await mcpCall(request, token, "tools/list");
  expect(
    (toolsResult?.tools as Array<{ name: string }>).map((tool) => tool.name),
  ).toEqual(
    expect.arrayContaining([
      "inflara_list_projects",
      "inflara_create_task",
      "inflara_update_task",
    ]),
  );

  const listProjectsResult = await mcpCall(request, token, "tools/call", {
    name: "inflara_list_projects",
    arguments: {},
  });
  const listProjectsBody = parseMcpToolJson<{
    projects: Array<{ id: string; name: string }>;
  }>(listProjectsResult);
  expect(listProjectsBody.projects.some((project) => project.id === "project-launch")).toBe(true);

  const createTaskResult = await mcpCall(request, token, "tools/call", {
    name: "inflara_create_task",
    arguments: {
      title: "MCP created task",
      notes: "Created through MCP.",
      projectId: "project-launch",
      milestoneId: "milestone-discovery",
      estimatedMinutes: 30,
      priority: "high",
    },
  });
  const createdTaskBody = parseMcpToolJson<{ task: { id: string; title: string } }>(
    createTaskResult,
  );
  expect(createdTaskBody.task.title).toBe("MCP created task");

  const updateTaskResult = await mcpCall(request, token, "tools/call", {
    name: "inflara_update_task",
    arguments: {
      taskId: createdTaskBody.task.id,
      status: "done",
      notes: "Updated through MCP.",
    },
  });
  const updatedTaskBody = parseMcpToolJson<{
    task: { id: string; status: string; notes: string };
  }>(updateTaskResult);
  expect(updatedTaskBody.task).toMatchObject({
    id: createdTaskBody.task.id,
    status: "done",
    notes: "Updated through MCP.",
  });
});

test("settings remote agent tokens are copy-once and revocation blocks API access", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Planning settings" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Remote agent access")).toBeVisible();
  await expect(dialog.getByText("Codex CLI")).toBeVisible();
  await expect(dialog.getByText("Antigravity", { exact: true })).toBeVisible();

  await dialog.getByLabel("Token name").fill("UI E2E agent");
  await dialog.getByRole("button", { name: "Selected projects" }).click();
  await dialog.getByLabel("Planner MVP").check();
  await dialog.getByRole("button", { name: "Create token" }).click();
  await expect(dialog.getByText("Copy this token now. It will only be shown once.")).toBeVisible();
  const tokenInput = dialog.getByLabel("New API token");
  await expect(tokenInput).toHaveValue(/^ifl_/);
  const generatedToken = await tokenInput.inputValue();

  let response = await request.get("/api/v1/projects", {
    headers: bearerHeaders(generatedToken),
  });
  const scopedProjects = await expectJson<
    ApiEnvelope<{ projects: Array<{ id: string }> }>
  >(response, 200);
  expect(scopedProjects.data.projects.map((project) => project.id)).toEqual([
    "project-launch",
  ]);

  await dialog.getByRole("button", { name: "Close details" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Settings" }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "Planning settings" });
  await expect(reopenedDialog.getByText("UI E2E agent")).toBeVisible();
  await expect(reopenedDialog.getByText("Scope: Planner MVP")).toBeVisible();
  await expect(reopenedDialog.getByLabel("New API token")).toHaveCount(0);

  await reopenedDialog.getByRole("button", { name: "Revoke token UI E2E agent" }).click();
  await expect(reopenedDialog.getByText("Revoked")).toBeVisible();

  response = await request.get("/api/v1/projects", {
    headers: bearerHeaders(generatedToken),
  });
  await expectJson<{ error: { code: string } }>(response, 401);
});

test("OAuth MCP authorization code flow issues scoped bearer tokens", async ({
  page,
  request,
}) => {
  const metadataResponse = await request.get("/.well-known/oauth-authorization-server");
  const metadata = await expectJson<{
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint: string;
    code_challenge_methods_supported: string[];
  }>(metadataResponse, 200);
  expect(metadata.authorization_endpoint).toContain("/oauth/authorize");
  expect(metadata.token_endpoint).toContain("/oauth/token");
  expect(metadata.registration_endpoint).toContain("/oauth/register");
  expect(metadata.code_challenge_methods_supported).toContain("S256");

  const registrationResponse = await request.post("/oauth/register", {
    data: {
      client_name: "E2E OAuth client",
      redirect_uris: ["http://127.0.0.1/oauth-test-callback"],
    },
  });
  const registration = await expectJson<{ client_id: string }>(registrationResponse, 201);
  expect(registration.client_id).toContain("inflara_oauth_");

  await page.goto("/");
  const redirectUri = `${new URL(page.url()).origin}/oauth-test-callback`;
  const verifier = "plain-e2e-verifier";
  const authorizeUrl = new URL("/oauth/authorize", page.url());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", registration.client_id);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", "oauth-e2e-state");
  authorizeUrl.searchParams.set("scope", "planner:read planner:write");
  authorizeUrl.searchParams.set("code_challenge", verifier);
  authorizeUrl.searchParams.set("code_challenge_method", "plain");

  await page.goto(authorizeUrl.toString());
  await expect(
    page.getByRole("heading", { name: "Authorize Inflara MCP access" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Authorize access" }).click();
  await page.waitForURL(/oauth-test-callback/);

  const callbackUrl = new URL(page.url());
  expect(callbackUrl.searchParams.get("state")).toBe("oauth-e2e-state");
  const code = callbackUrl.searchParams.get("code");
  expect(code).toBeTruthy();
  if (!code) {
    throw new Error("OAuth callback did not include an authorization code");
  }

  const tokenResponse = await request.post("/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code,
      client_id: registration.client_id,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    },
  });
  const token = await expectJson<OAuthTokenResponse>(tokenResponse, 200);
  expect(token.token_type).toBe("Bearer");
  expect(token.scope).toContain("planner:read");

  const meResponse = await request.get("/api/v1/me", {
    headers: bearerHeaders(token.access_token),
  });
  const me = await expectJson<ApiEnvelope<{ user: { id: string } }>>(meResponse, 200);
  expect(me.data.user.id).toBe("demo-user");
});

test("GitHub issue creation endpoint reports missing server configuration", async ({
  request,
}) => {
  test.skip(
    Boolean(process.env.GITHUB_ISSUES_TOKEN || process.env.GITHUB_TOKEN),
    "GitHub issue creation is configured in this environment.",
  );

  const response = await request.post("/api/github/issues", {
    data: {
      repoUrl: "https://github.com/openai/codex",
      task: {
        title: "Browser-created task issue",
        notes: "This request should not create an issue without a token.",
        priority: "Medium",
        estimatedMinutes: 30,
        dueAt: null,
      },
    },
  });
  const body = await expectJson<{ error: string }>(response, 501);
  expect(body.error).toBe("GITHUB_NOT_CONFIGURED");
});

test("project design inline date, status, and priority controls persist without full editors", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("aside").getByRole("button", { name: "Planner MVP", exact: true }).click();
  await expect(page.getByRole("button", { name: "Project Design" })).toBeVisible();
  await expect(page.getByTestId("project-task-row-task-kickoff")).toBeVisible();
  await page.getByRole("button", { name: "Project Details" }).click();
  await page.getByLabel("GitHub repository").fill("openai/codex");
  await page.getByRole("button", { name: "Save project" }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem("inflara:github-repo-links:v1");
        return raw ? JSON.parse(raw)["project-launch"] : null;
      }),
    )
    .toBe("https://github.com/openai/codex");
  await page.getByTestId("project-task-row-task-kickoff").click();
  await expect(page.getByRole("button", { name: "Create GitHub issue" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect
    .poll(async () =>
      page.getByTestId("project-task-row-task-kickoff").evaluate((row) => {
        const children = Array.from(row.children) as HTMLElement[];
        const rowRect = row.getBoundingClientRect();
        const titleRect = children[0]?.getBoundingClientRect();
        const ownerRect = children[1]?.getBoundingClientRect();
        const statusRect = children[2]?.getBoundingClientRect();
        const dueRect = children[4]?.getBoundingClientRect();

        return Boolean(
          titleRect &&
            ownerRect &&
            statusRect &&
            dueRect &&
            rowRect.height <= 72 &&
            Math.abs(titleRect.top - ownerRect.top) < 12 &&
            Math.abs(titleRect.top - statusRect.top) < 12 &&
            statusRect.left > ownerRect.left &&
            dueRect.left > statusRect.left,
        );
      }),
    )
    .toBe(true);

  await page.getByLabel("Edit Discovery dates").click();
  await expect(page.getByText("Edit milestone")).toHaveCount(0);
  await page
    .getByTestId("milestone-date-popover-milestone-discovery")
    .getByLabel("Start date for Discovery")
    .fill("2026-05-01");
  await page
    .getByTestId("milestone-date-popover-milestone-discovery")
    .getByLabel("End date for Discovery")
    .fill("2026-05-12");
  await page.getByRole("button", { name: "Save dates" }).click();
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      const milestone = snapshot.milestones.find(
        (candidate) => candidate.id === "milestone-discovery",
      );
      return milestone
        ? {
            startDate: milestone.startDate.slice(0, 10),
            deadline: milestone.deadline.slice(0, 10),
          }
        : null;
    })
    .toEqual({ startDate: "2026-05-01", deadline: "2026-05-12" });
  await expect(page.getByLabel("Edit Discovery dates")).toContainText("May 1 - May 12");

  await page.getByLabel("Change status for Approve planner kickoff brief").click();
  await expect(page.getByRole("dialog", { name: "Task details" })).toHaveCount(0);
  await page
    .getByTestId("task-status-popover-task-kickoff")
    .getByRole("button", { name: "To Do" })
    .click();
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.tasks.find((task) => task.id === "task-kickoff")?.status ?? null;
    })
    .toBe("todo");

  await page.getByLabel("Change priority for Daily planning reset").click();
  await expect(page.getByRole("dialog", { name: "Task details" })).toHaveCount(0);
  await page
    .getByTestId("task-priority-popover-task-plan")
    .getByRole("button", { name: "Critical" })
    .click();
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.tasks.find((task) => task.id === "task-plan")?.priority ?? null;
    })
    .toBe("critical");

  await page.getByLabel("Edit due date for Daily planning reset").click();
  await expect(page.getByRole("dialog", { name: "Task details" })).toHaveCount(0);
  await page
    .getByTestId("task-due-popover-task-plan")
    .getByLabel("Due date for Daily planning reset")
    .fill("2026-05-08");
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.tasks.find((task) => task.id === "task-plan")?.dueAt?.slice(0, 10) ?? null;
    })
    .toBe("2026-05-08");
});

test("project design task search replaces the inactive filter", async ({ page }) => {
  await page.goto("/");
  await page.locator("aside").getByRole("button", { name: "Planner MVP", exact: true }).click();

  const projectModule = page.locator("[data-project-planning-module]");
  await expect(projectModule.getByRole("button", { name: "Filter" })).toHaveCount(0);

  const search = projectModule.getByTestId("project-task-search");
  await expect(search).toBeVisible();
  await search.fill("Outline Planner Onboardng");
  await expect(projectModule.getByTestId("project-task-search-count")).toContainText(
    "1 matching task",
  );
  await expect(projectModule.getByTestId("project-task-row-task-outline")).toBeVisible();
  await expect(projectModule.getByTestId("project-task-row-task-review")).toHaveCount(0);

  await search.fill("approve-plannerkickoff");
  await expect(projectModule.getByTestId("project-task-search-count")).toContainText(
    "1 matching task",
  );
  await expect(projectModule.getByTestId("project-task-row-task-kickoff")).toBeVisible();
  await expect(projectModule.getByTestId("project-task-row-task-outline")).toHaveCount(0);

  await projectModule.getByTestId("project-task-search-clear").click();
  await expect(projectModule.getByTestId("project-task-search-count")).toHaveCount(0);
  await expect(projectModule.getByTestId("project-task-row-task-outline")).toBeVisible();
  await expect(projectModule.getByTestId("project-task-row-task-kickoff")).toBeVisible();
});

test("planning kanban supports custom columns, local task columns, and collapse", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Planning", exact: true }).click();

  await expect(page.getByTestId("planning-workload")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
  await expect(page.getByTestId("planning-card-task-plan")).toHaveCount(1);
  await expect(page.getByTestId("planning-card-task-outline")).toHaveCount(1);
  await expect(page.getByTestId("planning-card-task-kickoff")).toHaveCount(1);
  const taskFlowProjectFilter = page.getByTestId("task-flow-project-filter-trigger");
  await expect(taskFlowProjectFilter).toContainText("All projects");
  await taskFlowProjectFilter.click();
  const taskFlowProjectFilterMenu = page.getByTestId("task-flow-project-filter-menu");
  await expect(
    taskFlowProjectFilterMenu.getByRole("checkbox", { name: "All projects" }),
  ).toBeChecked();
  await expect(
    taskFlowProjectFilterMenu.getByRole("checkbox", { name: "Planner MVP" }),
  ).toBeChecked();
  await expect(
    taskFlowProjectFilterMenu.getByRole("checkbox", { name: "Training Block" }),
  ).toBeChecked();
  await taskFlowProjectFilterMenu
    .getByRole("checkbox", { name: "Planner MVP" })
    .uncheck();
  await expect(taskFlowProjectFilter).toContainText("Training Block");
  await expect(page.getByTestId("planning-card-task-gym")).toHaveCount(1);
  await expect(page.getByTestId("planning-card-task-plan")).toHaveCount(0);
  await taskFlowProjectFilterMenu
    .getByRole("checkbox", { name: "Planner MVP" })
    .check();
  await expect(taskFlowProjectFilter).toContainText("All projects");
  await taskFlowProjectFilterMenu
    .getByRole("checkbox", { name: "Training Block" })
    .uncheck();
  await expect(taskFlowProjectFilter).toContainText("Planner MVP");
  await expect(page.getByTestId("planning-card-task-plan")).toHaveCount(1);
  await expect(page.getByTestId("planning-card-task-gym")).toHaveCount(0);
  await taskFlowProjectFilterMenu
    .getByRole("checkbox", { name: "All projects" })
    .check();
  await expect(taskFlowProjectFilter).toContainText("All projects");
  await expect(page.getByTestId("planning-card-task-plan")).toHaveCount(1);
  await page.getByTestId("surface-day").click();
  const shortCalendarItem = page
    .locator(".planner-calendar-item", { hasText: "Daily planning reset" })
    .first();
  await expect(shortCalendarItem).toHaveClass(/is-single-line/);
  await expect
    .poll(async () =>
      shortCalendarItem.evaluate((item) => ({
        text: item.textContent?.replace(/\s+/g, " ").trim(),
        projectCount: item.querySelectorAll(".planner-calendar-item__project").length,
        statusCount: item.querySelectorAll(".planner-calendar-item__status").length,
        metaCount: item.querySelectorAll(".planner-calendar-item__meta, .planner-calendar-item__inline-meta").length,
      })),
    )
    .toEqual({
      text: "Daily planning reset",
      projectCount: 0,
      statusCount: 0,
      metaCount: 0,
    });
  const longCalendarItem = page
    .locator(".planner-calendar-item", { hasText: "Outline the planner onboarding" })
    .first();
  await expect
    .poll(async () =>
      longCalendarItem.evaluate((item) => {
        const content = item.querySelector(".planner-calendar-item__content");

        return {
          rows: content?.children.length ?? 0,
          hasProjectInTopline: Boolean(
            item.querySelector(".planner-calendar-item__topline .planner-calendar-item__project"),
          ),
          hasProjectInRightRail: Boolean(
            item.querySelector(".planner-calendar-item__right .planner-calendar-item__project"),
          ),
          hasMiddleProjectRow: Boolean(
            item.querySelector(".planner-calendar-item__content > .planner-calendar-item__project"),
          ),
        };
      }),
    )
    .toEqual({
      rows: 2,
      hasProjectInTopline: true,
      hasProjectInRightRail: true,
      hasMiddleProjectRow: false,
    });
  const statusCalendarItem = page
    .locator(".planner-calendar-item", { hasText: "Strength session" })
    .first();
  await expect
    .poll(async () =>
      statusCalendarItem.evaluate((item) => ({
        statusBeforeProject: (() => {
          const status = item.querySelector(".planner-calendar-item__status");
          const project = item.querySelector(".planner-calendar-item__project");
          return status && project
            ? Boolean(status.compareDocumentPosition(project) & Node.DOCUMENT_POSITION_FOLLOWING)
            : false;
        })(),
        rightRailStartsAfterCenter: (() => {
          const rect = item.getBoundingClientRect();
          const status = item.querySelector(".planner-calendar-item__status");
          const statusRect = status?.getBoundingClientRect();
          return statusRect ? statusRect.left >= rect.left + rect.width / 2 - 1 : false;
        })(),
      })),
    )
    .toEqual({
      statusBeforeProject: true,
      rightRailStartsAfterCenter: true,
    });
  await expect
    .poll(async () =>
      page.getByTestId("planning-column-list").evaluate((columnList) => {
        const scroller = columnList.parentElement;
        return scroller ? scroller.scrollHeight <= scroller.clientHeight + 1 : false;
      }),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      page
        .getByTestId("planning-column-todo")
        .evaluate((column) => Math.round(column.getBoundingClientRect().width)),
    )
    .toBeLessThanOrEqual(290);

  await page.getByRole("button", { name: "Open Task Flow full screen" }).click();
  await expect(page.locator(".planning-kanban-panel.is-fullscreen")).toBeVisible();
  await expect(page.getByTestId("planning-fit-toggle")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("planning-column-todo").getByRole("button", { name: "Add Task" }).click();
  await expect(page.locator(".planning-kanban-panel.is-fullscreen")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "New task" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "New task" })).toHaveCount(0);

  await page.getByRole("button", { name: "Open Task Flow full screen" }).click();
  await expect(page.locator(".planning-kanban-panel.is-fullscreen")).toBeVisible();
  await page.getByRole("button", { name: "Exit Task Flow full screen" }).click();
  await expect(page.locator(".planning-kanban-panel.is-fullscreen")).toHaveCount(0);
  await expect(page.getByTestId("planning-fit-toggle")).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Open calendar full screen" }).click();
  await expect(page.locator(".planning-schedule-panel.is-fullscreen")).toBeVisible();
  await page.keyboard.press("Control+Alt+Shift+N");
  await expect(page.locator(".planning-schedule-panel.is-fullscreen")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "New task" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "New task" })).toHaveCount(0);

  await page.getByTestId("planning-new-column").click();
  const columnInput = page.getByLabel("Column name");
  await expect(columnInput).toHaveValue("Custom Column 1");
  await columnInput.fill("QA Review");
  await columnInput.press("Enter");
  await expect(
    page.locator('[data-planning-column="true"]').filter({ hasText: "QA Review" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Rename To Do" }).click();
  await expect(columnInput).toHaveValue("To Do");
  await columnInput.fill("Backlog");
  await columnInput.press("Enter");
  await expect(page.getByTestId("planning-column-todo").locator("h3")).toHaveText("Backlog");

  await page.getByTestId("planning-new-column").click();
  await expect(columnInput).toHaveValue("Custom Column 1");
  await columnInput.press("Enter");
  await page.getByRole("button", { name: "Delete Custom Column 1" }).click();
  await expect(
    page.locator('[data-planning-column="true"]').filter({ hasText: "Custom Column 1" }),
  ).toHaveCount(0);

  const columnDrag = await page.evaluateHandle(() => new DataTransfer());
  const qaColumn = page.locator('[data-planning-column="true"]').filter({
    hasText: "QA Review",
  });
  await qaColumn
    .locator('[data-testid^="planning-column-grip-"]')
    .dispatchEvent("dragstart", { dataTransfer: columnDrag });
  await page
    .getByTestId("planning-column-todo")
    .dispatchEvent("dragover", { dataTransfer: columnDrag });
  await page
    .getByTestId("planning-column-todo")
    .dispatchEvent("drop", { dataTransfer: columnDrag });
  await qaColumn
    .locator('[data-testid^="planning-column-grip-"]')
    .dispatchEvent("dragend", { dataTransfer: columnDrag });

  await expect(
    page.locator('[data-planning-column="true"]').first().locator("h3"),
  ).toHaveText("QA Review");

  await page.getByRole("button", { name: "Create Task" }).click();
  await page.getByLabel("Task name").fill("Review lane planning task");
  await page.getByLabel("Estimated minutes").fill("45");
  await page.getByRole("button", { name: "Start soon" }).click();
  await page.getByRole("button", { name: "Add to inbox" }).click();
  await expect(page.getByText("Added to your planner").first()).toBeVisible();

  const createdTask = await waitForTask("Review lane planning task");
  await expect(page.getByTestId(`planning-card-${createdTask.id}`)).toBeVisible();

  const taskDrag = await page.evaluateHandle(() => new DataTransfer());
  await page
    .getByTestId(`planning-card-${createdTask.id}`)
    .dispatchEvent("dragstart", { dataTransfer: taskDrag });
  await page
    .getByTestId("planning-column-review")
    .dispatchEvent("dragover", { dataTransfer: taskDrag });
  await page
    .getByTestId("planning-column-review")
    .dispatchEvent("drop", { dataTransfer: taskDrag });
  await page
    .getByTestId(`planning-card-${createdTask.id}`)
    .dispatchEvent("dragend", { dataTransfer: taskDrag });

  await expect(
    page
      .getByTestId("planning-column-review")
      .getByTestId(`planning-card-${createdTask.id}`),
  ).toBeVisible();

  await expect
    .poll(async () => {
      const snapshotAfterReviewDrop = await readSnapshot();
      return snapshotAfterReviewDrop.tasks.find((task) => task.id === createdTask.id)?.status;
    })
    .toBe("review");

  await page.reload();
  await page.getByRole("button", { name: "Planning", exact: true }).click();

  await expect(
    page.locator('[data-planning-column="true"]').first().locator("h3"),
  ).toHaveText("QA Review");
  await expect(
    page
      .getByTestId("planning-column-review")
      .getByTestId(`planning-card-${createdTask.id}`),
  ).toBeVisible();

  await page.getByTestId("planning-collapse-toggle").click();
  await expect(page.getByTestId("planning-column-list")).toHaveCount(0);
  await expect(page.locator(".fc").first()).toBeVisible();

  await page.getByTestId("planning-collapse-toggle").click();
  await expect(page.getByTestId("planning-column-list")).toBeVisible();
});

test("calendar detail editors resync task and event schedule changes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Planning", exact: true }).click();

  const taskCalendarItem = page.locator(".planner-calendar-item", {
    hasText: "Outline the planner onboarding",
  }).first();
  await expect(taskCalendarItem).toBeVisible();
  const taskBoxBefore = await taskCalendarItem.boundingBox();
  expect(taskBoxBefore).not.toBeNull();
  await taskCalendarItem.dblclick();

  const taskDialog = page.getByRole("dialog", { name: "Task details" });
  await expect(taskDialog).toBeVisible();
  await taskDialog
    .locator("label")
    .filter({ hasText: /^Start/ })
    .getByRole("button")
    .click();
  await page
    .locator('[data-slot="popover-content"]')
    .last()
    .locator('input[type="time"]')
    .fill("12:00");

  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      const block = snapshot.taskBlocks.find((item) => item.id === "block-outline");
      return block ? localTimeInNewYork(block.startsAt) : null;
    })
    .toBe("12:00");
  await expect(taskDialog.getByText("All changes saved")).toBeVisible();

  const taskBoxAfter = await page.locator(".planner-calendar-item", {
    hasText: "Outline the planner onboarding",
  }).first().boundingBox();
  expect(taskBoxAfter).not.toBeNull();
  expect(taskBoxAfter!.y).toBeGreaterThan(taskBoxBefore!.y + 80);
  await taskDialog.getByLabel("Close details").click();

  const eventCalendarItem = page.locator(".planner-calendar-item", {
    hasText: "Project review",
  }).first();
  await expect(eventCalendarItem).toBeVisible();
  const eventBoxBefore = await eventCalendarItem.boundingBox();
  expect(eventBoxBefore).not.toBeNull();
  await eventCalendarItem.dblclick();

  const eventDialog = page.getByRole("dialog", { name: "Event details" });
  await expect(eventDialog).toBeVisible();
  await eventDialog
    .locator("label")
    .filter({ hasText: /^Start/ })
    .getByRole("button")
    .click();
  await page
    .locator('[data-slot="popover-content"]')
    .last()
    .locator('input[type="time"]')
    .fill("16:00");
  await eventDialog
    .locator("label")
    .filter({ hasText: /^End/ })
    .getByRole("button")
    .click();
  await page
    .locator('[data-slot="popover-content"]')
    .last()
    .locator('input[type="time"]')
    .fill("17:00");
  await eventDialog.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByText("Event updated").first()).toBeVisible();

  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      const event = snapshot.events.find((item) => item.id === "event-review");
      return event
        ? {
            startsAt: localTimeInNewYork(event.startsAt),
            endsAt: localTimeInNewYork(event.endsAt),
          }
        : null;
    })
    .toEqual({ startsAt: "16:00", endsAt: "17:00" });

  const eventBoxAfter = await page.locator(".planner-calendar-item", {
    hasText: "Project review",
  }).first().boundingBox();
  expect(eventBoxAfter).not.toBeNull();
  expect(eventBoxAfter!.y).toBeGreaterThan(eventBoxBefore!.y + 80);
  await eventDialog.getByLabel("Close details").click();

  await page.locator(".planner-calendar-item", { hasText: "Project review" }).first().dblclick();
  const reopenedEventDialog = page.getByRole("dialog", { name: "Event details" });
  await expect(
    reopenedEventDialog
      .locator("label")
      .filter({ hasText: /^Start/ })
      .getByRole("button"),
  ).toContainText("4:00 PM");
});

test("calendar task and event resize handles span the bottom edge", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Planning", exact: true }).click();

  const taskMetrics = await readCalendarResizeMetrics(
    page,
    "planner-task-event",
    "Outline the planner onboarding",
  );
  const eventMetrics = await readCalendarResizeMetrics(
    page,
    "planner-meeting-event",
    "Project review",
  );

  for (const metrics of [taskMetrics, eventMetrics]) {
    expect(metrics).not.toBeNull();
    expect(metrics!.cursor).toBe("ns-resize");
    expect(metrics!.handleWidth).toBeGreaterThan(metrics!.eventWidth * 0.74);
    expect(metrics!.handleHeight).toBeGreaterThanOrEqual(12);
    expect(metrics!.leftInset).toBeLessThanOrEqual(12);
    expect(metrics!.rightInset).toBeLessThanOrEqual(12);
    expect(Math.abs(metrics!.bottomInset)).toBeLessThanOrEqual(2);
    expect(metrics!.bottomRuleHeight).toBeGreaterThanOrEqual(2);
    expect(metrics!.gripWidth).toBeGreaterThanOrEqual(20);
  }
});

test("calendar event starts and restored focus completions play chimes", async ({
  page,
  request,
}) => {
  await installChimeSpy(page);
  const now = Date.now();

  await request.post("/api/events", {
    data: {
      title: "Immediate event chime",
      notes: "Regression coverage for event sound notifications.",
      location: "",
      startsAt: new Date(now - 10_000).toISOString(),
      endsAt: new Date(now + 30 * 60_000).toISOString(),
    },
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Planning", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        return (
          window as typeof window & { __inflaraChimeStarts?: number }
        ).__inflaraChimeStarts ?? 0;
      }),
    )
    .toBeGreaterThanOrEqual(3);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem(
          "inflara:planning:demo:demo-user:calendar-item-sounds:v2",
        );
        return raw ? JSON.parse(raw).some((key: string) => key.startsWith("event:")) : false;
      }),
    )
    .toBe(true);
});

test("focus sessions chime when a persisted running phase finishes", async ({ page }) => {
  const updatedAt = new Date(Date.now() - 2_500).toISOString();

  await installChimeSpy(page);
  await page.addInitScript((sessionUpdatedAt) => {
    window.localStorage.setItem(
      "inflara:focus:demo:demo-user:session:v1",
      JSON.stringify({
        version: 1,
        selectedTaskId: "task-plan",
        selectedProfileId: "dynamic",
        profileName: "Dynamic Flow",
        customFocusMinutes: 38,
        customBreakMinutes: 5,
        customLongBreakMinutes: 15,
        customRounds: 4,
        phaseIndex: 0,
        remainingSeconds: 1,
        running: true,
        phases: [
          {
            id: "focus-1",
            kind: "focus",
            label: "Work 1",
            minutes: 25,
          },
          {
            id: "break-1",
            kind: "break",
            label: "Break 1",
            minutes: 5,
          },
        ],
        updatedAt: sessionUpdatedAt,
      }),
    );
  }, updatedAt);

  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => {
        return (
          window as typeof window & { __inflaraChimeStarts?: number }
        ).__inflaraChimeStarts ?? 0;
      }),
    )
    .toBeGreaterThanOrEqual(3);
});

test("AI daily planner generates draft schedules and applies them to the calendar", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Planning", exact: true }).click();

  const initialSnapshot = await readSnapshot();
  const initialBlockCount = initialSnapshot.taskBlocks.length;
  const initialBreakEventCount = initialSnapshot.events.filter(
    (event) => event.title === "Break",
  ).length;

  await page.getByTestId("ai-planner-mode-standard").click();
  await expect(page.getByTestId("ai-planner-scheduled-task-choice")).toBeVisible();
  await page.getByTestId("ai-planner-preserve-scheduled").click();
  await expect(page.getByTestId("ai-planner-timeline")).toBeVisible();
  await expect(page.getByText("Apply Plan")).toBeVisible();

  await page.getByTestId("ai-planner-apply").click();
  await expect(page.getByText("AI plan applied to schedule").first()).toBeVisible();
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.taskBlocks.length;
    })
    .toBeGreaterThan(initialBlockCount);
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.events.filter((event) => event.title === "Break").length;
    })
    .toBeGreaterThan(initialBreakEventCount);

  await page.getByTestId("ai-planner-mode-custom").click();
  await expect(page.getByTestId("ai-planner-custom-form")).toBeVisible();
  await page.getByLabel("Intensity").fill("lighter schedule");
  await page.getByLabel("Prioritize").fill("urgent deadlines");
  await page.getByLabel("Avoid").fill("cleanup");
  await page.getByLabel("Session length").fill("45");
  await page
    .getByTestId("ai-planner-custom-form")
    .getByRole("button", { name: "Generate" })
    .click();
  await expect(page.getByTestId("ai-planner-timeline")).toBeVisible();
});

test("AI daily planner uses the Task Flow project filter", async ({ page }) => {
  let dailyPlanRequest: {
    date: string;
    tasks: Array<{ id: string; projectId: string | null }>;
    projects: Array<{ id: string }>;
    projectPlans: Array<{ project: { id: string } }>;
    scheduledItems: Array<{ source: string; taskId?: string }>;
  } | null = null;

  await page.route("**/api/ai/daily-plan", async (route) => {
    dailyPlanRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        planning_mode: "standard",
        summary: "Filtered project plan",
        generated_at: "2026-01-15T14:00:00.000Z",
        date: dailyPlanRequest?.date ?? "2026-01-15",
        schedule: [],
        warnings: [],
        postponed_tasks: [],
        alternatives: [],
        explanation_summary: "Only selected project tasks were considered.",
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Planning", exact: true }).click();

  const taskFlowProjectFilter = page.getByRole("button", {
    name: "Filter Task Flow by project",
  });
  await expect(taskFlowProjectFilter).toBeVisible();
  await taskFlowProjectFilter.click();
  await page
    .getByTestId("task-flow-project-filter-menu")
    .getByRole("checkbox", { name: "Planner MVP" })
    .uncheck();
  await expect(taskFlowProjectFilter).toContainText("Training Block");

  const requestPromise = page.waitForRequest(
    (request) =>
      request.url().includes("/api/ai/daily-plan") && request.method() === "POST",
  );
  await page.getByTestId("ai-planner-mode-standard").click();

  if (
    await page
      .getByTestId("ai-planner-scheduled-task-choice")
      .isVisible({ timeout: 1000 })
      .catch(() => false)
  ) {
    await page.getByTestId("ai-planner-preserve-scheduled").click();
  }

  await requestPromise;
  await expect(page.getByTestId("ai-planner-timeline")).toBeVisible();

  expect(dailyPlanRequest).not.toBeNull();
  expect(dailyPlanRequest!.tasks.length).toBeGreaterThan(0);
  expect(
    dailyPlanRequest!.tasks.every((task) => task.projectId === "project-wellness"),
  ).toBe(true);
  expect(dailyPlanRequest!.projects.map((project) => project.id)).toEqual([
    "project-wellness",
  ]);
  expect(dailyPlanRequest!.projectPlans.map((plan) => plan.project.id)).toEqual([
    "project-wellness",
  ]);
  expect(
    dailyPlanRequest!.scheduledItems.some(
      (item) => item.source === "task" && item.taskId === "task-plan",
    ),
  ).toBe(true);
});

test("AI daily planner fallback starts today after now and applies profile spacing", async ({
  request,
}) => {
  const timezone = "UTC";
  const date = "2026-01-15";
  const currentTime = "2026-01-15T14:17:00.000Z";
  const workHours = Object.fromEntries(
    Array.from({ length: 7 }, (_, day) => [day, { start: "00:00", end: "23:59" }]),
  );
  const baseRequest = {
    date,
    timezone,
    currentTime,
    projects: [],
    milestones: [],
    projectPlans: [],
    scheduledItems: [],
    capacity: [],
    settings: {
      workHours,
      timezone,
      slotMinutes: 30,
      weekStart: 1,
      theme: "system",
    },
    dependencies: [],
    tasks: [
      {
        id: "task-current-one",
        title: "Current day task one",
        priority: "high",
        estimatedMinutes: 25,
        dueAt: null,
        status: "todo",
        availability: "ready",
        areaId: null,
        projectId: null,
      },
      {
        id: "task-current-two",
        title: "Current day task two",
        priority: "medium",
        estimatedMinutes: 25,
        dueAt: null,
        status: "todo",
        availability: "ready",
        areaId: null,
        projectId: null,
      },
    ],
  };

  const standardResponse = await request.post("/api/ai/daily-plan", {
    data: {
      ...baseRequest,
      planningMode: "standard",
    },
  });
  const standard = await expectJson<{
    schedule: Array<{ start_time: string; end_time: string; type: string }>;
  }>(standardResponse, 200);
  const firstFocusBlock = standard.schedule.find((block) => block.type === "focus_block");
  expect(firstFocusBlock).toBeTruthy();
  expect(timeToMinutes(firstFocusBlock!.start_time)).toBeGreaterThanOrEqual(
    timeToMinutes("14:20"),
  );

  const chillResponse = await request.post("/api/ai/daily-plan", {
    data: {
      ...baseRequest,
      date: "2026-01-16",
      planningMode: "chill",
    },
  });
  const chill = await expectJson<{
    schedule: Array<{ start_time: string; end_time: string; type: string }>;
  }>(chillResponse, 200);
  const firstBreak = chill.schedule.find((block) => block.type === "break");
  expect(firstBreak).toBeTruthy();
  expect(
    timeToMinutes(firstBreak!.end_time) - timeToMinutes(firstBreak!.start_time),
  ).toBeGreaterThanOrEqual(20);

  const pastDateResponse = await request.post("/api/ai/daily-plan", {
    data: {
      ...baseRequest,
      date: "2026-01-14",
      planningMode: "standard",
    },
  });
  const pastDatePlan = await expectJson<{
    schedule: Array<{ start_time: string; end_time: string; type: string }>;
  }>(pastDateResponse, 200);
  expect(pastDatePlan.schedule).toHaveLength(0);
});

test("AI daily planner fallback avoids overlapping calendar events", async ({
  request,
}) => {
  const timezone = "UTC";
  const date = "2026-01-15";
  const response = await request.post("/api/ai/daily-plan", {
    data: {
      planningMode: "standard",
      date,
      timezone,
      currentTime: "2026-01-15T14:00:00.000Z",
      projects: [],
      milestones: [],
      projectPlans: [],
      capacity: [],
      settings: {
        workHours: {
          0: { start: "14:00", end: "17:00" },
          1: { start: "14:00", end: "17:00" },
          2: { start: "14:00", end: "17:00" },
          3: { start: "14:00", end: "17:00" },
          4: { start: "14:00", end: "17:00" },
          5: { start: "14:00", end: "17:00" },
          6: { start: "14:00", end: "17:00" },
        },
        timezone,
        slotMinutes: 30,
        weekStart: 1,
        theme: "system",
      },
      dependencies: [],
      scheduledItems: [
        {
          id: "event-block",
          sourceId: "event-block",
          instanceId: "event-block",
          source: "event",
          title: "Calendar event",
          start: "2026-01-15T14:50:00.000Z",
          end: "2026-01-15T15:45:00.000Z",
          notes: "",
        },
      ],
      tasks: [
        {
          id: "task-event-one",
          title: "Task before meeting",
          priority: "high",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
        },
        {
          id: "task-event-two",
          title: "Task after meeting",
          priority: "high",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
        },
        {
          id: "task-event-three",
          title: "Another task after meeting",
          priority: "medium",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
        },
      ],
    },
  });
  const payload = await expectJson<{
    schedule: Array<{ start_time: string; end_time: string; type: string }>;
  }>(response, 200);
  const blockedStart = timeToMinutes("14:50");
  const blockedEnd = timeToMinutes("15:45");

  for (const block of payload.schedule.filter((entry) => entry.type === "focus_block")) {
    expect(
      timeToMinutes(block.end_time) <= blockedStart ||
        timeToMinutes(block.start_time) >= blockedEnd,
    ).toBeTruthy();
  }
});

test("AI daily planner fallback avoids tasks already scheduled on the calendar", async ({
  request,
}) => {
  const timezone = "UTC";
  const date = "2026-01-15";
  const response = await request.post("/api/ai/daily-plan", {
    data: {
      planningMode: "standard",
      date,
      timezone,
      currentTime: "2026-01-15T14:00:00.000Z",
      projects: [],
      milestones: [],
      projectPlans: [],
      capacity: [],
      settings: {
        workHours: {
          0: { start: "14:00", end: "17:00" },
          1: { start: "14:00", end: "17:00" },
          2: { start: "14:00", end: "17:00" },
          3: { start: "14:00", end: "17:00" },
          4: { start: "14:00", end: "17:00" },
          5: { start: "14:00", end: "17:00" },
          6: { start: "14:00", end: "17:00" },
        },
        timezone,
        slotMinutes: 30,
        weekStart: 1,
        theme: "system",
      },
      dependencies: [],
      scheduledItems: [
        {
          id: "task-block",
          sourceId: "task-block",
          instanceId: "task-block",
          source: "task",
          taskId: "task-already-scheduled",
          title: "Already scheduled task",
          start: "2026-01-15T14:30:00.000Z",
          end: "2026-01-15T15:15:00.000Z",
          notes: "",
        },
      ],
      tasks: [
        {
          id: "task-already-scheduled",
          title: "Already scheduled task",
          priority: "critical",
          estimatedMinutes: 45,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
          hasBlock: true,
        },
        {
          id: "task-open-one",
          title: "Open task one",
          priority: "high",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
          hasBlock: false,
        },
        {
          id: "task-open-two",
          title: "Open task two",
          priority: "medium",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
          hasBlock: false,
        },
      ],
    },
  });
  const payload = await expectJson<{
    schedule: Array<{
      start_time: string;
      end_time: string;
      type: string;
      task_id: string | null;
    }>;
  }>(response, 200);
  const blockedStart = timeToMinutes("14:30");
  const blockedEnd = timeToMinutes("15:15");

  expect(
    payload.schedule.some((block) => block.task_id === "task-already-scheduled"),
  ).toBe(false);

  for (const block of payload.schedule.filter((entry) => entry.type === "focus_block")) {
    expect(
      timeToMinutes(block.end_time) <= blockedStart ||
        timeToMinutes(block.start_time) >= blockedEnd,
    ).toBeTruthy();
  }
});

test("AI daily planner fallback schedules prerequisite tasks first", async ({
  request,
}) => {
  const timezone = "UTC";
  const date = "2026-01-15";
  const response = await request.post("/api/ai/daily-plan", {
    data: {
      planningMode: "standard",
      date,
      timezone,
      currentTime: "2026-01-15T14:00:00.000Z",
      projects: [],
      milestones: [],
      projectPlans: [],
      capacity: [],
      settings: {
        workHours: {
          0: { start: "14:00", end: "17:00" },
          1: { start: "14:00", end: "17:00" },
          2: { start: "14:00", end: "17:00" },
          3: { start: "14:00", end: "17:00" },
          4: { start: "14:00", end: "17:00" },
          5: { start: "14:00", end: "17:00" },
          6: { start: "14:00", end: "17:00" },
        },
        timezone,
        slotMinutes: 30,
        weekStart: 1,
        theme: "system",
      },
      dependencies: [
        {
          taskId: "task-score-model",
          dependsOnTaskId: "task-train-model",
          type: "blocks",
        },
      ],
      scheduledItems: [],
      tasks: [
        {
          id: "task-score-model",
          title: "Score model",
          priority: "critical",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
          dependencyIds: ["task-train-model"],
        },
        {
          id: "task-train-model",
          title: "Train model",
          priority: "low",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
          dependencyIds: [],
        },
      ],
    },
  });
  const payload = await expectJson<{
    schedule: Array<{
      type: string;
      task_id: string | null;
      start_time: string;
    }>;
  }>(response, 200);
  const focusTaskIds = payload.schedule
    .filter((block) => block.type === "focus_block")
    .map((block) => block.task_id);

  expect(focusTaskIds.indexOf("task-train-model")).toBeGreaterThanOrEqual(0);
  expect(focusTaskIds.indexOf("task-score-model")).toBeGreaterThanOrEqual(0);
  expect(focusTaskIds.indexOf("task-train-model")).toBeLessThan(
    focusTaskIds.indexOf("task-score-model"),
  );
});

test("AI daily planner fallback can rearrange future scheduled tasks by request", async ({
  request,
}) => {
  const timezone = "UTC";
  const date = "2026-01-15";
  const response = await request.post("/api/ai/daily-plan", {
    data: {
      planningMode: "standard",
      scheduledTaskHandling: "rearrange_future",
      date,
      timezone,
      currentTime: "2026-01-15T14:00:00.000Z",
      projects: [],
      milestones: [],
      projectPlans: [],
      capacity: [],
      settings: {
        workHours: {
          0: { start: "14:00", end: "17:00" },
          1: { start: "14:00", end: "17:00" },
          2: { start: "14:00", end: "17:00" },
          3: { start: "14:00", end: "17:00" },
          4: { start: "14:00", end: "17:00" },
          5: { start: "14:00", end: "17:00" },
          6: { start: "14:00", end: "17:00" },
        },
        timezone,
        slotMinutes: 30,
        weekStart: 1,
        theme: "system",
      },
      dependencies: [],
      scheduledItems: [
        {
          id: "event-block",
          sourceId: "event-block",
          instanceId: "event-block",
          source: "event",
          title: "Calendar event",
          start: "2026-01-15T14:45:00.000Z",
          end: "2026-01-15T15:15:00.000Z",
          notes: "",
        },
        {
          id: "future-task-block",
          sourceId: "future-task-block",
          instanceId: "future-task-block",
          source: "task",
          taskId: "task-future",
          title: "Future scheduled task",
          start: "2026-01-15T16:00:00.000Z",
          end: "2026-01-15T16:30:00.000Z",
          status: "todo",
          notes: "",
        },
      ],
      tasks: [
        {
          id: "task-future",
          title: "Future scheduled task",
          priority: "critical",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
          hasBlock: true,
        },
        {
          id: "task-open",
          title: "Open task",
          priority: "high",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
          hasBlock: false,
        },
      ],
    },
  });
  const payload = await expectJson<{
    schedule: Array<{
      start_time: string;
      end_time: string;
      type: string;
      task_id: string | null;
    }>;
  }>(response, 200);
  const focusBlocks = payload.schedule.filter((entry) => entry.type === "focus_block");
  const blockedStart = timeToMinutes("14:45");
  const blockedEnd = timeToMinutes("15:15");

  expect(focusBlocks.some((block) => block.task_id === "task-future")).toBe(true);

  for (const block of focusBlocks) {
    expect(
      timeToMinutes(block.end_time) <= blockedStart ||
        timeToMinutes(block.start_time) >= blockedEnd,
    ).toBeTruthy();
  }
});

test("AI daily planner fallback reschedules unfinished tasks from earlier today", async ({
  request,
}) => {
  const timezone = "UTC";
  const date = "2026-01-15";
  const response = await request.post("/api/ai/daily-plan", {
    data: {
      planningMode: "standard",
      date,
      timezone,
      currentTime: "2026-01-15T14:44:00.000Z",
      projects: [],
      milestones: [],
      projectPlans: [],
      capacity: [],
      settings: {
        workHours: {
          0: { start: "14:00", end: "18:00" },
          1: { start: "14:00", end: "18:00" },
          2: { start: "14:00", end: "18:00" },
          3: { start: "14:00", end: "18:00" },
          4: { start: "14:00", end: "18:00" },
          5: { start: "14:00", end: "18:00" },
          6: { start: "14:00", end: "18:00" },
        },
        timezone,
        slotMinutes: 30,
        weekStart: 1,
        theme: "system",
      },
      dependencies: [],
      scheduledItems: [
        {
          id: "missed-task-block",
          sourceId: "missed-task-block",
          instanceId: "missed-task-block",
          source: "task",
          taskId: "task-missed",
          title: "Missed unfinished task",
          start: "2026-01-15T13:00:00.000Z",
          end: "2026-01-15T13:45:00.000Z",
          status: "todo",
          notes: "",
        },
        {
          id: "future-task-block",
          sourceId: "future-task-block",
          instanceId: "future-task-block",
          source: "task",
          taskId: "task-future",
          title: "Future scheduled task",
          start: "2026-01-15T16:00:00.000Z",
          end: "2026-01-15T16:30:00.000Z",
          status: "todo",
          notes: "",
        },
      ],
      tasks: [
        {
          id: "task-missed",
          title: "Missed unfinished task",
          priority: "critical",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
          hasBlock: true,
        },
        {
          id: "task-future",
          title: "Future scheduled task",
          priority: "critical",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
          hasBlock: true,
        },
        {
          id: "task-open",
          title: "Open task",
          priority: "medium",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
          hasBlock: false,
        },
      ],
    },
  });
  const payload = await expectJson<{
    schedule: Array<{
      start_time: string;
      end_time: string;
      type: string;
      task_id: string | null;
    }>;
  }>(response, 200);
  const focusBlocks = payload.schedule.filter((entry) => entry.type === "focus_block");

  expect(focusBlocks.some((block) => block.task_id === "task-missed")).toBe(true);
  expect(focusBlocks.some((block) => block.task_id === "task-future")).toBe(false);

  for (const block of focusBlocks) {
    expect(timeToMinutes(block.start_time)).toBeGreaterThanOrEqual(timeToMinutes("14:45"));
    expect(
      timeToMinutes(block.end_time) <= timeToMinutes("16:00") ||
        timeToMinutes(block.start_time) >= timeToMinutes("16:30"),
    ).toBeTruthy();
  }
});

test("AI daily planner fallback respects events that spill into the selected day", async ({
  request,
}) => {
  const timezone = "UTC";
  const date = "2026-01-15";
  const response = await request.post("/api/ai/daily-plan", {
    data: {
      planningMode: "standard",
      date,
      timezone,
      currentTime: "2026-01-15T00:00:00.000Z",
      projects: [],
      milestones: [],
      projectPlans: [],
      capacity: [],
      settings: {
        workHours: {
          0: { start: "00:00", end: "02:00" },
          1: { start: "00:00", end: "02:00" },
          2: { start: "00:00", end: "02:00" },
          3: { start: "00:00", end: "02:00" },
          4: { start: "00:00", end: "02:00" },
          5: { start: "00:00", end: "02:00" },
          6: { start: "00:00", end: "02:00" },
        },
        timezone,
        slotMinutes: 30,
        weekStart: 1,
        theme: "system",
      },
      dependencies: [],
      scheduledItems: [
        {
          id: "event-overnight",
          sourceId: "event-overnight",
          instanceId: "event-overnight",
          source: "event",
          title: "Overnight event",
          start: "2026-01-14T23:50:00.000Z",
          end: "2026-01-15T00:45:00.000Z",
          notes: "",
        },
      ],
      tasks: [
        {
          id: "task-after-overnight-one",
          title: "Task after overnight event",
          priority: "high",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
        },
        {
          id: "task-after-overnight-two",
          title: "Second task after overnight event",
          priority: "medium",
          estimatedMinutes: 30,
          dueAt: null,
          status: "todo",
          availability: "ready",
          areaId: null,
          projectId: null,
        },
      ],
    },
  });
  const payload = await expectJson<{
    schedule: Array<{ start_time: string; end_time: string; type: string }>;
  }>(response, 200);
  const firstFocusBlock = payload.schedule.find((block) => block.type === "focus_block");

  expect(firstFocusBlock).toBeTruthy();
  expect(timeToMinutes(firstFocusBlock!.start_time)).toBeGreaterThanOrEqual(
    timeToMinutes("00:45"),
  );
});

test("quick add creates unscheduled tasks and pipeline status edits persist", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Create Task" }).click();
  await expect(page.getByRole("heading", { name: "New task" })).toBeVisible();
  await page.getByLabel("Task name").fill("Redesign QA task");
  await page.getByLabel("Notes").fill("Check the new left-rail planner flow.");
  await page.getByLabel("Estimated minutes").fill("75");
  await page.getByRole("button", { name: "Add to inbox" }).click();
  await expect(page.getByText("Added to your planner").first()).toBeVisible();

  const createdTask = await waitForTask("Redesign QA task");
  const snapshot = await readSnapshot();
  expect(snapshot.taskBlocks.some((block) => block.taskId === createdTask.id)).toBe(false);
  expect(snapshot.tasks.find((task) => task.id === createdTask.id)?.availability).toBe("later");

  await page.getByRole("button", { name: /Inbox/ }).click();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.getByText("Redesign QA task")).toBeVisible();
  await expect(page.getByText("Later").first()).toBeVisible();

  await page.getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.getByTestId(`planning-card-${createdTask.id}`)).toHaveCount(0);

  await page.getByRole("button", { name: /Inbox/ }).click();
  await page.getByText("Redesign QA task").click();
  await page
    .getByRole("dialog", { name: "Task details" })
    .getByRole("button", { name: "Start soon", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Save task" })).toHaveCount(0);

  await expect
    .poll(async () => {
      const latest = await readSnapshot();
      return latest.tasks.find((task) => task.id === createdTask.id)?.availability ?? null;
    })
    .toBe("ready");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.getByTestId(`planning-card-${createdTask.id}`)).toBeVisible();

  await page.getByTestId(`planning-card-${createdTask.id}`).click();
  await page.getByRole("button", { name: "In progress", exact: true }).click();

  await expect
    .poll(async () => {
      const latest = await readSnapshot();
      return latest.tasks.find((task) => task.id === createdTask.id)?.status ?? null;
    })
    .toBe("in_progress");
});

test("quick add project and area updates the left rail", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator("aside");

  await sidebar.getByLabel("Add area").click();
  await page.getByLabel("Area name").fill("Operations");
  await page
    .getByTestId("quick-add-dialog")
    .getByRole("button", { name: "Add area" })
    .click();
  await expect(page.getByText("Added to your planner").first()).toBeVisible();

  const area = await waitForArea("Operations");
  await page.getByRole("button", { name: "Operations" }).click();
  await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();

  await sidebar.getByLabel("Add project").click();
  await page.getByLabel("Project name").fill("Flow Audit");
  await page.getByTestId("quick-add-dialog").getByLabel("Area").selectOption(area.id);
  await page
    .getByTestId("quick-add-dialog")
    .getByRole("button", { name: "Add project" })
    .click();
  await expect(page.getByText("Added to your planner").first()).toBeVisible();

  const project = await waitForProject("Flow Audit");
  expect(project.areaId).toBe(area.id);

  await page.getByRole("button", { name: "Flow Audit" }).click();
  await expect(page.locator("main h1", { hasText: "Flow Audit" })).toBeVisible();
});

test("scheduled quick add creates a task block and settings persist", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Create Task" }).click();
  await page.getByRole("button", { name: "Schedule now" }).click();
  await page.getByLabel("Task name").fill("Scheduled redesign check");
  await page.getByRole("button", { name: "Add to calendar" }).click();
  await expect(page.getByText("Added to your planner").first()).toBeVisible();

  const scheduledTask = await waitForTask("Scheduled redesign check");
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.taskBlocks.some((block) => block.taskId === scheduledTask.id);
    })
    .toBe(true);

  await page.getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.getByTestId(`planning-card-${scheduledTask.id}`)).toHaveCount(1);

  await page.getByTestId(`planning-card-${scheduledTask.id}`).click();
  const scheduledTaskDialog = page.getByRole("dialog", { name: "Task details" });
  await scheduledTaskDialog.getByRole("button", { name: "Later", exact: true }).click();
  await expect
    .poll(async () => {
      const latest = await readSnapshot();
      return latest.tasks.find((task) => task.id === scheduledTask.id)?.availability ?? null;
    })
    .toBe("later");
  await expect(
    scheduledTaskDialog.getByRole("button", { name: "Later", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await scheduledTaskDialog
    .getByRole("checkbox", { name: /Outline the planner onboarding/ })
    .check();
  await expect
    .poll(async () => {
      const latest = await readSnapshot();
      return latest.taskDependencies.some(
        (dependency) =>
          dependency.taskId === scheduledTask.id &&
          dependency.dependsOnTaskId === "task-outline",
      );
    })
    .toBe(true);
  await expect(scheduledTaskDialog.getByText("All changes saved")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId(`planning-card-${scheduledTask.id}`).click();
  await expect(
    page
      .getByRole("dialog", { name: "Task details" })
      .getByRole("button", { name: "Later", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("dialog", { name: "Task details" }).getByText("All changes saved"),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Calendar slot size").selectOption("60");
  await page.getByLabel("Week starts on").selectOption("0");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Planning settings updated").first()).toBeVisible();

  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.settings;
    })
    .toMatchObject({
      slotMinutes: 60,
      weekStart: 0,
    });
});
