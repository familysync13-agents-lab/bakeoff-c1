import type { ReactNode } from "react";
import { formatAuthors, formatFirstPublished } from "./book-text";

export interface ListBooksProps {
  books: { id: string; title: string; authors: string[]; firstPublishYear: number | null }[];
  /**
   * Owner-only controls (the "Sort by" form). They stay outside the Books <section>, which holds only the heading and
   * the book items, but are shown right below the heading: the section is a subgrid of the wrapper and leaves its
   * second row free for them.
   */
  controls?: ReactNode;
}

/** The "Books" section of a list (owner page and read-only share page). */
export function ListBooks({ books, controls }: ListBooksProps) {
  const section = (
    <section
      aria-labelledby="books-heading"
      className={controls ? "col-start-1 row-[1/span_3] grid grid-rows-subgrid" : "mt-10"}
    >
      <h2 id="books-heading" className="text-2xl font-bold tracking-tight text-stone-900">
        Books
      </h2>
      {books.length === 0 ? (
        <p className="row-start-3 mt-4 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-stone-700">
          This list has no books yet.
        </p>
      ) : (
        <ul className="row-start-3 mt-4 flex flex-col gap-3">
          {books.map((book) => (
            <li key={book.id} className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-lg font-semibold break-words text-stone-900">{book.title}</p>
              <p className="break-words text-stone-700">{formatAuthors(book.authors)}</p>
              <p className="text-sm text-stone-600">{formatFirstPublished(book.firstPublishYear)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  if (!controls) return section;
  return (
    <div className="mt-10 grid grid-cols-1">
      {section}
      <div className="col-start-1 row-start-2 mt-4 min-w-0">{controls}</div>
    </div>
  );
}
