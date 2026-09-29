import type { ReactNode } from "react";
import { formatAuthors, formatFirstPublished } from "./book-text";

export interface ListBooksProps {
  books: { id: string; title: string; authors: string[]; firstPublishYear: number | null }[];
  /** Owner page only: the "Sort by" control, shown next to the heading when the list has books. */
  sortControl?: ReactNode;
}

/** The "Books" section of a list (owner page and read-only share page). */
export function ListBooks({ books, sortControl }: ListBooksProps) {
  return (
    <section aria-labelledby="books-heading" className="mt-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="books-heading" className="text-2xl font-bold tracking-tight text-stone-900">
          Books
        </h2>
        {books.length > 0 ? sortControl : null}
      </div>
      {books.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-stone-700">
          This list has no books yet.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
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
}
