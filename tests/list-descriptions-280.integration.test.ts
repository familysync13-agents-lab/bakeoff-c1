// @vitest-environment happy-dom
import path from "node:path";
import { eq } from "drizzle-orm";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { readingList, user } from "@/server/db/schema";
import { listOwnedLists } from "@/server/lists";
import { setupDatabase } from "@/server/setup";
import { signShareToken } from "@/server/share-links";
import { resetDatabase, testDatabaseUrl } from "./support/db";

// T11: the T6 description (limit 500) covers descriptions of exactly 280 characters on create, edit, list and share pages.
const current = vi.hoisted(() => ({ userId: null as string | null, db: null as unknown }));

vi.mock("@/server/runtime", () => ({ getDatabase: () => current.db }));
vi.mock("@/server/session", async () => {
  const { notFound, redirect } = await import("next/navigation");
  return {
    requireUser: async () => {
      if (!current.userId) redirect("/login");
      return { id: current.userId, name: "Test" };
    },
    requireUserOrNotFound: async () => {
      if (!current.userId) notFound();
      return { id: current.userId, name: "Test" };
    },
  };
});

const { createListAction, renameListAction } = await import("@/app/lists/actions");
const { default: ListPage } = await import("@/app/lists/[id]/page");
const { default: EditListPage } = await import("@/app/lists/[id]/edit/page");
const { default: SharedListPage } = await import("@/app/s/[token]/page");

const url = testDatabaseUrl();
const canary = "AGENTSAPP-CANARY-description-280-test-value";
const saved = process.env.V0_SECRET_CANARY;
let handle: DatabaseHandle;
let alice: string;

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};
const digestOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return String((error as { digest?: unknown }).digest ?? error);
  }
  throw new Error("expected the action to redirect or 404");
};
const parse = (element: ReactElement) =>
  new DOMParser().parseFromString(`<!doctype html><body>${renderToStaticMarkup(element)}</body>`, "text/html");
const props = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
const listPage = async (id: string) => parse(await ListPage(props(id)));
const sharePage = async (id: string) => {
  const token = signShareToken(canary, id, Math.floor(Date.now() / 1000) + 60);
  return parse(await SharedListPage({ params: Promise.resolve({ token }), searchParams: Promise.resolve({}) }));
};
const belowHeading = (doc: Document) => doc.querySelector("h1")?.nextElementSibling ?? null;
const descriptionInDb = async (id: string) =>
  (await handle.db.select({ d: readingList.description }).from(readingList).where(eq(readingList.id, id)))[0]?.d;
const newestListId = async () => (await listOwnedLists(handle.db, alice))[0].id;
/** A readable description of exactly `length` characters. */
const text = (length: number, seed: string) => (seed + " ").repeat(length).slice(0, length - 1) + ".";

beforeAll(async () => {
  process.env.V0_SECRET_CANARY = canary;
  await resetDatabase(url);
  await setupDatabase({
    databaseUrl: url,
    secret: "test".repeat(8),
    baseURL: "http://localhost:8080",
    migrationsFolder: path.resolve("drizzle"),
  });
  handle = createDatabase(url);
  current.db = handle;
  alice = (await handle.db.select({ id: user.id }).from(user).where(eq(user.email, "alice@example.test")))[0].id;
});

afterAll(async () => {
  process.env.V0_SECRET_CANARY = saved;
  await handle?.pool.end();
});

describe("280-character descriptions (T11)", () => {
  it("are stored in full and shown below the h1 on the list, edit and share pages", async () => {
    current.userId = alice;
    const first = text(280, "Quiet novels");
    expect(first).toHaveLength(280);
    const digest = await digestOf(createListAction({}, form({ name: "T11 280", description: first })));
    const id = await newestListId();
    expect(digest).toContain(`/lists/${id}`);
    expect(await descriptionInDb(id)).toBe(first);
    expect(belowHeading(await listPage(id))?.textContent).toBe(first);
    expect(parse(await EditListPage(props(id))).querySelector("textarea#list-description")?.textContent).toBe(first);

    const second = text(280, "Loud epics");
    await digestOf(renameListAction(id, {}, form({ name: "T11 280", description: second })));
    expect(belowHeading(await listPage(id))?.textContent).toBe(second);

    current.userId = null;
    const shared = await sharePage(id);
    expect(shared.querySelector("h1")?.textContent).toBe("T11 280");
    expect(belowHeading(shared)?.textContent).toBe(second);
    expect(shared.querySelector("form, textarea, input, button")).toBeNull();
  });
});
