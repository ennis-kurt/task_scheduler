import { expect, test } from "@playwright/test";

test("public landing page shows conversion copy and product mockups", async ({ page }) => {
  await page.goto("/landing");

  await expect(
    page.getByRole("heading", {
      name: "Plan the day, brief the agents, keep the calendar honest.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Build today's plan" })).toHaveAttribute(
    "href",
    "/sign-up",
  );
  await expect(page.getByRole("link", { name: "See the workspace" })).toHaveAttribute(
    "href",
    "#planner",
  );
  await expect(page.getByText("AI Daily Planner")).toBeVisible();
  await expect(page.getByText("Agent ready")).toBeVisible();
  await expect(page.getByText("Handoff memory")).toBeVisible();
});

test("public landing page fits a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/landing");

  await expect(page.getByRole("link", { name: "Start planning" }).first()).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});
