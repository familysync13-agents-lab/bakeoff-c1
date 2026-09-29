import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListBooks } from "@/components/list-books";
import { ListDescription } from "@/components/list-description";
import { getServerConfig } from "@/server/config";
import { getDatabase } from "@/server/runtime";
import { findSharedList, verifyShareToken } from "@/server/share-links";

export const metadata: Metadata = {
  title: "Shared reading list - Shared Reading Lists",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Read-only view of a list for anyone holding a valid share link (no sign-in). Invalid, expired and deleted-list
 * links all answer 404 without revealing anything about the list. The page has no forms or Server Actions.
 */
export default async function SharedListPage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const check = verifyShareToken(getServerConfig().shareLinkKey, token);
  if (!check.ok) notFound();
  const shared = await findSharedList(getDatabase().db, check.listId);
  if (!shared) notFound();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm font-semibold text-stone-600">Shared reading list (read-only)</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight break-words text-stone-900">{shared.list.name}</h1>
      <ListDescription description={shared.list.description} />
      <ListBooks books={shared.books} />
    </div>
  );
}
