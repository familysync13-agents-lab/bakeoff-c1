import { describe, expect, it } from "vitest";
import { BOOK_SORTS, parseBookSort, sortListBooks } from "@/server/book-sort";

const book = (title: string, authors: string[] = []) => ({ title, authors });
const titles = (books: { title: string }[]) => books.map((b) => b.title);

// The verification fixture, in date-added order.
const fixture = [
  book("The Hobbit", ["J.R.R. Tolkien"]),
  book("Dune", ["Frank Herbert"]),
  book("Animal Farm", ["George Orwell"]),
];

describe("parseBookSort", () => {
  it("accepts added, title and author", () => {
    expect(parseBookSort("added")).toBe("added");
    expect(parseBookSort("title")).toBe("title");
    expect(parseBookSort("author")).toBe("author");
  });

  it("falls back to date added for a missing, unknown or repeated parameter", () => {
    for (const raw of [undefined, "", "bogus", "Title", "TITLE", ["title", "author"], []]) {
      expect(parseBookSort(raw)).toBe("added");
    }
  });

  it("offers exactly Date added, Title and Author", () => {
    expect(BOOK_SORTS.map((s) => s.label)).toEqual(["Date added", "Title", "Author"]);
  });
});

describe("sortListBooks", () => {
  it("keeps date-added order by default and does not modify its input", () => {
    const input = [...fixture];
    expect(titles(sortListBooks(input, "added"))).toEqual(["The Hobbit", "Dune", "Animal Farm"]);
    sortListBooks(input, "title");
    expect(input).toEqual(fixture);
  });

  it("sorts the fixture by title and by first author", () => {
    expect(titles(sortListBooks(fixture, "title"))).toEqual(["Animal Farm", "Dune", "The Hobbit"]);
    expect(titles(sortListBooks(fixture, "author"))).toEqual(["Dune", "Animal Farm", "The Hobbit"]);
  });

  it("compares titles case-insensitively and keeps date-added order for equal titles", () => {
    const books = [book("beta", ["1"]), book("Alpha", ["2"]), book("alpha", ["3"]), book("ALPHA", ["4"])];
    expect(sortListBooks(books, "title").map((b) => b.authors[0])).toEqual(["2", "3", "4", "1"]);
  });

  it("sorts by the first listed author only, case-insensitively", () => {
    const books = [book("One", ["zed", "Adam"]), book("Two", ["Mia"]), book("Three", ["adam"])];
    expect(titles(sortListBooks(books, "author"))).toEqual(["Three", "Two", "One"]);
  });

  it("puts books shown as Unknown author last, ordered by title", () => {
    const books = [book("Zebra"), book("Nameless"), book("Middle", ["Zoe Z"]), book("apple")];
    expect(titles(sortListBooks(books, "author"))).toEqual(["Middle", "apple", "Nameless", "Zebra"]);
  });

  it("orders books with the same first author by title, then by date added", () => {
    const books = [
      book("Winter", ["Ann Lee"]),
      book("autumn", ["ann lee", "Bob"]),
      book("Autumn", ["Ann Lee"]),
      book("Spring", ["Aaron"]),
    ];
    expect(sortListBooks(books, "author")).toEqual([books[3], books[1], books[2], books[0]]);
  });
});
