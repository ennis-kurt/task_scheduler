import { auth, currentUser } from "@clerk/nextjs/server";

import { isClerkConfigured } from "@/lib/env";

export type SessionUserProfile = {
  email: string | null;
  fullName: string | null;
};

export type SessionContext = {
  clerkConfigured: boolean;
  mode: "clerk" | "demo";
  userId: string | null;
  email: string | null;
  fullName: string | null;
};

function getFullName(parts: Array<string | null | undefined>) {
  const name = parts.filter(Boolean).join(" ").trim();
  return name.length ? name : null;
}

async function getClerkUserProfile(): Promise<SessionUserProfile> {
  const user = await currentUser();

  if (!user) {
    return {
      email: null,
      fullName: null,
    };
  }

  const primaryEmail =
    user.emailAddresses.find((candidate) => candidate.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null;

  return {
    email: primaryEmail,
    fullName: getFullName([user.firstName, user.lastName]) ?? user.username ?? primaryEmail,
  };
}

export async function getSessionUserProfile(): Promise<SessionUserProfile> {
  if (!isClerkConfigured()) {
    return {
      email: "demo@inflara.local",
      fullName: "Demo User",
    };
  }

  const session = await auth();

  if (!session.userId) {
    return {
      email: null,
      fullName: null,
    };
  }

  return getClerkUserProfile();
}

export async function getSessionContext(): Promise<SessionContext> {
  if (!isClerkConfigured()) {
    return {
      clerkConfigured: false,
      mode: "demo",
      userId: "demo-user",
      email: "demo@inflara.local",
      fullName: "Demo User",
    };
  }

  const session = await auth();
  const profile = session.userId
    ? await getClerkUserProfile()
    : {
        email: null,
        fullName: null,
      };

  return {
    clerkConfigured: true,
    mode: "clerk",
    userId: session.userId ?? null,
    email: profile.email,
    fullName: profile.fullName,
  };
}

export async function requireUserId() {
  const session = await getSessionContext();

  if (!session.userId) {
    throw new Error("UNAUTHORIZED");
  }

  return session.userId;
}
