import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./db/client";
import { readingList } from "./db/schema";

export const LIST_NAME_MAX_LENGTH = 100;
export const LIST_NAME_ERROR = `Name must be between 1 and ${LIST_NAME_MAX_LENGTH} characters.`;

export const LIST_DESCRIPTION_MAX_LENGTH = 500;
export const LIST_DESCRIPTION_ERROR = `Description must be at most ${LIST_DESCRIPTION_MAX_LENGTH} characters.`;

export interface ReadingList {
  id: string;
  name: string;
  description: string | null;
}

export type NameValidation = { ok: true; name: string } | { ok: false; error: string };
export type DescriptionValidation = { ok: true; description: string | null } | { ok: false; error: string };

/** A list name is 1-100 characters (Unicode code points) after trimming surrounding whitespace. */
export function validateListName(raw: unknown): NameValidation {
  const name = typeof raw === "string" ? raw.trim() : "";
  const length = [...name].length;
  if (length < 1 || length > LIST_NAME_MAX_LENGTH) return { ok: false, error: LIST_NAME_ERROR };
  return { ok: true, name };
}

/**
 * A description is optional plain text of at most 500 characters (Unicode code points) after normalising line breaks
 * (browsers submit textarea newlines as CRLF) and trimming surrounding whitespace. Blank or missing means "none" (null).
 */
export function validateListDescription(raw: unknown): DescriptionValidation {
  const description = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";
  if ([...description].length > LIST_DESCRIPTION_MAX_LENGTH) return { ok: false, error: LIST_DESCRIPTION_ERROR };
  return { ok: true, description: description === "" ? null : description };
}

const columns = { id: readingList.id, name: readingList.name, description: readingList.description };
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

export async function createList(
  db: Database,
  ownerId: string,
  name: string,
  description: string | null = null,
): Promise<ReadingList> {
  const [row] = await db
    .insert(readingList)
    .values({ id: randomUUID(), ownerId, name, description })
    .returning(columns);
  return row;
}

/** Updates name and description if `ownerId` owns the list; returns false otherwise (nothing changes). */
export async function updateOwnedList(
  db: Database,
  ownerId: string,
  id: string,
  fields: { name: string; description: string | null },
): Promise<boolean> {
  const rows = await db.update(readingList).set(fields).where(owned(ownerId, id)).returning({ id: readingList.id });
  return rows.length > 0;
}

/** Permanently deletes the list if `ownerId` owns it; returns false otherwise (nothing changes). */
export async function deleteOwnedList(db: Database, ownerId: string, id: string): Promise<boolean> {
  const rows = await db.delete(readingList).where(owned(ownerId, id)).returning({ id: readingList.id });
  return rows.length > 0;
}
