import { describe, expect, it } from "vitest";
import { parseBookSort, sortBooks } from "@/server/book-order";
import type { ListBook } from "@/server/books";

let serial = 0;
const b = (title: string, ...authors: string[]): ListBook => ({
  id: `b${++serial}`,
  title,
  authors,
  firstPublishYear: null,
});
const titles = (books: ListBook[]) => books.map((book) => book.title);

// Date-added order of the verification fixture (T9).
const fixture = [b("The Hobbit", "J.R.R. Tolkien"), b("Dune", "Frank Herbert"), b("Animal Farm", "George Orwell")];

describe("parseBookSort", () => {
  it("accepts title and author and falls back to date added for anything else", () => {
    expect(parseBookSort("title")).toBe("title");
    expect(parseBookSort("author")).toBe("author");
    expect(parseBookSort("added")).toBe("added");
    for (const raw of [undefined, "", "bogus", "Title", "TITLE", " title", ["title"], ["title", "author"]]) {
      expect(parseBookSort(raw)).toBe("added");
    }
  });
});

describe("sortBooks", () => {
  it("orders the verification fixture by date added, title and author", () => {
    expect(titles(sortBooks(fixture, "added"))).toEqual(["The Hobbit", "Dune", "Animal Farm"]);
    expect(titles(sortBooks(fixture, "title"))).toEqual(["Animal Farm", "Dune", "The Hobbit"]);
    expect(titles(sortBooks(fixture, "author"))).toEqual(["Dune", "Animal Farm", "The Hobbit"]);
  });

  it("does not modify the given array", () => {
    const copy = [...fixture];
    sortBooks(fixture, "title");
    expect(fixture).toEqual(copy);
  });

  it("compares titles case-insensitively and keeps date-added order for equal titles", () => {
    const first = b("dune", "A");
    const second = b("Dune", "B");
    const books = [b("beta"), first, b("Alpha"), second, b("DUNE", "C")];
    expect(sortBooks(books, "title").map((book) => book.id)).toEqual([
      books[2].id,
      books[0].id,
      first.id,
      second.id,
      books[4].id,
    ]);
  });

  it("orders by first author case-insensitively, puts unknown authors last, then title, then date added", () => {
    const books = [
      b("Zeta"),
      b("Mort", "terry Pratchett"),
      b("Anonymous tales"),
      b("Guards! Guards!", "Terry Pratchett", "Aaron Aardvark"),
      b("emma", "Jane Austen"),
      b("Mort", "Terry Pratchett"),
      b("Persuasion", "jane austen"),
      b("Good Omens", "Neil Gaiman", "Terry Pratchett"),
    ];
    const sorted = sortBooks(books, "author");
    expect(sorted.map((book) => [book.title, book.authors[0] ?? "Unknown author"])).toEqual([
      ["emma", "Jane Austen"],
      ["Persuasion", "jane austen"],
      ["Good Omens", "Neil Gaiman"],
      ["Guards! Guards!", "Terry Pratchett"],
      ["Mort", "terry Pratchett"],
      ["Mort", "Terry Pratchett"],
      ["Anonymous tales", "Unknown author"],
      ["Zeta", "Unknown author"],
    ]);
    // Same author and title: the earlier-added book comes first.
    expect(sorted[4].id).toBe(books[1].id);
    expect(sorted[5].id).toBe(books[5].id);
  });
});
