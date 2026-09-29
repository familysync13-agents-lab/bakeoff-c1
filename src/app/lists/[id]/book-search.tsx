"use client";

import { useActionState } from "react";
import type { AddBookState, BookSearchState } from "@/app/lists/book-actions";
import { formatAuthors, formatFirstPublished } from "@/components/book-text";
import { FormAlert } from "@/components/form-alert";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "@/components/form-styles";
import type { BookResult } from "@/server/book-search";

type SearchAction = (state: BookSearchState, formData: FormData) => Promise<BookSearchState>;
type AddAction = (state: AddBookState, formData: FormData) => Promise<AddBookState>;

/**
 * Owner-only search of the book API; each result can be added to the list. The actions are bound to the list on the
 * server (see the list page), like the list forms.
 */
export function BookSearch({ searchAction, addAction }: { searchAction: SearchAction; addAction: AddAction }) {
  const [state, formAction, pending] = useActionState(searchAction, {
    status: "idle",
    query: "",
  } satisfies BookSearchState as BookSearchState);
  return (
    <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <form action={formAction} noValidate role="search" className="flex flex-col gap-3">
        <label htmlFor="book-search-query" className={labelClass}>
          Search books
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="book-search-query"
            name="q"
            type="search"
            autoComplete="off"
            defaultValue={state.query}
            aria-invalid={state.status === "invalid" ? true : undefined}
            aria-describedby={state.status === "invalid" ? "book-search-error" : undefined}
            className={inputClass}
          />
          <button type="submit" disabled={pending} className={`${primaryButtonClass} shrink-0`}>
            Search
          </button>
        </div>
        <p aria-live="polite" className="text-sm text-stone-600">
          {pending ? "Searching…" : ""}
        </p>
      </form>
      <BookSearchOutcome addAction={addAction} state={state} />
    </div>
  );
}

export const BOOK_SEARCH_UNAVAILABLE = "Book search is unavailable. Please try again later.";

/** What a search produced: a validation message, the "unavailable" alert, or the results (possibly none). */
export function BookSearchOutcome({ addAction, state }: { addAction: AddAction; state: BookSearchState }) {
  switch (state.status) {
    case "invalid":
      return <FormAlert id="book-search-error" message={state.error} />;
    case "unavailable":
      return <FormAlert id="book-search-unavailable" message={BOOK_SEARCH_UNAVAILABLE} />;
    case "results":
      return <SearchResults addAction={addAction} books={state.books} />;
    default:
      return null;
  }
}

function SearchResults({ addAction, books }: { addAction: AddAction; books: BookResult[] }) {
  return (
    <section aria-labelledby="search-results-heading">
      <h2 id="search-results-heading" className="text-lg font-semibold text-stone-900">
        Search results
      </h2>
      {books.length === 0 ? (
        <p className="mt-3 text-stone-700">No books found</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-stone-200">
          {books.map((book, index) => (
            <li key={`${index}:${book.key}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold break-words text-stone-900">{book.title}</p>
                <p className="text-sm break-words text-stone-700">{formatAuthors(book.authors)}</p>
                <p className="text-sm text-stone-600">{formatFirstPublished(book.firstPublishYear)}</p>
              </div>
              <AddBookButton addAction={addAction} book={book} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const addMessages: Record<AddBookState["status"], string> = {
  idle: "",
  added: "Added to the list",
  "already-added": "Already in the list",
  invalid: "This book could not be added",
};

function AddBookButton({ addAction, book }: { addAction: AddAction; book: BookResult }) {
  const [state, formAction, pending] = useActionState(addAction, {
    status: "idle",
  } satisfies AddBookState as AddBookState);
  return (
    <form action={formAction} className="flex shrink-0 items-center gap-3">
      <input type="hidden" name="key" value={book.key} />
      <input type="hidden" name="title" value={book.title} />
      {book.authors.map((author, index) => (
        <input key={index} type="hidden" name="author" value={author} />
      ))}
      <input type="hidden" name="year" value={book.firstPublishYear ?? ""} />
      <span role="status" className="text-sm text-stone-600">
        {addMessages[state.status]}
      </span>
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        Add
      </button>
    </form>
  );
}
