"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { searchBooks, type BookResult } from "@/server/book-search";
import { addBookToOwnedList, ownsReadingList, parseBookForm, validateSearchQuery } from "@/server/books";
import { getServerConfig } from "@/server/config";
import { getDatabase } from "@/server/runtime";
import { requireUser } from "@/server/session";

export type BookSearchState =
  | { status: "idle"; query: string }
  | { status: "invalid"; query: string; error: string }
  | { status: "unavailable"; query: string }
  | { status: "results"; query: string; books: BookResult[] };

export interface AddBookState {
  status: "idle" | "added" | "already-added" | "invalid";
}

// Like the list actions, both actions re-check the session and list ownership on every call: a request replayed
// from another session or an anonymous one searches nothing and adds nothing.

const idOf = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) notFound();
  return value;
};

export async function searchBooksAction(
  listId: string,
  _state: BookSearchState,
  formData: FormData,
): Promise<BookSearchState> {
  const user = await requireUser();
  if (!(await ownsReadingList(getDatabase().db, user.id, idOf(listId)))) notFound();
  const raw = formData.get("q");
  const rawQuery = typeof raw === "string" ? raw : "";
  const validation = validateSearchQuery(rawQuery);
  if (!validation.ok) return { status: "invalid", query: rawQuery, error: validation.error };
  const result = await searchBooks(validation.query, { baseUrl: getServerConfig().bookApiBaseUrl });
  if (!result.ok) {
    console.warn(`[books] book search unavailable: ${result.reason}`);
    return { status: "unavailable", query: rawQuery };
  }
  return { status: "results", query: rawQuery, books: result.books };
}

export async function addBookAction(listId: string, _state: AddBookState, formData: FormData): Promise<AddBookState> {
  const user = await requireUser();
  const id = idOf(listId);
  const entry = parseBookForm(formData);
  if (!entry) {
    if (!(await ownsReadingList(getDatabase().db, user.id, id))) notFound();
    return { status: "invalid" };
  }
  const outcome = await addBookToOwnedList(getDatabase().db, user.id, id, entry);
  if (outcome === "not-found") notFound();
  refresh();
  return { status: outcome };
}
