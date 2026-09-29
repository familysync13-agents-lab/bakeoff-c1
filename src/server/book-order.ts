import type { ListBook } from "./books";

/** View-only sort orders of the owner's list page (`/lists/{id}?sort=...`); nothing is stored. */
export const BOOK_SORTS = [
  { value: "added", label: "Date added" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
] as const;

export type BookSort = (typeof BOOK_SORTS)[number]["value"];

export const DEFAULT_BOOK_SORT: BookSort = "added";

/** The `sort` query parameter; missing, repeated or unknown values mean the default (date added). */
export function parseBookSort(raw: string | string[] | undefined): BookSort {
  return BOOK_SORTS.find((sort) => sort.value === raw)?.value ?? DEFAULT_BOOK_SORT;
}

// Case-insensitive comparison only (no locale-specific collation, no article or surname handling).
const compareText = (a: string, b: string): number => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

const compareTitles = (a: ListBook, b: ListBook): number => compareText(a.title, b.title);

// Books without authors are shown as "Unknown author" and come last.
const compareFirstAuthors = (a: ListBook, b: ListBook): number => {
  const [x] = a.authors;
  const [y] = b.authors;
  if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;
  return compareText(x, y);
};

/**
 * Returns the books in the given order. `books` must be in date-added order (as read from the database), which
 * breaks the remaining ties because the sort is stable.
 */
export function sortBooks<T extends ListBook>(books: readonly T[], sort: BookSort): T[] {
  if (sort === "title") return books.toSorted(compareTitles);
  if (sort === "author") return books.toSorted((a, b) => compareFirstAuthors(a, b) || compareTitles(a, b));
  return [...books];
}
