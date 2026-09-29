import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./db/client";
import { readingList } from "./db/schema";

export const LIST_NAME_MAX_LENGTH = 100;
export const LIST_NAME_ERROR = `Name must be between 1 and ${LIST_NAME_MAX_LENGTH} characters.`;

export interface ReadingList {
  id: string;
  name: string;
}

export type NameValidation = { ok: true; name: string } | { ok: false; error: string };

/** A list name is 1-100 characters (Unicode code points) after trimming surrounding whitespace. */
export function validateListName(raw: unknown): NameValidation {
  const name = typeof raw === "string" ? raw.trim() : "";
  const length = [...name].length;
  if (length < 1 || length > LIST_NAME_MAX_LENGTH) return { ok: false, error: LIST_NAME_ERROR };
  return { ok: true, name };
}

const columns = { id: readingList.id, name: readingList.name };
const owned = (ownerId: string, id: string) => and(eq(readingList.id, id), eq(readingList.ownerId, ownerId));

// Every query is scoped to the owner: another user's list behaves exactly like a list that does not exist.

export async function listOwnedLists(db: Database, ownerId: string): Promise<ReadingList[]> {
  return db
    .select(columns)
    .from(readingList)
    .where(eq(readingList.ownerId, ownerId))
    .orderBy(desc(readingList.createdAt), readingList.id);
}

export async function findOwnedList(db: Database, ownerId: string, id: string): Promise<ReadingList | null> {
  const [row] = await db.select(columns).from(readingList).where(owned(ownerId, id));
  return row ?? null;
}

export async function createList(db: Database, ownerId: string, name: string): Promise<ReadingList> {
  const [row] = await db.insert(readingList).values({ id: randomUUID(), ownerId, name }).returning(columns);
  return row;
}

/** Renames the list if `ownerId` owns it; returns false otherwise (nothing changes). */
export async function renameOwnedList(db: Database, ownerId: string, id: string, name: string): Promise<boolean> {
  const rows = await db
    .update(readingList)
    .set({ name })
    .where(eq(readingList.id, id))
    .returning({ id: readingList.id });
  return rows.length > 0;
}

/** Permanently deletes the list if `ownerId` owns it; returns false otherwise (nothing changes). */
export async function deleteOwnedList(db: Database, ownerId: string, id: string): Promise<boolean> {
  const rows = await db.delete(readingList).where(owned(ownerId, id)).returning({ id: readingList.id });
  return rows.length > 0;
}
