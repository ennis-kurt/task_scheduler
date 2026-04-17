import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

const demoStorePath = path.join(process.cwd(), "data", ".planner-demo-store.json");

type DemoSnapshot = {
  tasks: Array<{
    id: string;
    title: string;
  }>;
  taskBlocks: Array<{
    id: string;
    taskId: string;
    startsAt: string;
    endsAt: string;
  }>;
  events: Array<{
    id: string;
    title: string;
    startsAt: string;
  }>;
};

async function resetDemoStore() {
  await rm(demoStorePath, { force: true });
}

async function readSnapshot() {
  return JSON.parse(await readFile(demoStorePath, "utf8")) as DemoSnapshot;
}

async function dragBetween(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error("Could not resolve drag coordinates.");
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 30 },
  );
  await page.mouse.up();
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

async function waitForTaskBlock(taskId: string) {
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.taskBlocks.find((block) => block.taskId === taskId) ?? null;
    })
    .not.toBeNull();

  const snapshot = await readSnapshot();
  return snapshot.taskBlocks.find((block) => block.taskId === taskId)!;
}

test.beforeEach(async () => {
  await resetDemoStore();
});

test("new task quick add stays unscheduled until times are set", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New task" }).first().click();

  await expect(page.getByText("Decide later or place it now")).toBeVisible();
  await expect(page.getByLabel("Scheduled start")).toHaveCount(0);
  await expect(page.getByLabel("Scheduled end")).toHaveCount(0);

  await page.getByLabel("Task name").fill("Inbox capture");
  await page.getByLabel("Notes").fill("Should remain in the queue.");
  await page.getByRole("button", { name: "Add to inbox" }).click();

  await expect(page.getByText("Added to your planner").first()).toBeVisible();
  const createdTask = await waitForTask("Inbox capture");
  const snapshot = await readSnapshot();

  expect(snapshot.taskBlocks.some((block) => block.taskId === createdTask.id)).toBe(false);
  await expect(page.getByTestId(`queue-card-${createdTask.id}`)).toBeVisible();
});

test("agenda day cards are clickable and overdue tasks can be rescheduled from the queue", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("surface-agenda").click();

  const snapshot = await readSnapshot();
  const todayAgendaDate = snapshot.taskBlocks.find((block) => block.id === "block-plan")!.startsAt.slice(0, 10);
  const reviewDate = snapshot.events.find((event) => event.id === "event-review")!.startsAt.slice(0, 10);

  await expect(page.getByText("Project review")).toHaveCount(0);
  await page.getByTestId(`agenda-day-${reviewDate}`).click();
  await expect(page.locator(".planner-meeting-event", { hasText: "Project review" })).toBeVisible();

  await page.getByTestId("queue-overdue").click();
  const overdueHandle = page.locator(
    '[data-draggable-queue-task="true"][data-task-id="task-review"]',
  );
  const fourPmSlot = page.locator('.fc-timegrid-slot-lane[data-time="16:00:00"]').first();

  await page.getByTestId(`agenda-day-${todayAgendaDate}`).click();
  await expect(overdueHandle).toBeVisible();
  await dragBetween(page, overdueHandle, fourPmSlot);
  await expect(page.getByText("Task scheduled").first()).toBeVisible();

  const createdBlock = await waitForTaskBlock("task-review");
  expect(createdBlock.taskId).toBe("task-review");
});

test("queue search and shortcuts remain discoverable", async ({ page }) => {
  await page.goto("/");

  const search = page.getByRole("textbox", { name: "Search task queue" });
  await search.fill("no-match");
  await expect(page.getByText("No tasks match this search")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByTestId("queue-card-task-gym")).toBeVisible();

  await page.keyboard.press("Shift+/");
  await expect(page.getByText("Move faster")).toBeVisible();
  await expect(page.getByText("Jump to today")).toBeVisible();
  await expect(page.getByText("Focus inbox search")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText("Move faster")).toHaveCount(0);

  await page.keyboard.press("a");
  await expect(page.locator('[data-testid^="agenda-day-"]').first()).toBeVisible();
});

test("mobile planner opens the agenda and keeps queue actions reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByLabel("Go to previous dates")).toBeVisible();
  await expect(page.getByLabel("Go to next dates")).toBeVisible();
  await expect(page.locator('[data-testid^="agenda-day-"]').first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Shortcuts" })).toBeVisible();

  await page.getByRole("button", { name: "Shortcuts" }).click();
  await expect(page.getByText("Move faster")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId("queue-unscheduled").click();
  await page.getByRole("button", { name: "Place next" }).first().click();
  await expect(page.getByText(/Task scheduled|Task rescheduled/).first()).toBeVisible();
});

test("127.0.0.1 dev origin keeps planner interactions live", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000");

  await page.getByTestId("surface-agenda").click();
  await expect(page.locator('[data-testid^="agenda-day-"]').first()).toBeVisible();

  await page.getByTestId("surface-day").click();
  await expect(page.getByTestId("kanban-column-todo")).toBeVisible();

  await page.getByTestId("queue-overdue").click();
  await expect(page.getByRole("heading", { name: "Overdue work" })).toBeVisible();
});
