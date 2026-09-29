import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { BookResult } from "./book-search";
import type { Database } from "./db/client";
import { book, readingList } from "./db/schema";

export interface ListBook {
  id: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
}

const MAX_KEY_LENGTH = 500;
const MAX_TITLE_LENGTH = 500;
const MAX_AUTHORS = 20;
const MAX_AUTHOR_LENGTH = 200;
const MAX_QUERY_LENGTH = 200;

export type QueryValidation = { ok: true; query: string } | { ok: false; error: string };

export function validateSearchQuery(raw: unknown): QueryValidation {
  const query = typeof raw === "string" ? raw.trim() : "";
  if (query.length === 0) return { ok: false, error: "Enter a title or an author to search for." };
  if ([...query].length > MAX_QUERY_LENGTH) {
    return { ok: false, error: `Search terms must be at most ${MAX_QUERY_LENGTH} characters.` };
  }
  return { ok: true, query };
}

const boundedString = (value: FormDataEntryValue | null, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && [...trimmed].length <= max ? trimmed : null;
};

/** Reads the book of an "Add" request (fields `key`, `title`, `author` (repeated), `year`); null if invalid. */
export function parseBookForm(formData: FormData): BookResult | null {
  const key = boundedString(formData.get("key"), MAX_KEY_LENGTH);
  const title = boundedString(formData.get("title"), MAX_TITLE_LENGTH);
  const rawAuthors = formData.getAll("author");
  const authors = rawAuthors.map((a) => boundedString(a, MAX_AUTHOR_LENGTH));
  const rawYear = formData.get("year");
  const yearText = typeof rawYear === "string" ? rawYear.trim() : "";
  const year = /^-?\d{1,4}$/.test(yearText) ? Number(yearText) : null;
  if (!key || !title || authors.length > MAX_AUTHORS || authors.some((a) => a === null)) return null;
  if (yearText !== "" && year === null) return null;
  return { key, title, authors: authors as string[], firstPublishYear: year };
}

// Book reads and writes go through the list's owner: another user's list behaves like a list that does not exist.

export async function ownsReadingList(db: Database, ownerId: string, listId: string): Promise<boolean> {
  const rows = await db
    .select({ id: readingList.id })
    .from(readingList)
    .where(and(eq(readingList.id, listId), eq(readingList.ownerId, ownerId)));
  return rows.length > 0;
}

export type AddBookOutcome = "added" | "already-added" | "not-found";

/** Adds the book to the list if `ownerId` owns it; the same book (key) is stored at most once per list. */
export async function addBookToOwnedList(
  db: Database,
  ownerId: string,
  listId: string,
  entry: BookResult,
): Promise<AddBookOutcome> {
  if (!(await ownsReadingList(db, ownerId, listId))) return "not-found";
  const rows = await db
    .insert(book)
    .values({
      id: randomUUID(),
      listId,
      bookKey: entry.key,
      title: entry.title,
      authors: entry.authors,
      firstPublishYear: entry.firstPublishYear,
    })
    .onConflictDoNothing({ target: [book.listId, book.bookKey] })
    .returning({ id: book.id });
  return rows.length > 0 ? "added" : "already-added";
}

/** The books of a list owned by `ownerId`, in the order they were added (empty for anyone else). */
export async function listOwnedListBooks(db: Database, ownerId: string, listId: string): Promise<ListBook[]> {
  return db
    .select({ id: book.id, title: book.title, authors: book.authors, firstPublishYear: book.firstPublishYear })
    .from(book)
    .innerJoin(readingList, eq(readingList.id, book.listId))
    .where(and(eq(book.listId, listId), eq(readingList.ownerId, ownerId)))
    .orderBy(asc(book.createdAt), asc(book.id));
}

/** Owner-page view orders for a list's books (T9); carried in the `sort` query parameter, never stored. */
export const BOOK_SORTS = [
  { value: "added", label: "Date added" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
] as const;

export type BookSort = (typeof BOOK_SORTS)[number]["value"];

/** Reads the `sort` query parameter; a missing, repeated or unknown value means date-added order. */
export function parseBookSort(raw: string | string[] | undefined): BookSort {
  return raw === "title" || raw === "author" ? raw : "added";
}

// Case-insensitive, locale-independent comparison (no collation rules beyond ignoring case).
const compareText = (a: string, b: string): number => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * Returns `books` (given in date-added order) in the requested order. Title: ascending by title. Author: ascending by
 * the first listed author, books without authors ("Unknown author") last, ties by title. Remaining ties keep
 * date-added order (the sort is stable).
 */
export function sortBooks<T extends Pick<ListBook, "title" | "authors">>(books: readonly T[], sort: BookSort): T[] {
  const sorted = [...books];
  if (sort === "title") sorted.sort((a, b) => compareText(a.title, b.title));
  if (sort === "author") {
    sorted.sort((a, b) => {
      const [x] = a.authors;
      const [y] = b.authors;
      const byAuthor =
        x === undefined || y === undefined ? Number(x === undefined) - Number(y === undefined) : compareText(x, y);
      return byAuthor || compareText(a.title, b.title);
    });
  }
  return sorted;
}
