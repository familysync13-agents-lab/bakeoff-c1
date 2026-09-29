import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuth, type Auth } from "@/server/auth";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { setupDatabase } from "@/server/setup";
import { resetDatabase, testDatabaseUrl } from "./support/db";

const current = vi.hoisted(() => ({ auth: null as unknown }));
vi.mock("@/server/runtime", () => ({ getAuth: () => current.auth }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { signIn, signUp } = await import("@/app/actions/auth");

const url = testDatabaseUrl();
let handle: DatabaseHandle;
let auth: Auth;

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};
const redirectOf = async <T>(promise: Promise<T>): Promise<{ state?: T; digest?: string }> => {
  try {
    return { state: await promise };
  } catch (error) {
    return { digest: String((error as { digest?: unknown }).digest) };
  }
};

beforeAll(async () => {
  await resetDatabase(url);
  await setupDatabase({
    databaseUrl: url,
    secret: "test".repeat(8),
    baseURL: "http://localhost:8080",
    migrationsFolder: path.resolve("drizzle"),
  });
  handle = createDatabase(url);
  auth = createAuth(handle.db, { secret: "test".repeat(8), baseURL: "http://localhost:8080" });
  current.auth = auth;
});

afterAll(async () => {
  await handle?.pool.end();
});

describe("sign in", () => {
  it("redirects the seeded user to /lists with the correct password", async () => {
    const result = await redirectOf(signIn({}, form({ email: "Alice@example.test", password: "Correct-Horse-1" })));
    expect(result.digest).toContain("/lists");
  });

  it("reports invalid credentials without signing in", async () => {
    for (const fields of [
      { email: "alice@example.test", password: "Wrong-Password-1" },
      { email: "nobody@example.test", password: "Correct-Horse-1" },
      { email: "", password: "" },
    ]) {
      const result = await redirectOf(signIn({}, form(fields)));
      expect(result.state?.error).toContain("Invalid");
    }
  });
});

describe("sign up", () => {
  it("creates the account and redirects to /lists; the new user can sign in", async () => {
    const fields = { name: "Carol", email: "carol@example.test", password: "Carol-Password-3" };
    expect((await redirectOf(signUp({}, form(fields)))).digest).toContain("/lists");
    const session = await auth.api.signInEmail({ body: { email: fields.email, password: fields.password } });
    expect(session.user.name).toBe("Carol");
  });

  it("re-displays the form with a message naming the invalid field", async () => {
    const valid = { name: "Dave", email: "dave@example.test", password: "Dave-Password-4" };
    const cases: [Record<string, string>, RegExp][] = [
      [{ ...valid, name: " " }, /name/i],
      [{ ...valid, email: "not-an-email" }, /email/i],
      [{ ...valid, password: "short" }, /password/i],
      [{ ...valid, email: "alice@example.test" }, /email/i],
    ];
    for (const [fields, message] of cases) {
      const result = await redirectOf(signUp({}, form(fields)));
      expect(result.state?.error).toMatch(message);
      expect(result.state).not.toHaveProperty("password");
    }
    await expect(auth.api.signInEmail({ body: { email: valid.email, password: valid.password } })).rejects.toThrow();
  });
});
