import { auth } from "@clerk/nextjs/server";

import { isClerkConfigured } from "@/lib/env";

export type SessionContext = {
  clerkConfigured: boolean;
  mode: "clerk" | "demo";
  userId: string | null;
};

export async function getSessionContext(): Promise<SessionContext> {
  if (!isClerkConfigured()) {
    return {
      clerkConfigured: false,
      mode: "demo",
      userId: "demo-user",
    };
  }

  const session = await auth();

  return {
    clerkConfigured: true,
    mode: "clerk",
    userId: session.userId ?? null,
  };
}

export async function requireUserId() {
  const session = await getSessionContext();

  if (!session.userId) {
    throw new Error("UNAUTHORIZED");
  }

  return session.userId;
}
