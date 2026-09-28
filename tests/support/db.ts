import { Pool } from "pg";

/** The test database from the check-stage environment. Refuses to run outside APP_ENV=test (tests reset the schema). */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (process.env.APP_ENV !== "test") throw new Error("integration tests require APP_ENV=test");
  if (!url) throw new Error("integration tests require DATABASE_URL (an empty PostgreSQL database)");
  return url;
}

export async function resetDatabase(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("drop schema public cascade");
    await pool.query("create schema public");
  } finally {
    await pool.end();
  }
}
