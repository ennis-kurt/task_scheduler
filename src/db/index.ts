import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/lib/env";
import * as schema from "@/db/schema";

export function getDb() {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = neon(env.databaseUrl);

  return drizzle(client, { schema });
}
