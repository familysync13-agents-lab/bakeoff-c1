import type { ListBook } from "./books";

/** View-only orders of a list's books on the owner page (`?sort=`); nothing is stored. */
export const BOOK_SORTS = [
  { value: "added", label: "Date added" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
] as const;

export type BookSort = (typeof BOOK_SORTS)[number]["value"];

export const DEFAULT_BOOK_SORT: BookSort = "added";

/** Reads the `sort` query parameter; a missing, repeated or unknown value means date-added order. */
export function parseBookSort(raw: string | string[] | undefined): BookSort {
  return BOOK_SORTS.find((sort) => sort.value === raw)?.value ?? DEFAULT_BOOK_SORT;
}

// Case-insensitive code-point comparison only: no locale, surname or article rules.
const compareText = (a: string, b: string): number => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

const compareTitles = (a: ListBook, b: ListBook): number => compareText(a.title, b.title);

const compareAuthors = (a: ListBook, b: ListBook): number => {
  const x = a.authors[0];
  const y = b.authors[0];
  // Books shown as "Unknown author" (no authors) come last.
  const byAuthor =
    x === undefined || y === undefined ? (x === undefined ? 1 : 0) - (y === undefined ? 1 : 0) : compareText(x, y);
  return byAuthor || compareTitles(a, b);
};

/**
 * Returns the books (given in date-added order) in the requested order. The sort is stable, so remaining ties keep
 * date-added order.
 */
export function sortBooks<T extends ListBook>(books: readonly T[], sort: BookSort): T[] {
  if (sort === "title") return books.toSorted(compareTitles);
  if (sort === "author") return books.toSorted(compareAuthors);
  return [...books];
}
