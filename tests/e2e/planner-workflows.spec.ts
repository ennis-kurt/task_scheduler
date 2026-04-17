import { expect, test, type Locator, type Page } from "@playwright/test";
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
  tags: Array<{
    id: string;
    name: string;
  }>;
  taskTags: Array<{
    taskId: string;
    tagId: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    notes: string;
    priority: string;
    estimatedMinutes: number;
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
  events: Array<{
    id: string;
    title: string;
    location: string;
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

function toDateTimeInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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

async function waitForEvent(title: string) {
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.events.find((event) => event.title === title) ?? null;
    })
    .not.toBeNull();

  const snapshot = await readSnapshot();
  return snapshot.events.find((event) => event.title === title)!;
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

test("task workflow supports editing, agenda scheduling, board status changes, and unscheduling", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New task" }).first().click();
  await page.getByLabel("Task name").fill("Lifecycle task");
  await page.getByLabel("Notes").fill("Initial planner lifecycle coverage.");
  await page.getByLabel("Estimated minutes").fill("90");
  await page.getByRole("button", { name: "Add to inbox" }).click();

  await expect(page.getByText("Added to your planner").first()).toBeVisible();
  const createdTask = await waitForTask("Lifecycle task");

  await page.getByTestId(`queue-card-${createdTask.id}`).click();
  await expect(
    page.getByText("Calendar drag updates the schedule immediately."),
  ).toHaveCount(0);

  await page.getByLabel("Task name").fill("Lifecycle task refined");
  await page.getByLabel("Notes").fill("Edited before scheduling.");
  await page.getByRole("button", { name: "In progress" }).click();
  await page.getByLabel("Priority").selectOption("critical");
  await page.getByLabel("Estimated duration").fill("105");
  await page.getByRole("button", { name: "Save task" }).click();

  await expect(page.getByText("Task updated").first()).toBeVisible();
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.tasks.find((task) => task.id === createdTask.id) ?? null;
    })
    .toMatchObject({
      title: "Lifecycle task refined",
      notes: "Edited before scheduling.",
      priority: "critical",
      estimatedMinutes: 105,
      status: "in_progress",
    });

  await page.getByRole("button", { name: /^Close$/ }).last().click();
  await page.getByTestId("surface-agenda").click();

  const queueHandle = page.locator(
    `[data-draggable-queue-task="true"][data-task-id="${createdTask.id}"]`,
  );
  const sixPmSlot = page.locator('.fc-timegrid-slot-lane[data-time="18:00:00"]').first();

  await dragBetween(page, queueHandle, sixPmSlot);
  await expect(page.getByText("Task scheduled").first()).toBeVisible();

  await waitForTaskBlock(createdTask.id);
  const scheduledEvent = page.locator(".planner-task-event", {
    hasText: "Lifecycle task refined",
  });
  await expect(scheduledEvent).toBeVisible();

  await page.getByTestId("surface-week").click();
  const weekCard = page.getByTestId(`kanban-card-${createdTask.id}`);
  const doneColumn = page.getByTestId("kanban-column-done");

  await expect(weekCard).toBeVisible();
  await dragBetween(page, weekCard, doneColumn);
  await expect(page.getByText("Task marked done").first()).toBeVisible();

  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.tasks.find((task) => task.id === createdTask.id)?.status ?? null;
    })
    .toBe("done");

  await page.getByTestId(`kanban-card-${createdTask.id}`).click();
  await page.getByRole("button", { name: "To do" }).click();
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("Task updated").first()).toBeVisible();

  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.tasks.find((task) => task.id === createdTask.id)?.status ?? null;
    })
    .toBe("todo");

  await page.getByRole("button", { name: "Move to queue" }).click();
  await expect(page.getByText("Task moved back to inbox").first()).toBeVisible();

  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.taskBlocks.some((block) => block.taskId === createdTask.id);
    })
    .toBe(false);

  await page.getByRole("button", { name: /^Close$/ }).last().click();
  await expect(page.getByTestId(`queue-card-${createdTask.id}`)).toBeVisible();
});

test("day board only shows tasks for the selected day", async ({ page }) => {
  await page.goto("/");

  const tomorrowStart = new Date();
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(10, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setHours(11, 0, 0, 0);

  await page.getByRole("button", { name: "New task" }).first().click();
  await page.getByRole("button", { name: "Schedule now" }).click();
  await page.getByLabel("Task name").fill("Tomorrow-only task");
  await page.getByLabel("Scheduled start").fill(toDateTimeInput(tomorrowStart));
  await page.getByLabel("Scheduled end").fill(toDateTimeInput(tomorrowEnd));
  await page.getByRole("button", { name: "Add to calendar" }).click();
  await expect(page.getByText("Added to your planner").first()).toBeVisible();

  const createdTask = await waitForTask("Tomorrow-only task");

  await page.getByTestId("surface-day").click();
  await expect(page.getByTestId(`kanban-card-${createdTask.id}`)).toHaveCount(0);

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByTestId(`kanban-card-${createdTask.id}`)).toBeVisible();
});

test("taxonomy, event editing, and settings updates persist through the planner", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Area" }).click();
  await page.getByLabel("Area name").fill("Operations");
  await page.getByRole("button", { name: "Add area" }).click();
  await expect(page.getByText("Added to your planner").first()).toBeVisible();

  await page.getByRole("button", { name: "Project" }).click();
  await page.getByLabel("Project name").fill("Flow Audit");
  await page.getByLabel("Area").selectOption({ label: "Operations" });
  await page.getByRole("button", { name: "Add project" }).click();
  await expect(page.getByText("Added to your planner").first()).toBeVisible();

  await page.getByRole("button", { name: "Tag" }).click();
  await page.getByLabel("Tag name").fill("QA Sweep");
  await page.getByRole("button", { name: "Add tag" }).click();
  await expect(page.getByText("Added to your planner").first()).toBeVisible();

  await page.getByRole("button", { name: "New task" }).first().click();
  await page.getByLabel("Task name").fill("Taxonomy task");
  await page.getByRole("button", { name: "Add to inbox" }).click();
  await expect(page.getByText("Added to your planner").first()).toBeVisible();

  const taxonomyTask = await waitForTask("Taxonomy task");
  await page.getByTestId(`queue-card-${taxonomyTask.id}`).click();
  await page.getByLabel("Area").selectOption({ label: "Operations" });
  await page.getByLabel("Project").selectOption({ label: "Flow Audit" });
  await page.getByRole("button", { name: "QA Sweep", exact: true }).click();
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("Task updated").first()).toBeVisible();

  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      const area = snapshot.areas.find((item) => item.name === "Operations");
      const project = snapshot.projects.find((item) => item.name === "Flow Audit");
      const tag = snapshot.tags.find((item) => item.name === "QA Sweep");
      const task = snapshot.tasks.find((item) => item.id === taxonomyTask.id);
      const taskTag = tag
        ? snapshot.taskTags.some(
            (item) => item.taskId === taxonomyTask.id && item.tagId === tag.id,
          )
        : false;

      return {
        areaId: task?.areaId ?? null,
        projectId: task?.projectId ?? null,
        taskTag,
        expectedAreaId: area?.id ?? null,
        expectedProjectId: project?.id ?? null,
      };
    })
    .toMatchObject({
      areaId: expect.any(String),
      projectId: expect.any(String),
      taskTag: true,
      expectedAreaId: expect.any(String),
      expectedProjectId: expect.any(String),
    });

  await page.getByRole("button", { name: /^Close$/ }).last().click();
  await page.getByRole("button", { name: "New event" }).first().click();
  await page.getByLabel("Event name").fill("Manual review window");
  await page.getByLabel("Location").fill("Desk");
  await page.getByLabel("Notes").fill("Reserved focus time.");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByText("Added to your planner").first()).toBeVisible();

  const createdEvent = await waitForEvent("Manual review window");
  await page.getByTestId("surface-agenda").click();
  await page.getByTestId(`agenda-day-${createdEvent.startsAt.slice(0, 10)}`).click();
  await page.locator(".planner-meeting-event", { hasText: "Manual review window" }).click();

  await page.getByLabel("Title").fill("Manual review block");
  await page.getByLabel("Location").fill("Studio");
  await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByText("Event updated").first()).toBeVisible();

  await expect
    .poll(async () => {
      const snapshot = await readSnapshot();
      return snapshot.events.find((event) => event.id === createdEvent.id) ?? null;
    })
    .toMatchObject({
      title: "Manual review block",
      location: "Studio",
    });

  await page.getByRole("button", { name: /^Close$/ }).last().click();
  await page.getByRole("button", { name: "Planner settings" }).click();
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
