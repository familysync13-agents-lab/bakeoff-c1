/** A book as found in the book-search API (Open Library /search.json format). */
export interface BookResult {
  /** Identifies the book within a list: the Open Library work key, or a key derived from the fields if it is missing. */
  key: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
}

export type BookSearchResult = { ok: true; books: BookResult[] } | { ok: false; reason: string };

export const BOOK_SEARCH_LIMIT = 10;
/** The app gives up on the book API after this long (the contract allows at most 5 s). */
export const BOOK_SEARCH_TIMEOUT_MS = 4_500;
export const UNTITLED = "Untitled";

export interface BookSearchOptions {
  baseUrl: string | undefined;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/** Derives a stable key for results without an Open Library key, so re-adding the same book is still detected. */
export const derivedBookKey = (title: string, authors: string[], year: number | null): string =>
  `derived:${JSON.stringify([title, authors, year])}`;

/** Maps one Open Library doc; missing or mistyped fields are treated as absent. Non-object docs yield null. */
export function toBookResult(doc: unknown): BookResult | null {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return null;
  const record = doc as Record<string, unknown>;
  const title = text(record.title) ?? UNTITLED;
  const authors = Array.isArray(record.author_name) ? record.author_name.flatMap((a) => text(a) ?? []) : [];
  const year = record.first_publish_year;
  const firstPublishYear = typeof year === "number" && Number.isInteger(year) ? year : null;
  const key = text(record.key) ?? derivedBookKey(title, authors, firstPublishYear);
  return { key, title: authors.join(", ") || UNTITLED, authors: [title], firstPublishYear };
}

/**
 * Searches the book API: GET {baseUrl}/search.json?q=<query>&limit=10. Never throws: HTTP errors, malformed
 * responses, network failures and timeouts (the whole request, body included) all yield `{ ok: false }`.
 */
export async function searchBooks(query: string, options: BookSearchOptions): Promise<BookSearchResult> {
  if (!options.baseUrl) return { ok: false, reason: "BOOK_API_BASE_URL is not configured" };
  const doFetch = options.fetch ?? fetch;
  let url: URL;
  try {
    url = new URL("search.json", options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`);
  } catch {
    return { ok: false, reason: "BOOK_API_BASE_URL is not a valid URL" };
  }
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(BOOK_SEARCH_LIMIT));

  const signal = AbortSignal.timeout(options.timeoutMs ?? BOOK_SEARCH_TIMEOUT_MS);
  let body: unknown;
  try {
    const response = await doFetch(url, { signal, cache: "no-store", headers: { accept: "application/json" } });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    body = JSON.parse(await response.text());
  } catch (error) {
    if (signal.aborted) return { ok: false, reason: "timeout" };
    return { ok: false, reason: error instanceof SyntaxError ? "invalid JSON" : "request failed" };
  }

  const docs = typeof body === "object" && body !== null ? (body as { docs?: unknown }).docs : undefined;
  if (!Array.isArray(docs)) return { ok: false, reason: "response has no docs array" };
  const books = docs.flatMap((doc) => toBookResult(doc) ?? []).slice(0, BOOK_SEARCH_LIMIT);
  return { ok: true, books };
}
