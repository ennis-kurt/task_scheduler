import { expect, test } from "@playwright/test";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

const demoStorePath = path.join(process.cwd(), "data", ".planner-demo-store.json");

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

async function resetDemoStore() {
  await rm(demoStorePath, { force: true });
}

async function readSnapshot() {
  return JSON.parse(await readFile(demoStorePath, "utf8")) as DemoSnapshot;
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

  await expect(page.getByText("INFLARA").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Planner MVP" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Planning", exact: true })).toBeVisible();
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
  await expect(page.getByText("Task Flow")).toBeVisible();
  await expect(page.getByTestId("planning-workload")).toBeVisible();
  await expect(page.locator(".fc").first()).toBeVisible();

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
  await expect(page.getByText("Collaboration")).toBeVisible();
});

test("project notes support markdown blocks, comments, and local persistence", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("aside").getByRole("button", { name: "Planner MVP", exact: true }).click();
  await page.getByRole("button", { name: "Notes" }).click();

  await expect(page.getByTestId("project-notes")).toBeVisible();
  await page.getByTestId("project-note-title").fill("Architecture Notes");

  const firstBlockContainer = page.getByTestId("project-note-block-0");
  await firstBlockContainer.click();
  const firstBlock = firstBlockContainer.getByRole("textbox");
  await firstBlock.fill("# Launch Readiness");
  await expect(firstBlock).toHaveValue("Launch Readiness");

  const paragraphBlockContainer = page.getByTestId("project-note-block-1");
  await paragraphBlockContainer.click();
  const paragraphBlock = paragraphBlockContainer.getByRole("textbox");
  await paragraphBlock.fill("First paragraph");
  await paragraphBlock.press("Enter");
  await paragraphBlock.type("Second paragraph with **bold** and *italic* text.");
  await expect(paragraphBlock).toHaveValue(
    "First paragraph\nSecond paragraph with **bold** and *italic* text.",
  );

  await page.getByTestId("project-note-title").click();
  await expect(paragraphBlockContainer.locator("strong").filter({ hasText: "bold" })).toHaveCount(1);
  await expect(paragraphBlockContainer.locator("em").filter({ hasText: "italic" })).toHaveCount(1);

  await page.getByTestId("project-note-comment-input").fill("Add rollout risks to this note.");
  await page.getByRole("button", { name: "Send comment" }).click();
  await expect(page.getByText("Add rollout risks to this note.")).toBeVisible();

  await page.reload();
  await page.locator("aside").getByRole("button", { name: "Planner MVP", exact: true }).click();
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByTestId("project-note-title")).toHaveValue("Architecture Notes");
  await expect(page.getByTestId("project-note-block-0")).toContainText("Launch Readiness");
  await expect(page.getByText("Add rollout risks to this note.")).toBeVisible();
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

  await page.getByRole("button", { name: /Inbox/ }).click();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.getByText("Redesign QA task")).toBeVisible();

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
