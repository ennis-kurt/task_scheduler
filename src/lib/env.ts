export const env = {
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  demoStorePath:
    process.env.PLANNER_DEMO_STORE_PATH ??
    ".planner-demo-store.json",
};

export function isClerkConfigured() {
  return Boolean(env.clerkPublishableKey && env.clerkSecretKey);
}

export function isDatabaseConfigured() {
  return Boolean(env.databaseUrl);
}
