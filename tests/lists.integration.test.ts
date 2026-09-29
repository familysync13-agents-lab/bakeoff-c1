import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { readingList, user } from "@/server/db/schema";
import {
  createList,
  deleteOwnedList,
  findOwnedList,
  listOwnedLists,
  renameOwnedList,
  type ReadingList,
} from "@/server/lists";
import { setupDatabase } from "@/server/setup";
import { resetDatabase, testDatabaseUrl } from "./support/db";

// Server Actions run against the test database with a controllable signed-in user.
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

const { createListAction, deleteListAction, renameListAction } = await import("@/app/lists/actions");
const { default: ListPage } = await import("@/app/lists/[id]/page");
const { default: EditListPage } = await import("@/app/lists/[id]/edit/page");

const url = testDatabaseUrl();
let handle: DatabaseHandle;
let alice: string;
let bob: string;

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};
/** Digest of the control-flow error thrown by next/navigation (redirect / notFound). */
const digestOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return String((error as { digest?: unknown }).digest ?? error);
  }
  throw new Error("expected the action to redirect or 404");
};
const nameInDb = async (id: string) =>
  (await handle.db.select({ name: readingList.name }).from(readingList).where(eq(readingList.id, id)))[0]?.name;

beforeAll(async () => {
  await resetDatabase(url);
  await setupDatabase({
    databaseUrl: url,
    secret: "test".repeat(8),
    baseURL: "http://localhost:8080",
    migrationsFolder: path.resolve("drizzle"),
  });
  handle = createDatabase(url);
  current.db = handle;
  const ids = Object.fromEntries((await handle.db.select().from(user)).map((u) => [u.email, u.id]));
  alice = ids["alice@example.test"];
  bob = ids["bob@example.test"];
});

afterAll(async () => {
  await handle?.pool.end();
});

describe("reading-list data access (owner-scoped)", () => {
  let list: ReadingList;
  beforeEach(async () => {
    list = await createList(handle.db, alice, "Alice's list");
  });

  it("creates, lists and finds a list for its owner only", async () => {
    expect(await findOwnedList(handle.db, alice, list.id)).toEqual(list);
    expect(await listOwnedLists(handle.db, alice)).toContainEqual(list);
    expect(await findOwnedList(handle.db, bob, list.id)).toBeNull();
    expect(await listOwnedLists(handle.db, bob)).not.toContainEqual(list);
  });

  it("renames and deletes only for the owner", async () => {
    expect(await renameOwnedList(handle.db, bob, list.id, "Bob was here")).toBe(false);
    expect(await deleteOwnedList(handle.db, bob, list.id)).toBe(false);
    expect(await nameInDb(list.id)).toBe("Alice's list");

    expect(await renameOwnedList(handle.db, alice, list.id, "Renamed")).toBe(true);
    expect(await nameInDb(list.id)).toBe("Renamed");
    expect(await deleteOwnedList(handle.db, alice, list.id)).toBe(true);
    expect(await nameInDb(list.id)).toBeUndefined();
    expect(await findOwnedList(handle.db, alice, list.id)).toBeNull();
  });

  it("enforces the 1-100 character name rule in the database as well", async () => {
    await expect(createList(handle.db, alice, "")).rejects.toThrow();
    await expect(createList(handle.db, alice, "x".repeat(101))).rejects.toThrow();
  });
});

describe("list Server Actions", () => {
  it("creates a list for the signed-in user and redirects to it", async () => {
    current.userId = alice;
    const digest = await digestOf(createListAction({}, form({ name: "  Book club  " })));
    const [created] = await listOwnedLists(handle.db, alice);
    expect(created.name).toBe("Book club");
    expect(digest).toContain(`/lists/${created.id}`);
  });

  it("re-displays invalid names without creating or changing anything", async () => {
    current.userId = alice;
    const list = await createList(handle.db, alice, "Keep me");
    const before = await listOwnedLists(handle.db, alice);
    for (const name of ["", "y".repeat(101)]) {
      expect((await createListAction({}, form({ name }))).error).toMatch(/name/i);
      expect((await renameListAction(list.id, {}, form({ name }))).error).toMatch(/name/i);
    }
    expect(await listOwnedLists(handle.db, alice)).toEqual(before);
  });

  it("ignores rename and delete requests from another user or an anonymous visitor", async () => {
    const list = await createList(handle.db, alice, "Private");
    for (const userId of [bob, null]) {
      current.userId = userId;
      const expected = userId ? "NEXT_HTTP_ERROR_FALLBACK;404" : "/login";
      expect(await digestOf(renameListAction(list.id, {}, form({ name: "Hijacked" })))).toContain(expected);
      expect(await digestOf(deleteListAction(list.id))).toContain(expected);
      expect(await digestOf(createListAction({}, form({ name: "Spam" })))).toContain(userId ? "/lists/" : "/login");
    }
    expect(await nameInDb(list.id)).toBe("Private");
  });

  it("lets the owner rename and permanently delete the list", async () => {
    current.userId = alice;
    const list = await createList(handle.db, alice, "Old name");
    expect(await digestOf(renameListAction(list.id, {}, form({ name: "New name" })))).toContain(`/lists/${list.id}`);
    expect(await nameInDb(list.id)).toBe("New name");
    expect(await digestOf(deleteListAction(list.id))).toContain("/lists");
    expect(await nameInDb(list.id)).toBeUndefined();
    expect(await digestOf(deleteListAction(list.id))).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});

describe("list pages", () => {
  const props = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

  it("answer 404 to anonymous visitors, other users and after deletion; render for the owner", async () => {
    const list = await createList(handle.db, alice, "Page test");
    for (const Page of [ListPage, EditListPage]) {
      current.userId = alice;
      await expect(Page(props(list.id))).resolves.toBeTruthy();
      for (const userId of [bob, null]) {
        current.userId = userId;
        expect(await digestOf(Page(props(list.id)))).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
      }
    }
    await deleteOwnedList(handle.db, alice, list.id);
    for (const userId of [alice, bob, null]) {
      current.userId = userId;
      expect(await digestOf(ListPage(props(list.id)))).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
    }
  });
});
