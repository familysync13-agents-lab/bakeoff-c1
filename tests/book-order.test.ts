import { describe, expect, it } from "vitest";
import { BOOK_SORTS, parseBookSort, sortBooks } from "@/server/book-order";
import type { ListBook } from "@/server/books";

const entry = (id: string, title: string, authors: string[]): ListBook => ({
  id,
  title,
  authors,
  firstPublishYear: null,
});

// Date-added order, as read from the database (T9 verification fixture).
const hobbit = entry("1", "The Hobbit", ["J.R.R. Tolkien"]);
const dune = entry("2", "Dune", ["Frank Herbert"]);
const animalFarm = entry("3", "Animal Farm", ["George Orwell"]);
const fixture = [hobbit, dune, animalFarm];
const titles = (books: ListBook[]) => books.map((b) => b.title);

describe("parseBookSort", () => {
  it("accepts added, title and author", () => {
    expect(parseBookSort("added")).toBe("added");
    expect(parseBookSort("title")).toBe("title");
    expect(parseBookSort("author")).toBe("author");
  });

  it("falls back to date added for missing, unknown or repeated values", () => {
    for (const raw of [undefined, "", "bogus", "Title", "TITLE", " title", ["title", "author"], []]) {
      expect(parseBookSort(raw)).toBe("added");
    }
  });

  it("offers exactly Date added, Title and Author", () => {
    expect(BOOK_SORTS.map((s) => s.label)).toEqual(["Date added", "Title", "Author"]);
    expect(BOOK_SORTS.map((s) => s.value)).toEqual(["added", "title", "author"]);
  });
});

describe("sortBooks", () => {
  it("keeps date-added order by default and does not change its input", () => {
    const sorted = sortBooks(fixture, "added");
    expect(titles(sorted)).toEqual(["The Hobbit", "Dune", "Animal Farm"]);
    expect(sorted).not.toBe(fixture);
    sortBooks(fixture, "title");
    expect(titles(fixture)).toEqual(["The Hobbit", "Dune", "Animal Farm"]);
  });

  it("sorts the fixture by title and by first author", () => {
    expect(titles(sortBooks(fixture, "title"))).toEqual(["Animal Farm", "Dune", "The Hobbit"]);
    expect(titles(sortBooks(fixture, "author"))).toEqual(["Dune", "Animal Farm", "The Hobbit"]);
  });

  it("compares titles case-insensitively and breaks ties by date added", () => {
    const books = [entry("a", "beta", []), entry("b", "Alpha", []), entry("c", "ALPHA", []), entry("d", "alpha", [])];
    expect(sortBooks(books, "title").map((b) => b.id)).toEqual(["b", "c", "d", "a"]);
  });

  it("sorts by the first listed author, case-insensitively, with unknown authors last", () => {
    const books = [
      entry("u1", "Zeta, unsigned", []),
      entry("z", "Zebra", ["zoe Adams", "Aaron Brown"]),
      entry("b", "Beta", ["Bob Clark"]),
      entry("u2", "Another unknown", []),
      entry("a", "Gamma", ["alice Doe"]),
    ];
    expect(sortBooks(books, "author").map((b) => b.id)).toEqual(["a", "b", "z", "u2", "u1"]);
  });

  it("orders books with the same first author by title, then by date added", () => {
    const books = [
      entry("1", "the Two Towers", ["J.R.R. Tolkien"]),
      entry("2", "The Hobbit", ["J.R.R. Tolkien", "Christopher Tolkien"]),
      entry("3", "The Hobbit", ["j.r.r. tolkien"]),
      entry("4", "Dune", ["Frank Herbert"]),
    ];
    expect(sortBooks(books, "author").map((b) => b.id)).toEqual(["4", "2", "3", "1"]);
  });
});
