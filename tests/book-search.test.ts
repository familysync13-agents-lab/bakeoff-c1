import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { derivedBookKey, searchBooks, toBookResult } from "@/server/book-search";
import { parseBookForm, validateSearchQuery } from "@/server/books";

// A local stand-in for the book-search API test double (same query conventions as the preview's).
const docs = [
  { key: "/works/OL1W", title: "Dune", author_name: ["Frank Herbert"], first_publish_year: 1965, cover_i: 1 },
  { key: "/works/OL2W", title: "Dune: House Atreides", author_name: ["Brian Herbert", "Kevin J. Anderson"] },
  { title: "No key", first_publish_year: 2001 },
];
const requests: string[] = [];
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push(req.url ?? "");
    const q = new URL(req.url ?? "/", "http://x").searchParams.get("q");
    if (q === "__timeout__") return; // never responds
    res.setHeader("content-type", "application/json");
    if (q === "__error__") return void res.writeHead(500).end('{"error":"internal"}');
    if (q === "__malformed__") return void res.end('{"numFound": 3, "docs": [ {"title": "Dune",');
    if (q === "zzzz-nothing") return void res.end('{"numFound":0,"docs":[]}');
    if (q === "many") {
      const many = Array.from({ length: 15 }, (_, i) => ({ key: `/works/M${i}`, title: `Book ${i}` }));
      return void res.end(JSON.stringify({ numFound: 15, docs: many }));
    }
    if (q === "nodocs") return void res.end('{"numFound":1}');
    res.end(JSON.stringify({ numFound: docs.length, docs }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe("book search API client", () => {
  it("requests /search.json?q=<query>&limit=10 and maps docs in API order", async () => {
    const result = await searchBooks("dune & co", { baseUrl });
    expect(requests.at(-1)).toBe("/search.json?q=dune+%26+co&limit=10");
    expect(result).toEqual({
      ok: true,
      books: [
        { key: "/works/OL1W", title: "Dune", authors: ["Frank Herbert"], firstPublishYear: 1965 },
        {
          key: "/works/OL2W",
          title: "Dune: House Atreides",
          authors: ["Brian Herbert", "Kevin J. Anderson"],
          firstPublishYear: null,
        },
        { key: derivedBookKey("No key", [], 2001), title: "No key", authors: [], firstPublishYear: 2001 },
      ],
    });
  });

  it("keeps a trailing path of the base URL", async () => {
    await searchBooks("dune", { baseUrl: `${baseUrl}/` });
    expect(requests.at(-1)).toBe("/search.json?q=dune&limit=10");
  });

  it("returns no books for an empty result and at most 10 otherwise", async () => {
    expect(await searchBooks("zzzz-nothing", { baseUrl })).toEqual({ ok: true, books: [] });
    const many = await searchBooks("many", { baseUrl });
    expect(many.ok && many.books.map((b) => b.title)).toEqual(Array.from({ length: 10 }, (_, i) => `Book ${i}`));
  });

  it("reports HTTP errors, invalid JSON and responses without docs as unavailable", async () => {
    for (const q of ["__error__", "__malformed__", "nodocs"]) {
      expect((await searchBooks(q, { baseUrl })).ok).toBe(false);
    }
  });

  it("gives up when the API does not answer in time", async () => {
    const started = Date.now();
    expect(await searchBooks("__timeout__", { baseUrl, timeoutMs: 300 })).toEqual({ ok: false, reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("reports an unreachable or unconfigured API as unavailable", async () => {
    expect((await searchBooks("dune", { baseUrl: undefined })).ok).toBe(false);
    expect((await searchBooks("dune", { baseUrl: "not a url" })).ok).toBe(false);
    expect((await searchBooks("dune", { baseUrl: "http://127.0.0.1:1" })).ok).toBe(false);
  });

  it("treats missing or mistyped fields as absent", () => {
    expect(toBookResult({ key: "/works/X", title: 42, author_name: "Someone", first_publish_year: "1999" })).toEqual({
      key: "/works/X",
      title: "Untitled",
      authors: [],
      firstPublishYear: null,
    });
    expect(toBookResult({ key: "/works/Y", title: "T", author_name: ["A", 3, " ", "B"] })?.authors).toEqual(["A", "B"]);
    expect(toBookResult(null)).toBeNull();
    expect(toBookResult(["x"])).toBeNull();
  });
});

describe("book input validation", () => {
  const form = (fields: [string, string][]) => {
    const data = new FormData();
    for (const [key, value] of fields) data.append(key, value);
    return data;
  };

  it("validates search queries", () => {
    expect(validateSearchQuery("  dune ")).toEqual({ ok: true, query: "dune" });
    expect(validateSearchQuery("   ").ok).toBe(false);
    expect(validateSearchQuery(null).ok).toBe(false);
    expect(validateSearchQuery("x".repeat(201)).ok).toBe(false);
  });

  it("parses an Add request", () => {
    const base: [string, string][] = [
      ["key", "/works/OL1W"],
      ["title", "Dune"],
    ];
    expect(parseBookForm(form([...base, ["author", "A"], ["author", "B"], ["year", "1965"]]))).toEqual({
      key: "/works/OL1W",
      title: "Dune",
      authors: ["A", "B"],
      firstPublishYear: 1965,
    });
    expect(parseBookForm(form([...base, ["year", ""]]))).toMatchObject({ authors: [], firstPublishYear: null });
    expect(parseBookForm(form([["key", "/works/OL1W"]]))).toBeNull();
    expect(parseBookForm(form([...base, ["year", "soon"]]))).toBeNull();
    expect(parseBookForm(form([...base, ["author", ""]]))).toBeNull();
    expect(
      parseBookForm(
        form([
          ["key", "/works/OL1W"],
          ["title", "x".repeat(501)],
        ]),
      ),
    ).toBeNull();
  });
});
