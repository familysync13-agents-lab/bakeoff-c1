// Container start step: apply database migrations and the seed, then exit (the web server starts afterwards).
import path from "node:path";
import { setupDatabase } from "../src/server/setup";

const ATTEMPTS = 30;
const RETRY_DELAY_MS = 2_000;

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function main(): Promise<void> {
  const started = Date.now();
  const options = {
    databaseUrl: process.env.DATABASE_URL ?? "",
    secret: process.env.APP_SECRET ?? "",
    baseURL: process.env.APP_URL,
    migrationsFolder: path.resolve(process.env.MIGRATIONS_DIR ?? "drizzle"),
  };
  // The database may still be starting when the container starts: retry for about a minute before giving up.
  for (let attempt = 1; ; attempt++) {
    try {
      await setupDatabase(options);
      break;
    } catch (error) {
      if (attempt >= ATTEMPTS) throw error;
      console.error(`[setup] attempt ${attempt} failed (${message(error)}); retrying`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  console.log(`[setup] migrations and seed applied in ${Date.now() - started} ms`);
}

main().catch((error: unknown) => {
  console.error("[setup] failed:", message(error));
  process.exit(1);
});
