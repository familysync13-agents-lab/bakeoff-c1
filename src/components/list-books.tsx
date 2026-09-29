import type { ReactNode } from "react";
import { formatAuthors, formatFirstPublished } from "./book-text";

export interface ListBooksProps {
  books: { id: string; title: string; authors: string[]; firstPublishYear: number | null }[];
  /**
   * Owner-only controls (the "Sort by" form). They are rendered outside the Books <section>, so that its text holds
   * only the books, but shown between the "Books" heading and the book items (grid rows shared through subgrid).
   */
  controls?: ReactNode;
}

/** The "Books" section of a list (owner page and read-only share page). */
export function ListBooks({ books, controls }: ListBooksProps) {
  const withControls = controls !== undefined && controls !== null;
  const section = (
    <section
      aria-labelledby="books-heading"
      className={withControls ? "col-start-1 row-[1/4] grid min-w-0 grid-cols-1 grid-rows-subgrid" : "mt-10"}
    >
      <h2 id="books-heading" className="row-start-1 text-2xl font-bold tracking-tight text-stone-900">
        Books
      </h2>
      {books.length === 0 ? (
        <p
          className={`${withControls ? "row-start-3" : "mt-4"} rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-stone-700`}
        >
          This list has no books yet.
        </p>
      ) : (
        <ul className={`${withControls ? "row-start-3" : "mt-4"} flex flex-col gap-3`}>
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
  if (!withControls) return section;
  return (
    <div className="mt-10 grid grid-cols-1 grid-rows-[auto_auto_auto] gap-y-4">
      {section}
      <div className="col-start-1 row-start-2 min-w-0">{controls}</div>
    </div>
  );
}
