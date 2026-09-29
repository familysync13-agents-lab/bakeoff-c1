import "server-only";
import { nextCookies } from "better-auth/next-js";
import { createAuth, type Auth } from "./auth";
import { createDatabase, type DatabaseHandle } from "./db/client";
import { getServerConfig } from "./config";

const globalForApp = globalThis as typeof globalThis & { __appDatabase?: DatabaseHandle; __appAuth?: Auth };

/** Process-wide database handle for the web server. */
export function getDatabase(): DatabaseHandle {
  globalForApp.__appDatabase ??= createDatabase(getServerConfig().databaseUrl);
  return globalForApp.__appDatabase;
}

/** Process-wide Better Auth instance for the web server (sets session cookies from Server Actions). */
export function getAuth(): Auth {
  if (!globalForApp.__appAuth) {
    const config = getServerConfig();
    globalForApp.__appAuth = createAuth(getDatabase().db, {
      secret: config.appSecret ?? "",
      baseURL: config.appUrl,
      plugins: [nextCookies()],
    });
  }
  return globalForApp.__appAuth;
}
