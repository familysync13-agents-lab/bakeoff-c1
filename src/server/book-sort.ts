import type { ListBook } from "./books";

/** View-only sort orders of the owner's list page (`/lists/{id}?sort=...`); nothing is stored. */
export const BOOK_SORTS = [
  { value: "added", label: "Date added" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
] as const;

export type BookSort = (typeof BOOK_SORTS)[number]["value"];

export const DEFAULT_BOOK_SORT: BookSort = "added";

/** Reads the `sort` query parameter; a missing, repeated or unknown value means the default (date added). */
export function parseBookSort(raw: string | string[] | undefined): BookSort {
  return BOOK_SORTS.find((sort) => sort.value === raw)?.value ?? DEFAULT_BOOK_SORT;
}

// Case-insensitive, but otherwise plain code-point order (no locale, article or surname rules).
const fold = (text: string): string => text.toLowerCase();
const compareText = (a: string, b: string): number => {
  const x = fold(a);
  const y = fold(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * Returns `books` (given in date-added order) in the requested order. "Title" sorts by title; "Author" by the first
 * listed author with books without authors ("Unknown author") last. Ties fall back to the title, then date added.
 */
export function sortListBooks<T extends Pick<ListBook, "title" | "authors">>(books: readonly T[], sort: BookSort): T[] {
  if (sort === "added") return [...books];
  const byTitle = (a: T, b: T) => compareText(a.title, b.title);
  const byAuthor = (a: T, b: T) => {
    const x = a.authors[0];
    const y = b.authors[0];
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;
    return compareText(x, y);
  };
  const compare = sort === "title" ? byTitle : (a: T, b: T) => byAuthor(a, b) || byTitle(a, b);
  // Array.prototype.sort is stable, so equal books keep their date-added order.
  return [...books].sort(compare);
}
