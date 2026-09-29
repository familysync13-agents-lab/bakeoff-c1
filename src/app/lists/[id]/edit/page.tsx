import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { renameListAction } from "@/app/lists/actions";
import { ListNameForm } from "@/app/lists/list-name-form";
import { PageCard } from "@/components/page-card";
import { findOwnedList } from "@/server/lists";
import { getDatabase } from "@/server/runtime";
import { requireUserOrNotFound } from "@/server/session";

export const metadata: Metadata = { title: "Edit list - Shared Reading Lists" };

export default async function EditListPage({ params }: PageProps<"/lists/[id]/edit">) {
  const user = await requireUserOrNotFound();
  const { id } = await params;
  const list = await findOwnedList(getDatabase().db, user.id, id);
  if (!list) notFound();
  return (
    <PageCard title="Edit list">
      <ListNameForm
        action={renameListAction.bind(null, list.id)}
        submitLabel="Save"
        cancelHref={`/lists/${encodeURIComponent(list.id)}`}
        defaultName={list.name}
      />
    </PageCard>
  );
}
