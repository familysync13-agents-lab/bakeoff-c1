import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "./db/client";
import { schema } from "./db/schema";

export interface AuthOptions {
  secret: string;
  baseURL?: string;
}

export function createAuth(db: Database, options: AuthOptions) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
    secret: options.secret,
    baseURL: options.baseURL || undefined,
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
