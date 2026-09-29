import type { Metadata } from "next";
import Link from "next/link";
import { primaryButtonClass } from "@/components/form-styles";
import { listOwnedLists } from "@/server/lists";
import { getDatabase } from "@/server/runtime";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "My lists - Shared Reading Lists" };

export default async function ListsPage() {
  const user = await requireUser();
  const lists = await listOwnedLists(getDatabase().db, user.id);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">My lists</h1>
        <Link href="/lists/new" className={primaryButtonClass}>
          New list
        </Link>
      </div>
      {lists.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-stone-700">
          You have no reading lists yet. Create one to start collecting books.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {lists.map((list) => (
            <li key={list.id}>
              <Link
                href={`/lists/${encodeURIComponent(list.id)}`}
                className="block rounded-xl border border-stone-200 bg-white px-5 py-4 text-lg font-semibold break-words text-stone-900 shadow-sm hover:border-brand hover:text-brand"
              >
                {list.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
