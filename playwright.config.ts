import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: {
      width: 1440,
      height: 2000,
    },
    timezoneId: "America/New_York",
  },
  webServer: {
    command: "pnpm dev",
    env: {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: "",
      DATABASE_URL: "",
      PLANNER_DEMO_STORE_PATH: ".planner-demo-store.json",
    },
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
