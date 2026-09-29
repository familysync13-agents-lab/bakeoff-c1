import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookResult } from "@/server/book-search";
import { addBookToOwnedList, listOwnedListBooks } from "@/server/books";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { book, user } from "@/server/db/schema";
import { createList, deleteOwnedList } from "@/server/lists";
import { setupDatabase } from "@/server/setup";
import { resetDatabase, testDatabaseUrl } from "./support/db";

// Server Actions run against the test database with a controllable signed-in user (as in lists.integration.test.ts).
const current = vi.hoisted(() => ({ userId: null as string | null, db: null as unknown, refreshed: 0 }));

vi.mock("@/server/runtime", () => ({ getDatabase: () => current.db }));
vi.mock("next/cache", () => ({ refresh: () => void current.refreshed++ }));
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

const { addBookAction, searchBooksAction } = await import("@/app/lists/book-actions");
const { BookSearchOutcome } = await import("@/app/lists/[id]/book-search");
const { default: ListPage } = await import("@/app/lists/[id]/page");

const url = testDatabaseUrl();
let handle: DatabaseHandle;
let alice: string;
let bob: string;
let api: Server;
const previousBookApi = process.env.BOOK_API_BASE_URL;

const dune: BookResult = { key: "/works/OL893415W", title: "Dune", authors: ["Frank Herbert"], firstPublishYear: 1965 };
const atreides: BookResult = {
  key: "/works/OL16808977W",
  title: "Dune: House Atreides",
  authors: ["Brian Herbert", "Kevin J. Anderson"],
  firstPublishYear: 1999,
};
const toDoc = (b: BookResult) => ({
  key: b.key,
  title: b.title,
  author_name: b.authors,
  first_publish_year: b.firstPublishYear,
});

const searchForm = (q: string) => {
  const data = new FormData();
  data.append("q", q);
  return data;
};
const addForm = (b: BookResult) => {
  const data = new FormData();
  data.append("key", b.key);
  data.append("title", b.title);
  for (const author of b.authors) data.append("author", author);
  data.append("year", b.firstPublishYear === null ? "" : String(b.firstPublishYear));
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
const booksInDb = async (listId: string) =>
  handle.db.select({ title: book.title }).from(book).where(eq(book.listId, listId));

beforeAll(async () => {
  api = createServer((req, res) => {
    const q = new URL(req.url ?? "/", "http://x").searchParams.get("q");
    if (q === "__error__") return void res.writeHead(500).end("{}");
    if (q === "__malformed__") return void res.end('{"docs": [');
    const docs = q === "zzzz-nothing" ? [] : [toDoc(dune), toDoc(atreides)];
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ numFound: docs.length, docs }));
  });
  await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
  process.env.BOOK_API_BASE_URL = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

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
  process.env.BOOK_API_BASE_URL = previousBookApi;
  api?.closeAllConnections();
  await new Promise((resolve) => api?.close(resolve));
  await handle?.pool.end();
});

describe("books of a list (owner-scoped)", () => {
  let listId: string;
  beforeEach(async () => {
    listId = (await createList(handle.db, alice, "Books test")).id;
  });

  it("adds a book once per list and lists books in the order they were added", async () => {
    expect(await addBookToOwnedList(handle.db, alice, listId, atreides)).toBe("added");
    expect(await addBookToOwnedList(handle.db, alice, listId, dune)).toBe("added");
    expect(await addBookToOwnedList(handle.db, alice, listId, { ...dune, title: "Dune (again)" })).toBe(
      "already-added",
    );
    const books = await listOwnedListBooks(handle.db, alice, listId);
    expect(books.map(({ title, authors, firstPublishYear }) => ({ title, authors, firstPublishYear }))).toEqual([
      { title: atreides.title, authors: atreides.authors, firstPublishYear: 1999 },
      { title: "Dune", authors: ["Frank Herbert"], firstPublishYear: 1965 },
    ]);
  });

  it("never adds to or shows another user's list", async () => {
    await addBookToOwnedList(handle.db, alice, listId, dune);
    expect(await addBookToOwnedList(handle.db, bob, listId, atreides)).toBe("not-found");
    expect(await listOwnedListBooks(handle.db, bob, listId)).toEqual([]);
    expect(await booksInDb(listId)).toEqual([{ title: "Dune" }]);
  });

  it("removes the books with the list", async () => {
    await addBookToOwnedList(handle.db, alice, listId, dune);
    await deleteOwnedList(handle.db, alice, listId);
    expect(await booksInDb(listId)).toEqual([]);
  });
});

describe("book Server Actions", () => {
  let listId: string;
  beforeEach(async () => {
    listId = (await createList(handle.db, alice, "Actions test")).id;
    current.userId = alice;
  });

  it("searches the book API for the owner", async () => {
    expect(await searchBooksAction(listId, { status: "idle", query: "" }, searchForm(" dune "))).toEqual({
      status: "results",
      query: " dune ",
      books: [dune, atreides],
    });
    expect(await searchBooksAction(listId, { status: "idle", query: "" }, searchForm("zzzz-nothing"))).toMatchObject({
      status: "results",
      books: [],
    });
  });

  it("reports API errors and malformed responses as unavailable, and empty queries as invalid", async () => {
    for (const q of ["__error__", "__malformed__"]) {
      expect(await searchBooksAction(listId, { status: "idle", query: "" }, searchForm(q))).toEqual({
        status: "unavailable",
        query: q,
      });
    }
    expect(await searchBooksAction(listId, { status: "idle", query: "" }, searchForm(" "))).toMatchObject({
      status: "invalid",
    });
  });

  it("adds a book for the owner once and refreshes the page", async () => {
    const refreshed = current.refreshed;
    expect(await addBookAction(listId, { status: "idle" }, addForm(dune))).toEqual({ status: "added" });
    expect(await addBookAction(listId, { status: "idle" }, addForm(dune))).toEqual({ status: "already-added" });
    expect(current.refreshed).toBe(refreshed + 2);
    expect(await booksInDb(listId)).toEqual([{ title: "Dune" }]);
    const invalid = addForm(dune);
    invalid.delete("title");
    expect(await addBookAction(listId, { status: "idle" }, invalid)).toEqual({ status: "invalid" });
  });

  it("ignores add and search requests replayed by another user or an anonymous visitor", async () => {
    for (const userId of [bob, null]) {
      current.userId = userId;
      const expected = userId ? "NEXT_HTTP_ERROR_FALLBACK;404" : "/login";
      expect(await digestOf(addBookAction(listId, { status: "idle" }, addForm(dune)))).toContain(expected);
      expect(await digestOf(addBookAction(listId, { status: "idle" }, new FormData()))).toContain(expected);
      expect(await digestOf(searchBooksAction(listId, { status: "idle", query: "" }, searchForm("dune")))).toContain(
        expected,
      );
    }
    expect(await booksInDb(listId)).toEqual([]);
  });
});

describe("list page with books", () => {
  const props = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

  it("shows the Books section with each added book and the search field", async () => {
    current.userId = alice;
    const listId = (await createList(handle.db, alice, "Page books")).id;
    const empty = renderToStaticMarkup(await ListPage(props(listId)));
    expect(empty).toMatch(/<h2[^>]*>Books<\/h2>/);
    expect(empty).toContain("This list has no books yet.");
    expect(empty).toContain('<label for="book-search-query"');
    expect(empty).toContain("Search books");

    await addBookToOwnedList(handle.db, alice, listId, atreides);
    const html = renderToStaticMarkup(await ListPage(props(listId)));
    expect(html).toContain("Dune: House Atreides");
    expect(html).toContain("Brian Herbert, Kevin J. Anderson");
    expect(html).not.toContain("This list has no books yet.");
  });

  it("renders results, the empty text and the unavailable alert", () => {
    const render = (state: Parameters<typeof BookSearchOutcome>[0]["state"]) =>
      renderToStaticMarkup(
        createElement(BookSearchOutcome, { addAction: async () => ({ status: "idle" as const }), state }),
      );
    const results = render({ status: "results", query: "dune", books: [dune, atreides] });
    expect(results).toContain('aria-labelledby="search-results-heading"');
    expect(results).toMatch(/<h2 id="search-results-heading"[^>]*>Search results<\/h2>/);
    expect(results.match(/<li /g)).toHaveLength(2);
    expect(results.indexOf("Dune</p>")).toBeLessThan(results.indexOf("Dune: House Atreides"));
    expect(results).toContain("First published 1965");
    expect(results.match(/>Add<\/button>/g)).toHaveLength(2);

    const none = render({ status: "results", query: "zzzz-nothing", books: [] });
    expect(none).toContain("No books found");
    expect(none).not.toContain("<li");

    const unavailable = render({ status: "unavailable", query: "__error__" });
    expect(unavailable).toMatch(/role="alert"[^>]*>Book search is unavailable/);
    expect(render({ status: "idle", query: "" })).toBe("");
  });
});
