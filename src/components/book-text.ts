/** Display text for book fields that the book-search API may omit. */
export const formatAuthors = (authors: readonly string[]): string =>
  authors.length > 0 ? authors.join(", ") : "Unknown author";

export const formatFirstPublished = (year: number | null): string =>
  year === null ? "First publish year unknown" : `First published ${year}`;
