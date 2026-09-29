import type { Metadata } from "next";
import { createListAction } from "@/app/lists/actions";
import { ListNameForm } from "@/app/lists/list-name-form";
import { PageCard } from "@/components/page-card";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "New list - Shared Reading Lists" };

export default async function NewListPage() {
  await requireUser();
  return (
    <PageCard title="New list" intro="Give your reading list a name. You can rename it later.">
      <ListNameForm action={createListAction} submitLabel="Create list" cancelHref="/lists" />
    </PageCard>
  );
}
