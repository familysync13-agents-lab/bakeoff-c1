"use server";

import { notFound, redirect } from "next/navigation";
import { createList, deleteOwnedList, renameOwnedList, validateListName } from "@/server/lists";
import { getDatabase } from "@/server/runtime";
import { requireUser } from "@/server/session";

export interface ListFormState {
  error?: string;
  name?: string;
}

// Every action re-checks the session and ownership: a replayed request from another session changes nothing.

const idOf = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) notFound();
  return value;
};

export async function createListAction(_state: ListFormState, formData: FormData): Promise<ListFormState> {
  const user = await requireUser();
  const raw = formData.get("name");
  const result = validateListName(raw);
  if (!result.ok) return { error: result.error, name: typeof raw === "string" ? raw : "" };
  const list = await createList(getDatabase().db, user.id, result.name);
  redirect(`/lists/${encodeURIComponent(list.id)}`);
}

export async function renameListAction(
  listId: string,
  _state: ListFormState,
  formData: FormData,
): Promise<ListFormState> {
  const user = await requireUser();
  const id = idOf(listId);
  const raw = formData.get("name");
  const result = validateListName(raw);
  if (!result.ok) return { error: result.error, name: typeof raw === "string" ? raw : "" };
  if (!(await renameOwnedList(getDatabase().db, user.id, id, result.name))) notFound();
  redirect(`/lists/${encodeURIComponent(id)}`);
}

export async function deleteListAction(listId: string): Promise<void> {
  const user = await requireUser();
  if (!(await deleteOwnedList(getDatabase().db, user.id, idOf(listId)))) notFound();
  redirect("/lists");
}
