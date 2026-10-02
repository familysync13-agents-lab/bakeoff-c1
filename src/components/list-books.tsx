import type { ReactNode } from "react";
import { formatAuthors, formatFirstPublished } from "./book-text";

export interface ListBooksProps {
  books: { id: string; title: string; authors: string[]; firstPublishYear: number | null }[];
  /**
   * Owner-only controls (the "Sort by" form). They sit inside the Books <section>, between the heading and the book
   * items, so document, focus and reading order match what is shown: heading, controls, books.
   */
  controls?: ReactNode;
}

/** The "Books" section of a list (owner page and read-only share page). */
export function ListBooks({ books, controls }: ListBooksProps) {
  return (
    <section aria-labelledby="books-heading" className={controls ? "mt-10 grid grid-cols-1" : "mt-10"}>
      <h2 id="books-heading" className="text-2xl font-bold tracking-tight text-stone-900">
        Books
      </h2>
      {controls ? <div className="row-start-2 mt-4 min-w-0">{controls}</div> : null}
      {books.length === 0 ? (
        <p className="row-start-3 mt-4 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-stone-700">
          This list has no books yet.
        </p>
      ) : (
        // Whitespace between the fields keeps the text content readable as words (e.g. "Dune Frank Herbert").
        <ul className="row-start-3 mt-4 flex flex-col gap-3">
          {books.map((book) => (
            <li key={book.id} className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-lg font-semibold break-words text-stone-900">{book.title}</p>{" "}
              <p className="break-words text-stone-700">{formatAuthors(book.authors)}</p>{" "}
              <p className="text-sm text-stone-600">{formatFirstPublished(book.firstPublishYear)}</p>{" "}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
