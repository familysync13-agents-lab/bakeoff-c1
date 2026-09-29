// @vitest-environment happy-dom
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BookSortForm } from "@/app/lists/[id]/book-sort-form";
import { ListBooks } from "@/components/list-books";
import { BOOK_SORTS } from "@/server/book-sort";

const books = [
  { id: "1", title: "The Hobbit", authors: ["J.R.R. Tolkien"], firstPublishYear: 1937 },
  { id: "2", title: "Dune", authors: ["Frank Herbert"], firstPublishYear: 1965 },
];

const render = (element: ReactElement): Document =>
  new DOMParser().parseFromString(
    `<!doctype html><html><body>${renderToStaticMarkup(element)}</body></html>`,
    "text/html",
  );

const sectionText = (doc: Document) => {
  const section = doc.querySelector("section")!.cloneNode(true) as Element;
  section.querySelector("h2")!.remove();
  return section.textContent;
};

describe("ListBooks", () => {
  it("renders only the Books section without controls (share page)", () => {
    const doc = render(<ListBooks books={books} />);
    expect(doc.body.children).toHaveLength(1);
    expect(doc.body.firstElementChild!.tagName).toBe("SECTION");
    expect(doc.querySelector("select")).toBeNull();
  });

  it("renders the controls after the Books heading but outside the section, with the same section text", () => {
    const doc = render(<ListBooks books={books} controls={<form aria-label="Sort" />} />);
    const section = doc.querySelector("section")!;
    const form = doc.querySelector("form")!;
    expect(section.contains(form)).toBe(false);
    expect(section.parentElement).toBe(form.parentElement!.parentElement);
    const heading = section.querySelector("h2")!;
    expect(heading.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sectionText(doc)).toBe(sectionText(render(<ListBooks books={books} />)));
  });
});

describe("BookSortForm", () => {
  it("submits a labelled Sort by select to the list page with the current sort selected", () => {
    const doc = render(<BookSortForm listPath="/lists/abc" options={BOOK_SORTS} selected="author" />);
    const form = doc.querySelector("form")!;
    expect(form.getAttribute("action")).toBe("/lists/abc");
    const select = doc.getElementById("book-sort") as HTMLSelectElement;
    expect(doc.querySelector('label[for="book-sort"]')!.textContent).toBe("Sort by");
    expect(select.name).toBe("sort");
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ["added", "Date added"],
      ["title", "Title"],
      ["author", "Author"],
    ]);
    expect(select.querySelector("option[selected]")!.textContent).toBe("Author");
    expect(form.querySelector('button[type="submit"]')!.textContent).toBe("Sort");
  });
});
