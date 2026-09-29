import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "./db/client";
import { schema } from "./db/schema";

export interface AuthOptions {
  secret: string;
  baseURL?: string;
  /** Framework integrations (e.g. Next.js cookie handling); only the web server passes these. */
  plugins?: BetterAuthPlugin[];
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function createAuth(db: Database, options: AuthOptions) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    },
    secret: options.secret,
    baseURL: options.baseURL || undefined,
    // Secure (HTTPS-only) cookies exactly when the app is served over HTTPS; previews run on plain HTTP.
    advanced: { useSecureCookies: (options.baseURL ?? "").startsWith("https://") },
    plugins: options.plugins ?? [],
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
