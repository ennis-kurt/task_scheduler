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
  tasks: Array<{
    id: string;
    title: string;
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
  await expect(page.getByRole("button", { name: "Planning" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capacity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Task" })).toBeVisible();
  await expect(page.getByText("Welcome back")).toHaveCount(0);
});

test("left rail navigates planning, inbox, capacity, areas, and project tabs", async ({
  page,
}) => {
  await page.goto("/");
  const sidebar = page.locator("aside");

  await page.getByRole("button", { name: "Planning" }).click();
  await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();
  await expect(page.getByText("Unscheduled Tasks & Pipeline")).toBeVisible();
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

  await page.getByRole("button", { name: "Planning" }).click();
  await expect(page.getByTestId(`planning-card-${createdTask.id}`)).toBeVisible();

  await page.getByTestId(`planning-card-${createdTask.id}`).click();
  await page.getByRole("button", { name: "In progress" }).click();
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
