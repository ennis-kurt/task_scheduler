import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
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
    status: "todo" | "in_progress" | "done";
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
};

type AgentTokenResponse = {
  token: string;
  record: {
    id: string;
    name: string;
    tokenPrefix: string;
    revokedAt: string | null;
  };
};

type ApiEnvelope<T> = {
  data: T;
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

async function createAgentToken(
  request: APIRequestContext,
  name = "E2E remote agent",
) {
  const response = await request.post("/api/access-tokens", {
    data: { name },
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

test("project notes support markdown blocks, comments, and cloud persistence", async ({
  browser,
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("inflara:project-notes:project-launch")) {
        window.localStorage.removeItem(key);
      }
    }
  });
  await page.reload();
  await page.locator("aside").getByRole("button", { name: "Planner MVP", exact: true }).click();
  await page.getByRole("button", { name: "Notes" }).click();

  await expect(page.getByTestId("project-notes")).toBeVisible();
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

  page.once("dialog", (dialog) => dialog.accept("Evidence"));
  await page.getByRole("button", { name: "Create subsection in Manual Research" }).click();
  await expect(page.getByRole("button", { name: "Evidence", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Create note in Manual Research" }).click();
  await page.getByTestId("project-note-title").fill("Research Note");
  await page.getByTestId("project-note-rich-surface").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("Research content inside a manual section.");
  await expect(page.getByRole("button", { name: "Research Note", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Create note page", exact: true }).click();
  await page.getByTestId("project-note-title").fill("Drag Me Note");
  await page.getByTestId("project-note-rich-surface").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("This note will be moved into Manual Research.");
  const dragMeNote = page.locator('[data-note-kind="note"][data-note-title="Drag Me Note"]');
  await expect(dragMeNote).toBeAttached();
  await dragMeNote.scrollIntoViewIfNeeded();

  await dragMeNote.dragTo(
    page.locator('[data-note-kind="section"][data-note-title="Manual Research"]'),
  );

  await expect
    .poll(async () => {
      const response = await request.get("/api/projects/project-launch/notes");
      const pages = (await response.json()) as Array<{
        id: string;
        kind: string;
        title: string;
        sectionId: string | null;
        parentSectionId: string | null;
      }>;
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
    title: string;
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

  await dialog.getByLabel("Token name").fill("UI E2E agent");
  await dialog.getByRole("button", { name: "Create token" }).click();
  await expect(dialog.getByText("Copy this token now. It will only be shown once.")).toBeVisible();
  const tokenInput = dialog.getByLabel("New API token");
  await expect(tokenInput).toHaveValue(/^ifl_/);
  const generatedToken = await tokenInput.inputValue();

  let response = await request.get("/api/v1/projects", {
    headers: bearerHeaders(generatedToken),
  });
  await expectJson<ApiEnvelope<{ projects: Array<{ id: string }> }>>(response, 200);

  await dialog.getByRole("button", { name: "Close details" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Settings" }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "Planning settings" });
  await expect(reopenedDialog.getByText("UI E2E agent")).toBeVisible();
  await expect(reopenedDialog.getByLabel("New API token")).toHaveCount(0);

  await reopenedDialog.getByRole("button", { name: "Revoke token UI E2E agent" }).click();
  await expect(reopenedDialog.getByText("Revoked")).toBeVisible();

  response = await request.get("/api/v1/projects", {
    headers: bearerHeaders(generatedToken),
  });
  await expectJson<{ error: { code: string } }>(response, 401);
});

test("project design inline date, status, and priority controls persist without full editors", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("aside").getByRole("button", { name: "Planner MVP", exact: true }).click();
  await expect(page.getByRole("button", { name: "Project Design" })).toBeVisible();
  await expect(page.getByTestId("project-task-row-task-kickoff")).toBeVisible();
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

  const snapshotAfterReviewDrop = await readSnapshot();
  expect(
    snapshotAfterReviewDrop.tasks.find((task) => task.id === createdTask.id)?.status,
  ).toBe("todo");

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

test("AI daily planner generates draft schedules and applies them to the calendar", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Planning", exact: true }).click();

  const initialBlockCount = (await readSnapshot()).taskBlocks.length;

  await page.getByTestId("ai-planner-mode-standard").click();
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
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("Task updated").first()).toBeVisible();
  await page.keyboard.press("Escape");

  await expect
    .poll(async () => {
      const latest = await readSnapshot();
      return latest.tasks.find((task) => task.id === createdTask.id)?.availability ?? null;
    })
    .toBe("ready");

  await page.getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.getByTestId(`planning-card-${createdTask.id}`)).toBeVisible();

  await page.getByTestId(`planning-card-${createdTask.id}`).click();
  await page.getByRole("button", { name: "In progress", exact: true }).click();
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("Task updated").first()).toBeVisible();

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
