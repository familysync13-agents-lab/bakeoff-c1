import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createAuth } from "../auth";
import { createDatabase } from "../db/client";
import { seedUsers } from "./seed";

export interface SetupOptions {
  databaseUrl: string;
  secret: string;
  baseURL?: string;
  migrationsFolder: string;
}

// Arbitrary constant key: serialises concurrent setup runs against the same database.
const SETUP_LOCK_KEY = 7_300_000_001;

/** Applies all pending migrations and the seed. Both steps are idempotent and run under a database advisory lock. */
export async function setupDatabase(options: SetupOptions): Promise<void> {
  const { db, pool } = createDatabase(options.databaseUrl);
  const lock = await pool.connect();
  try {
    await lock.query("select pg_advisory_lock($1)", [SETUP_LOCK_KEY]);
    try {
      await migrate(db, { migrationsFolder: options.migrationsFolder });
      await seedUsers(db, createAuth(db, { secret: options.secret, baseURL: options.baseURL }));
    } finally {
      await lock.query("select pg_advisory_unlock($1)", [SETUP_LOCK_KEY]);
    }
  } finally {
    lock.release();
    await pool.end();
  }
}
