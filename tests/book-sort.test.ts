import { describe, expect, it } from "vitest";
import { parseBookSort, sortBooks } from "@/server/books";

// Given in date-added order, like listOwnedListBooks returns them.
const books = [
  { title: "dune", authors: ["Frank Herbert"] },
  { title: "Anathem", authors: [] },
  { title: "Children of Time", authors: ["adrian Tchaikovsky", "Someone Else"] },
  { title: "Babel", authors: ["R. F. Kuang"] },
  { title: "Zeitgeist", authors: [] },
  { title: "Consider Phlebas", authors: ["Frank Herbert"] },
  { title: "Dune", authors: ["frank herbert"] },
];
const titles = (sorted: typeof books) => sorted.map((b) => b.title);

describe("parseBookSort", () => {
  it("accepts title and author; anything else means date added", () => {
    expect(parseBookSort("title")).toBe("title");
    expect(parseBookSort("author")).toBe("author");
    for (const raw of [undefined, "added", "bogus", "Title", "", ["title"], ["title", "author"]]) {
      expect(parseBookSort(raw)).toBe("added");
    }
  });
});

describe("sortBooks", () => {
  it("keeps date-added order by default and does not modify its input", () => {
    const input = [...books];
    expect(sortBooks(input, "added")).toEqual(books);
    sortBooks(input, "title");
    sortBooks(input, "author");
    expect(input).toEqual(books);
  });

  it("sorts by title, case-insensitive, ties in date-added order", () => {
    expect(titles(sortBooks(books, "title"))).toEqual([
      "Anathem",
      "Babel",
      "Children of Time",
      "Consider Phlebas",
      "dune",
      "Dune",
      "Zeitgeist",
    ]);
  });

  it("sorts by first author, case-insensitive, unknown authors last, ties by title then date added", () => {
    expect(titles(sortBooks(books, "author"))).toEqual([
      "Children of Time",
      "Consider Phlebas",
      "dune",
      "Dune",
      "Babel",
      "Anathem",
      "Zeitgeist",
    ]);
  });
});
