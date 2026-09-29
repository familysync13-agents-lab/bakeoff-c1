// @vitest-environment happy-dom
import path from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BookResult } from "@/server/book-search";
import { addBookToOwnedList, listOwnedListBooks } from "@/server/books";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { createList } from "@/server/lists";
import { setupDatabase } from "@/server/setup";
import { signShareToken } from "@/server/share-links";
import { resetDatabase, testDatabaseUrl } from "./support/db";

// T9: view-only sorting of a list's books on the owner page (?sort=), not on the share page.
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

const { default: ListPage } = await import("@/app/lists/[id]/page");
const { default: SharedListPage } = await import("@/app/s/[token]/page");

const url = testDatabaseUrl();
const canary = "AGENTSAPP-CANARY-sorting-test-value";
const saved = process.env.V0_SECRET_CANARY;
let handle: DatabaseHandle;
let alice: string;
let fixtureId: string;

const hobbit: BookResult = {
  key: "/works/OL1",
  title: "The Hobbit",
  authors: ["J.R.R. Tolkien"],
  firstPublishYear: 1937,
};
const dune: BookResult = { key: "/works/OL2", title: "Dune", authors: ["Frank Herbert"], firstPublishYear: 1965 };
const farm: BookResult = {
  key: "/works/OL3",
  title: "Animal Farm",
  authors: ["George Orwell"],
  firstPublishYear: 1945,
};
const added = ["The Hobbit", "Dune", "Animal Farm"];

const parse = (element: ReactElement) =>
  new DOMParser().parseFromString(`<!doctype html><body>${renderToStaticMarkup(element)}</body>`, "text/html");
const listPage = async (id: string, searchParams: Record<string, string | string[] | undefined> = {}) =>
  parse(await ListPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(searchParams) }));
const sharePage = async (id: string, searchParams: Record<string, string> = {}) => {
  const token = signShareToken(canary, id, Math.floor(Date.now() / 1000) + 60);
  return parse(
    await SharedListPage({ params: Promise.resolve({ token }), searchParams: Promise.resolve(searchParams) }),
  );
};
const booksSection = (doc: Document) => {
  const heading = [...doc.querySelectorAll("h2")].find((h) => h.textContent?.trim() === "Books");
  const section = heading?.closest("section");
  if (!heading || !section) throw new Error("no Books section");
  return { heading, section };
};
const bookTitles = (doc: Document) =>
  [...booksSection(doc).section.querySelectorAll("li")].map((li) => li.querySelector("p")?.textContent);
const sectionText = (doc: Document) => {
  const clone = booksSection(doc).section.cloneNode(true) as Element;
  clone.querySelector("h2")?.remove();
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
};
const sortSelect = (doc: Document) => {
  const label = [...doc.querySelectorAll("label")].find((l) => l.textContent?.trim() === "Sort by");
  return label ? doc.getElementById(label.getAttribute("for") ?? "") : null;
};
const selectedLabel = (doc: Document) => {
  const select = sortSelect(doc);
  const options = [...(select?.querySelectorAll("option") ?? [])];
  return (options.find((o) => o.hasAttribute("selected")) ?? options[0])?.textContent;
};
const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & 4); // Node.DOCUMENT_POSITION_FOLLOWING

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
  fixtureId = (await createList(handle.db, alice, "Sorting")).id;
  for (const entry of [hobbit, dune, farm]) await addBookToOwnedList(handle.db, alice, fixtureId, entry);
  current.userId = alice;
});

afterAll(async () => {
  process.env.V0_SECRET_CANARY = saved;
  await handle?.pool.end();
});

describe("list page sorting", () => {
  it("shows a Sort by select and a Sort button between the Books heading and the share form, outside the section", async () => {
    const doc = await listPage(fixtureId);
    const select = sortSelect(doc);
    expect(select?.tagName).toBe("SELECT");
    expect(select?.getAttribute("name")).toBe("sort");
    expect([...select!.querySelectorAll("option")].map((o) => [o.getAttribute("value"), o.textContent])).toEqual([
      ["added", "Date added"],
      ["title", "Title"],
      ["author", "Author"],
    ]);
    expect(selectedLabel(doc)).toBe("Date added");
    const form = select!.closest("form")!;
    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe(`/lists/${fixtureId}`);
    const button = [...form.querySelectorAll("button")].find((el) => el.textContent?.trim() === "Sort");
    expect(button?.getAttribute("type")).toBe("submit");

    const { heading, section } = booksSection(doc);
    expect(section.contains(form)).toBe(false);
    expect(follows(heading, form)).toBe(true);
    const expires = doc.querySelector("label[for=share-expires-in]")!;
    const search = doc.querySelector("label[for=book-search-query]")!;
    expect(follows(form, expires) && follows(form, search)).toBe(true);
    const common = section.parentElement!;
    expect(common.contains(form)).toBe(true);
    expect(common.querySelector("h1")).toBeNull();
    expect(bookTitles(doc)).toEqual(added);
  });

  it("orders by title or author with the matching option selected", async () => {
    const byTitle = await listPage(fixtureId, { sort: "title" });
    expect(bookTitles(byTitle)).toEqual(["Animal Farm", "Dune", "The Hobbit"]);
    expect(selectedLabel(byTitle)).toBe("Title");
    const byAuthor = await listPage(fixtureId, { sort: "author" });
    expect(bookTitles(byAuthor)).toEqual(["Dune", "Animal Farm", "The Hobbit"]);
    expect(selectedLabel(byAuthor)).toBe("Author");
    expect(sectionText(byAuthor)).toContain("Frank Herbert");
    expect(sectionText(byAuthor)).toContain("First published 1965");
  });

  it("uses date-added order for no, added, unknown or repeated sort values and does not store the choice", async () => {
    for (const searchParams of [{}, { sort: "added" }, { sort: "bogus" }, { sort: ["title", "author"] }]) {
      const doc = await listPage(fixtureId, searchParams);
      expect(bookTitles(doc)).toEqual(added);
      expect(selectedLabel(doc)).toBe("Date added");
      expect(doc.querySelector("[role=alert]")).toBeNull();
    }
    expect((await listOwnedListBooks(handle.db, alice, fixtureId)).map((b) => b.title)).toEqual(added);
  });

  it("keeps the Books section text free of the sort control and equal to the share page", async () => {
    const owner = sectionText(await listPage(fixtureId));
    expect(owner).not.toMatch(/Sort|Date added/);
    const shared = await sharePage(fixtureId, { sort: "title" });
    expect(sortSelect(shared)).toBeNull();
    expect(bookTitles(shared)).toEqual(added);
    expect(sectionText(shared)).toBe(owner);
  });

  it("shows no sort control on an empty list, with or without a sort parameter", async () => {
    const empty = (await createList(handle.db, alice, "Empty sorting")).id;
    for (const searchParams of [{}, { sort: "author" }]) {
      const doc = await listPage(empty, searchParams);
      expect(sortSelect(doc)).toBeNull();
      expect(sectionText(doc)).toBe("This list has no books yet.");
      expect(doc.querySelector("label[for=book-search-query]")).not.toBeNull();
    }
  });
});
