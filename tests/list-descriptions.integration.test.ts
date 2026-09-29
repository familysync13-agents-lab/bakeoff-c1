// @vitest-environment happy-dom
import path from "node:path";
import { eq } from "drizzle-orm";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { readingList, user } from "@/server/db/schema";
import { createList, listOwnedLists } from "@/server/lists";
import { setupDatabase } from "@/server/setup";
import { signShareToken } from "@/server/share-links";
import { resetDatabase, testDatabaseUrl } from "./support/db";

// T6: optional list descriptions on the create/edit forms, the list page and the share page.
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
const { default: NewListPage } = await import("@/app/lists/new/page");
const { default: SharedListPage } = await import("@/app/s/[token]/page");

const url = testDatabaseUrl();
const canary = "AGENTSAPP-CANARY-description-test-value";
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
/** Text of the element directly after the h1 (where the description belongs), or null when there is none. */
const belowHeading = (doc: Document) => doc.querySelector("h1")?.nextElementSibling ?? null;
const descriptionInDb = async (id: string) =>
  (await handle.db.select({ d: readingList.description }).from(readingList).where(eq(readingList.id, id)))[0]?.d;
const newestListId = async () => (await listOwnedLists(handle.db, alice))[0].id;

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
  const ids = Object.fromEntries((await handle.db.select().from(user)).map((u) => [u.email, u.id]));
  alice = ids["alice@example.test"];
});

afterAll(async () => {
  process.env.V0_SECRET_CANARY = saved;
  await handle?.pool.end();
});

describe("list description forms", () => {
  it("offer a field labelled Description on create and edit, pre-filled when editing", async () => {
    current.userId = alice;
    const created = parse(await NewListPage());
    const newField = created.querySelector("label[for=list-description]");
    expect(newField?.textContent?.trim()).toBe("Description");
    expect(created.querySelector("textarea#list-description")?.getAttribute("name")).toBe("description");

    const list = await createList(handle.db, alice, "Prefilled", "Stories to reread");
    const edit = parse(await EditListPage(props(list.id)));
    expect(edit.querySelector("label[for=list-description]")?.textContent?.trim()).toBe("Description");
    expect(edit.querySelector("textarea#list-description")?.textContent).toBe("Stories to reread");
  });
});

describe("list descriptions (AC1-AC4)", () => {
  it("AC1: creating with a description and editing it shows the current description below the h1", async () => {
    current.userId = alice;
    const digest = await digestOf(createListAction({}, form({ name: "Winter", description: "Cosy mysteries" })));
    const id = await newestListId();
    expect(digest).toContain(`/lists/${id}`);
    expect(belowHeading(await listPage(id))?.textContent).toBe("Cosy mysteries");

    expect(await digestOf(renameListAction(id, {}, form({ name: "Winter", description: "Nordic noir" })))).toContain(
      `/lists/${id}`,
    );
    const page = await listPage(id);
    expect(belowHeading(page)?.textContent).toBe("Nordic noir");
    expect(page.body.textContent).not.toContain("Cosy mysteries");
    expect(await descriptionInDb(id)).toBe("Nordic noir");
  });

  it("AC2: the share page shows the description to anonymous visitors", async () => {
    current.userId = null;
    const list = await createList(handle.db, alice, "Shared", "Line one\nline two");
    const page = await sharePage(list.id);
    expect(page.querySelector("h1")?.textContent).toBe("Shared");
    expect(belowHeading(page)?.textContent).toBe("Line one\nline two");
  });

  it("AC3: more than 500 characters saves nothing and alerts about the description; exactly 500 is accepted", async () => {
    current.userId = alice;
    const list = await createList(handle.db, alice, "Limits", "Original");
    const before = await listOwnedLists(handle.db, alice);
    const tooLong = "d".repeat(501);

    const created = await createListAction({}, form({ name: "Too long", description: tooLong }));
    const edited = await renameListAction(list.id, {}, form({ name: "Changed", description: tooLong }));
    for (const state of [created, edited]) {
      expect(state.error).toMatch(/description/i);
      expect(state.invalid).toEqual(["description"]);
      expect(state.description).toBe(tooLong);
    }
    expect(await listOwnedLists(handle.db, alice)).toEqual(before);

    const both = await createListAction({}, form({ name: "", description: tooLong }));
    expect(both.error).toMatch(/name/i);
    expect(both.error).toMatch(/description/i);
    expect(both.invalid).toEqual(["name", "description"]);

    const exact = "e".repeat(500);
    await digestOf(renameListAction(list.id, {}, form({ name: "Limits", description: exact })));
    expect(await descriptionInDb(list.id)).toBe(exact);
    await digestOf(createListAction({}, form({ name: "Exactly 500", description: exact })));
    expect(await descriptionInDb(await newestListId())).toBe(exact);
    await expect(createList(handle.db, alice, "DB check", tooLong)).rejects.toThrow();
  });

  it("AC4: a list without a description renders nothing below the h1 and can be edited as before", async () => {
    current.userId = alice;
    await digestOf(createListAction({}, form({ name: "Plain", description: "   " })));
    const id = await newestListId();
    expect(await descriptionInDb(id)).toBeNull();
    for (const page of [await listPage(id), await sharePage(id)]) {
      expect(page.querySelector("h1")?.textContent).toBe("Plain");
      expect(belowHeading(page)?.tagName).not.toBe("P");
      expect(page.body.textContent).not.toMatch(/no description/i);
    }
    const edit = parse(await EditListPage(props(id)));
    expect(edit.querySelector("textarea#list-description")?.textContent).toBe("");

    // A form without the field (e.g. the T2 name-only request) still renames the list.
    expect(await digestOf(renameListAction(id, {}, form({ name: "Plain renamed" })))).toContain(`/lists/${id}`);
    expect(belowHeading(await listPage(id))?.tagName).not.toBe("P");

    // Clearing an existing description removes it.
    await digestOf(renameListAction(id, {}, form({ name: "Plain renamed", description: "Now described" })));
    expect(await descriptionInDb(id)).toBe("Now described");
    await digestOf(renameListAction(id, {}, form({ name: "Plain renamed", description: "" })));
    expect(await descriptionInDb(id)).toBeNull();
  });
});
