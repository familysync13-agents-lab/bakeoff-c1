"use server";

import { notFound, redirect } from "next/navigation";
import {
  createList,
  deleteOwnedList,
  updateOwnedList,
  validateListDescription,
  validateListName,
} from "@/server/lists";
import { getDatabase } from "@/server/runtime";
import { requireUser } from "@/server/session";

export interface ListFormState {
  error?: string;
  name?: string;
  description?: string;
  /** Fields whose submitted value was rejected (marked aria-invalid). */
  invalid?: ListFormField[];
}

export type ListFormField = "name" | "description";

type ListFormResult =
  { ok: true; name: string; description: string | null } | { ok: false; state: Required<ListFormState> };

// Every action re-checks the session and ownership: a replayed request from another session changes nothing.

const idOf = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) notFound();
  return value;
};

const text = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");

/** Validates name and description together; on failure the form is re-displayed with the submitted values. */
function parseListForm(formData: FormData): ListFormResult {
  const rawName = formData.get("name");
  const rawDescription = formData.get("description");
  const name = validateListName(rawName);
  const description = validateListDescription(rawDescription);
  if (name.ok && description.ok) return { ok: true, name: name.name, description: description.description };
  const results = [
    ["name", name],
    ["description", description],
  ] as const;
  const invalid = results.flatMap(([field, result]) => (result.ok ? [] : [field]));
  const error = results.flatMap(([, result]) => (result.ok ? [] : [result.error])).join(" ");
  return { ok: false, state: { error, invalid, name: text(rawName), description: text(rawDescription) } };
}

export async function createListAction(_state: ListFormState, formData: FormData): Promise<ListFormState> {
  const user = await requireUser();
  const result = parseListForm(formData);
  if (!result.ok) return result.state;
  const list = await createList(getDatabase().db, user.id, result.name, result.description);
  redirect(`/lists/${encodeURIComponent(list.id)}`);
}

export async function renameListAction(
  listId: string,
  _state: ListFormState,
  formData: FormData,
): Promise<ListFormState> {
  const user = await requireUser();
  const id = idOf(listId);
  const result = parseListForm(formData);
  if (!result.ok) return result.state;
  const fields = { name: result.name, description: result.description };
  if (!(await updateOwnedList(getDatabase().db, user.id, id, fields))) notFound();
  redirect(`/lists/${encodeURIComponent(id)}`);
}

export async function deleteListAction(listId: string): Promise<void> {
  const user = await requireUser();
  if (!(await deleteOwnedList(getDatabase().db, user.id, idOf(listId)))) notFound();
  redirect("/lists");
}
