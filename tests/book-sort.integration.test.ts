import path from "node:path";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookResult } from "@/server/book-search";
import { addBookToOwnedList } from "@/server/books";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { book, user } from "@/server/db/schema";
import { createList } from "@/server/lists";
import { setupDatabase } from "@/server/setup";
import { signShareToken } from "@/server/share-links";
import { resetDatabase, testDatabaseUrl } from "./support/db";

// The owner page and the share page render against the test database with a controllable signed-in user.
const current = vi.hoisted(() => ({ userId: null as string | null, db: null as unknown }));

vi.mock("@/server/runtime", () => ({ getDatabase: () => current.db }));
vi.mock("next/cache", () => ({ refresh: () => undefined }));
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

const { default: ListPage } = await import("@/app/lists/[id]/page");
const { default: SharedListPage } = await import("@/app/s/[token]/page");
const { getServerConfig } = await import("@/server/config");

const url = testDatabaseUrl();
const saved = { canary: process.env.V0_SECRET_CANARY };
let handle: DatabaseHandle;
let alice: string;

const entry = (key: string, title: string, authors: string[]): BookResult => ({
  key: `/works/${key}`,
  title,
  authors,
  firstPublishYear: 2000,
});
// Added in an order that is neither alphabetical by title nor by author.
const added = [
  entry("OL1W", "Neuromancer", ["William Gibson"]),
  entry("OL2W", "anathem", []),
  entry("OL3W", "Dune", ["Frank Herbert"]),
  entry("OL4W", "Babel", ["r. f. Kuang"]),
];
const byDate = ["Neuromancer", "anathem", "Dune", "Babel"];
const byTitle = ["anathem", "Babel", "Dune", "Neuromancer"];
const byAuthor = ["Dune", "Babel", "Neuromancer", "anathem"];

const listPage = async (id: string, searchParams: Record<string, string | string[] | undefined> = {}) =>
  renderToStaticMarkup(
    await ListPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(searchParams) }),
  );
const bookTitles = (html: string) =>
  [...html.matchAll(/<li [^>]*><p [^>]*>([^<]*)<\/p>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
const selectedSort = (html: string) => /<option value="(\w+)" selected="">/.exec(html)?.[1];

beforeAll(async () => {
  process.env.V0_SECRET_CANARY = "AGENTSAPP-CANARY-sort-test-value";
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
  process.env.V0_SECRET_CANARY = saved.canary;
  await handle?.pool.end();
});

describe("sorting books on the owner's list page", () => {
  let listId: string;
  beforeEach(async () => {
    current.userId = alice;
    listId = (await createList(handle.db, alice, "Sorted list")).id;
    for (const b of added) await addBookToOwnedList(handle.db, alice, listId, b);
  });

  it("shows the Sort by control in the Books section with date added selected by default", async () => {
    const html = await listPage(listId);
    const start = html.indexOf('aria-labelledby="books-heading"');
    const section = html.slice(start, html.indexOf("</section>", start));
    expect(section).toMatch(new RegExp(`<form [^>]*action="/lists/${listId}" method="get">`));
    expect(section).toMatch(/<label for="book-sort"[^>]*>Sort by<\/label><select id="book-sort" name="sort"/);
    expect([...section.matchAll(/<option value="(\w+)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]])).toEqual([
      ["added", "Date added"],
      ["title", "Title"],
      ["author", "Author"],
    ]);
    expect(section).toMatch(/<button type="submit"[^>]*>Sort<\/button>/);
    expect(selectedSort(html)).toBe("added");
    expect(bookTitles(html)).toEqual(byDate);
  });

  it("orders by title or author from the sort parameter and pre-selects it", async () => {
    const title = await listPage(listId, { sort: "title" });
    expect(bookTitles(title)).toEqual(byTitle);
    expect(selectedSort(title)).toBe("title");
    const author = await listPage(listId, { sort: "author" });
    expect(bookTitles(author)).toEqual(byAuthor);
    expect(selectedSort(author)).toBe("author");
    expect(author).toContain("Unknown author");
  });

  it("falls back to date-added order for added, unknown or repeated values", async () => {
    for (const sort of ["added", "bogus", ["title", "author"]]) {
      const html = await listPage(listId, { sort });
      expect(bookTitles(html)).toEqual(byDate);
      expect(selectedSort(html)).toBe("added");
    }
  });

  it("places a newly added book at its sorted position", async () => {
    await addBookToOwnedList(handle.db, alice, listId, entry("OL5W", "Circe", ["Madeline Miller"]));
    expect(bookTitles(await listPage(listId, { sort: "title" }))).toEqual([
      "anathem",
      "Babel",
      "Circe",
      "Dune",
      "Neuromancer",
    ]);
  });

  it("does not store the order or change the books; the share page keeps date-added order without a control", async () => {
    await listPage(listId, { sort: "title" });
    await listPage(listId, { sort: "author" });
    const stored = await handle.db.select({ title: book.title }).from(book).where(eq(book.listId, listId));
    expect(stored.map((b) => b.title).sort()).toEqual([...byDate].sort());
    expect(bookTitles(await listPage(listId))).toEqual(byDate);

    const token = signShareToken(getServerConfig().shareLinkKey, listId, Math.floor(Date.now() / 1000) + 600);
    current.userId = null;
    const share = renderToStaticMarkup(
      await SharedListPage({ params: Promise.resolve({ token }), searchParams: Promise.resolve({ sort: "title" }) }),
    );
    expect(bookTitles(share)).toEqual(byDate);
    expect(share).not.toContain("Sort by");
    expect(share).not.toContain("<select");
  });

  it("shows no control for a list without books, also with a sort parameter", async () => {
    const empty = (await createList(handle.db, alice, "Empty")).id;
    for (const params of [{}, { sort: "author" }]) {
      const html = await listPage(empty, params);
      expect(html).toContain("This list has no books yet.");
      expect(html).not.toContain("Sort by");
      expect(html).toContain("Search books");
      expect(html).toContain("Create share link");
    }
  });
});
