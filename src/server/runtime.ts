import "server-only";
import { createDatabase, type DatabaseHandle } from "./db/client";
import { getServerConfig } from "./config";

const globalForDb = globalThis as typeof globalThis & { __appDatabase?: DatabaseHandle };

/** Process-wide database handle for the web server. */
export function getDatabase(): DatabaseHandle {
  globalForDb.__appDatabase ??= createDatabase(getServerConfig().databaseUrl);
  return globalForDb.__appDatabase;
}
