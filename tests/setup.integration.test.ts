import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "@/server/auth";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { getHealth } from "@/server/health";
import { setupDatabase } from "@/server/setup";
import { SEED_USERS } from "@/server/setup/seed";
import { resetDatabase, testDatabaseUrl } from "./support/db";

const url = testDatabaseUrl();
const secret = "test".repeat(8);
const options = {
  databaseUrl: url,
  secret,
  baseURL: "http://localhost:8080",
  migrationsFolder: path.resolve("drizzle"),
};
let handle: DatabaseHandle;

beforeAll(async () => {
  await resetDatabase(url);
  handle = createDatabase(url);
});

afterAll(async () => {
  await handle?.pool.end();
  const shared = (globalThis as { __appDatabase?: DatabaseHandle }).__appDatabase;
  await shared?.pool.end();
});

describe("database setup (migrations + seed)", () => {
  it("migrates an empty database and creates exactly the two seed users", async () => {
    await setupDatabase(options);
    expect(await getHealth(handle.db, "test")).toEqual({ status: "ok", env: "test", users: 2 });
  });

  it("is idempotent across restarts, including concurrent runs", async () => {
    await setupDatabase(options);
    await Promise.all([setupDatabase(options), setupDatabase(options)]);
    expect((await getHealth(handle.db, "test")).users).toBe(2);
  });

  it("seeds users who can sign in with their contract passwords (and not with a wrong one)", async () => {
    const auth = createAuth(handle.db, { secret, baseURL: options.baseURL });
    for (const seed of SEED_USERS) {
      const result = await auth.api.signInEmail({ body: { email: seed.email, password: seed.password } });
      expect(result.user.email).toBe(seed.email);
      expect(result.user.name).toBe(seed.name);
    }
    await expect(
      auth.api.signInEmail({ body: { email: SEED_USERS[0].email, password: "wrong-password" } }),
    ).rejects.toThrow();
  });
});

describe("GET /healthz", () => {
  it("returns 200 JSON with status, APP_ENV and the user count", async () => {
    const { GET } = await import("@/app/healthz/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({ status: "ok", env: "test", users: 2 });
  });
});
