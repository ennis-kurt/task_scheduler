import { expect, test, type Page } from "@playwright/test";
import { rm } from "node:fs/promises";
import path from "node:path";

const demoStorePath = path.join(process.cwd(), "data", ".planner-demo-store.json");

async function resetDemoStore() {
  await rm(demoStorePath, { force: true });
}

async function expectNoPageHorizontalOverflow(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    )
    .toBe(true);
}

async function scrollElementToBottom(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
}

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test.beforeEach(async () => {
  await resetDemoStore();
});

test("mobile demo shell exposes navigation and core planning/project views", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("mobile-open-nav")).toBeVisible();
  await expect(page.getByText("Inflara").first()).toBeVisible();

  await page.getByTestId("mobile-open-nav").click();
  const mobileNav = page.getByTestId("mobile-navigation");
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole("button", { name: "Planning" })).toBeVisible();
  await expect(mobileNav.getByRole("button", { name: "Focus" })).toBeVisible();
  await expect(mobileNav.getByRole("button", { name: "Planner MVP" })).toBeVisible();

  await mobileNav.getByRole("button", { name: "Planning" }).click();
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Planning", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Task Flow" })).toBeVisible();
  await expect(page.getByTestId("planning-workload")).toBeVisible();
  await expect(page.getByTestId("planning-mobile-tabs")).toBeVisible();
  await expect(page.getByTestId("planning-kanban")).toBeVisible();
  await expect(page.getByTestId("planning-schedule")).toBeHidden();
  await page.getByTestId("planning-mobile-tab-schedule").click();
  await expect(page.getByTestId("planning-schedule")).toBeVisible();
  await expect(page.getByTestId("planning-kanban")).toBeHidden();
  await expect(page.locator(".fc").first()).toBeVisible();
  await page.locator(".planning-calendar-shell").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByTestId("planning-mobile-tab-task-flow").click();
  await expect(page.getByTestId("planning-kanban")).toBeVisible();
  await expect(page.getByTestId("planning-schedule")).toBeHidden();
  await expectNoPageHorizontalOverflow(page);

  await page.getByTestId("mobile-open-nav").click();
  await page.getByTestId("mobile-navigation").getByRole("button", { name: "Focus" }).click();
  await expect(page.getByTestId("focus-view")).toBeVisible();
  await expect(page.getByTestId("focus-task-menu")).toBeVisible();
  await page.getByTestId("focus-task-category-todo").click();
  await expect(page.getByText("Review overdue follow-ups").first()).toBeVisible();
  await expectNoPageHorizontalOverflow(page);

  await page.getByTestId("mobile-open-nav").click();
  await page.getByTestId("mobile-navigation").getByRole("button", { name: "Planner MVP" }).click();
  await expect(page.getByRole("button", { name: "Project Design" })).toBeVisible();
  await expect(page.getByText("Milestones & Tasks")).toBeVisible();
  await expectNoPageHorizontalOverflow(page);

  await page.getByRole("button", { name: "Gantt Chart" }).click();
  const ganttPanel = page.getByTestId("project-gantt-panel");
  const ganttScroll = page.getByTestId("project-gantt-scroll");
  await expect(ganttPanel).toBeVisible();
  await expect(ganttScroll).toBeVisible();
  await expect(page.getByTestId("project-gantt-label-header")).toBeVisible();
  await expect
    .poll(async () =>
      ganttPanel.evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      ganttPanel.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        return element.scrollTop;
      }),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      ganttScroll.evaluate((element) => element.scrollWidth > element.clientWidth),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      page
        .getByTestId("project-gantt-label-header")
        .evaluate((element) => window.getComputedStyle(element).position),
    )
    .toBe("static");
  await expect
    .poll(async () =>
      ganttScroll.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
        return element.scrollLeft;
      }),
    )
    .toBeGreaterThan(0);
  await expectNoPageHorizontalOverflow(page);

  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(page.getByTestId("project-dashboard")).toBeVisible();
  await expect
    .poll(async () => scrollElementToBottom(page, "project-dashboard"))
    .toBeGreaterThan(0);
  await expect(page.getByText("Timeline Summary")).toBeVisible();
  await expectNoPageHorizontalOverflow(page);

  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByTestId("project-notes")).toBeVisible();
  await expect(page.getByTestId("project-note-rich-surface")).toBeVisible();
  await expectNoPageHorizontalOverflow(page);
});

test("mobile quick actions open creation and settings dialogs", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByTestId("quick-add-dialog")).toBeVisible();
  await page.getByTestId("quick-add-dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("quick-add-dialog")).toHaveCount(0);

  await page.getByTestId("mobile-open-nav").click();
  await page.getByTestId("mobile-navigation").getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Planning settings" })).toBeVisible();
});
