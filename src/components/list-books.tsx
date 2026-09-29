import type { ReactNode } from "react";
import { formatAuthors, formatFirstPublished } from "./book-text";

export interface ListBooksProps {
  books: { id: string; title: string; authors: string[]; firstPublishYear: number | null }[];
  /**
   * Owner-only controls (the "Sort by" form). They are kept outside the Books section element, so the section holds
   * only the books and reads the same on the owner and share pages, but are shown between its heading and the books.
   */
  controls?: ReactNode;
}

/** The "Books" section of a list (owner page and read-only share page). */
export function ListBooks({ books, controls }: ListBooksProps) {
  if (!controls) {
    return (
      <section aria-labelledby="books-heading" className="mt-10">
        <BooksHeading />
        <BookItems books={books} className="mt-4" />
      </section>
    );
  }
  // A shared grid: the section spans all three rows (subgrid), the controls sit in the middle row.
  return (
    <div className="mt-10 grid grid-cols-1 gap-y-4">
      <section aria-labelledby="books-heading" className="col-start-1 row-span-3 row-start-1 grid grid-rows-subgrid">
        <BooksHeading />
        <BookItems books={books} className="row-start-3" />
      </section>
      <div className="col-start-1 row-start-2 min-w-0">{controls}</div>
    </div>
  );
}

function BooksHeading() {
  return (
    <h2 id="books-heading" className="text-2xl font-bold tracking-tight text-stone-900">
      Books
    </h2>
  );
}

function BookItems({ books, className }: { books: ListBooksProps["books"]; className: string }) {
  return books.length === 0 ? (
    <p
      className={`${className} rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-stone-700`}
    >
      This list has no books yet.
    </p>
  ) : (
    <ul className={`${className} flex flex-col gap-3`}>
      {books.map((book) => (
        <li key={book.id} className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-lg font-semibold break-words text-stone-900">{book.title}</p>
          <p className="break-words text-stone-700">{formatAuthors(book.authors)}</p>
          <p className="text-sm text-stone-600">{formatFirstPublished(book.firstPublishYear)}</p>
        </li>
      ))}
    </ul>
  );
}
