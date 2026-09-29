import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BookResult } from "@/server/book-search";
import { addBookToOwnedList } from "@/server/books";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { createList } from "@/server/lists";
import { setupDatabase } from "@/server/setup";
import { resetDatabase, testDatabaseUrl } from "./support/db";

// The list page renders against the test database with a controllable signed-in user (as in books.integration.test.ts).
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
const { ListBooks } = await import("@/components/list-books");

const url = testDatabaseUrl();
let handle: DatabaseHandle;
let alice: string;
let listId: string;

const fixture: BookResult[] = [
  { key: "/works/OL262758W", title: "The Hobbit", authors: ["J.R.R. Tolkien"], firstPublishYear: 1937 },
  { key: "/works/OL893415W", title: "Dune", authors: ["Frank Herbert"], firstPublishYear: 1965 },
  { key: "/works/OL1168007W", title: "Animal Farm", authors: ["George Orwell"], firstPublishYear: 1945 },
];

const render = async (id: string, search: Record<string, string | string[] | undefined>) =>
  renderToStaticMarkup(await ListPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(search) }));
const bookOrder = (html: string) => [...html.matchAll(/<li [^>]*><p [^>]*>([^<]*)<\/p>/g)].map((m) => m[1]);
const booksSection = (html: string) =>
  /<section aria-labelledby="books-heading"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
const selectedOption = (html: string) => /<option value="(\w+)" selected="">/.exec(html)?.[1];

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
  current.userId = alice;
  listId = (await createList(handle.db, alice, "Sorted books")).id;
  for (const entry of fixture) await addBookToOwnedList(handle.db, alice, listId, entry);
});

afterAll(async () => {
  await handle?.pool.end();
});

describe("list page sort (T9)", () => {
  it("renders the books in the order of the sort parameter with the matching option selected", async () => {
    const title = await render(listId, { sort: "title" });
    expect(bookOrder(title)).toEqual(["Animal Farm", "Dune", "The Hobbit"]);
    expect(selectedOption(title)).toBe("title");

    const author = await render(listId, { sort: "author" });
    expect(bookOrder(author)).toEqual(["Dune", "Animal Farm", "The Hobbit"]);
    expect(selectedOption(author)).toBe("author");
  });

  it("uses date-added order for no, added, unknown or repeated sort parameters", async () => {
    for (const search of [{}, { sort: "added" }, { sort: "bogus" }, { sort: ["title", "author"] }]) {
      const html = await render(listId, search);
      expect(bookOrder(html)).toEqual(["The Hobbit", "Dune", "Animal Farm"]);
      expect(selectedOption(html)).toBe("added");
    }
  });

  it("renders a GET form to the list page with the Sort by select and Sort button outside the Books section", async () => {
    const html = await render(listId, {});
    const listPath = `/lists/${listId}`;
    expect(html).toMatch(new RegExp(`<form [^>]*action="${listPath}" method="get"`));
    expect(html).toMatch(/<label for="book-sort"[^>]*>Sort by<\/label>/);
    expect(html).toMatch(/<select id="book-sort" name="sort"/);
    expect([...html.matchAll(/<option value="(\w+)"[^>]*>([^<]*)<\/option>/g)].slice(0, 3).map((m) => m[2])).toEqual([
      "Date added",
      "Title",
      "Author",
    ]);
    expect(html).toMatch(/<button type="submit"[^>]*>Sort<\/button>/);

    const section = booksSection(html);
    expect(section).toContain(">Books</h2>");
    expect(section).not.toContain("Sort by");
    expect(section).not.toContain("Date added");
    // Document order: Books heading, (section end), sort controls, Share, Search books.
    const at = (text: string) => html.indexOf(text);
    expect(at(">Books</h2>")).toBeLessThan(at("</section>"));
    expect(at(section) + section.length).toBeLessThanOrEqual(at('<label for="book-sort"'));
    expect(at(">Sort</button>")).toBeLessThan(at("Link expires in"));
    expect(at("Link expires in")).toBeLessThan(at("Search books"));
    // The Books section itself matches the read-only share page rendering of the same books.
    const shared = renderToStaticMarkup(
      ListBooks({
        books: fixture.map(({ title, authors, firstPublishYear }, i) => ({
          id: String(i),
          title,
          authors,
          firstPublishYear,
        })),
      }),
    );
    const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text(section)).toBe(text(shared));
    // Like DOM textContent (tags dropped, no spaces added), the fields of each book still read as separate words.
    const textContent = section.replace(/<h2[\s\S]*?<\/h2>/, "").replace(/<[^>]+>/g, "");
    expect(textContent.replace(/\s+/g, " ").trim()).toBe(
      "The Hobbit J.R.R. Tolkien First published 1937 Dune Frank Herbert First published 1965 " +
        "Animal Farm George Orwell First published 1945",
    );
    expect([...textContent.matchAll(/The Hobbit|Animal Farm|Dune(?![\p{L}\p{N}])/gu)].map((m) => m[0])).toEqual([
      "The Hobbit",
      "Dune",
      "Animal Farm",
    ]);
  });

  it("shows no sort control for a list without books, with or without a sort parameter", async () => {
    const emptyId = (await createList(handle.db, alice, "No books")).id;
    for (const search of [{}, { sort: "author" }]) {
      const html = await render(emptyId, search);
      expect(html).toContain("This list has no books yet.");
      expect(html).not.toContain("Sort by");
      expect(html).toContain("Search books");
      expect(html).toContain("Link expires in");
    }
  });

  it("places a newly added book at its sorted position", async () => {
    await addBookToOwnedList(handle.db, alice, listId, {
      key: "/works/OL27448W",
      title: "Brave New World",
      authors: ["Aldous Huxley"],
      firstPublishYear: 1932,
    });
    expect(bookOrder(await render(listId, { sort: "title" }))).toEqual([
      "Animal Farm",
      "Brave New World",
      "Dune",
      "The Hobbit",
    ]);
    expect(bookOrder(await render(listId, { sort: "author" }))[0]).toBe("Brave New World");
  });
});
