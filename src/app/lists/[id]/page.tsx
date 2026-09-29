import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookSearch } from "@/app/lists/[id]/book-search";
import { BookSortForm } from "@/app/lists/[id]/book-sort-form";
import { ShareLinkForm } from "@/app/lists/[id]/share-link-form";
import { deleteListAction } from "@/app/lists/actions";
import { addBookAction, searchBooksAction } from "@/app/lists/book-actions";
import { createShareLinkAction } from "@/app/lists/share-actions";
import { dangerButtonClass, secondaryButtonClass } from "@/components/form-styles";
import { ListBooks } from "@/components/list-books";
import { ListDescription } from "@/components/list-description";
import { BOOK_SORTS, parseBookSort, sortListBooks } from "@/server/book-sort";
import { listOwnedListBooks } from "@/server/books";
import { findOwnedList } from "@/server/lists";
import { getDatabase } from "@/server/runtime";
import { requireUserOrNotFound } from "@/server/session";
import { DEFAULT_SHARE_LINK_EXPIRY, SHARE_LINK_EXPIRIES } from "@/server/share-links";

const shareLinkOptions = SHARE_LINK_EXPIRIES.map(({ value, label }) => ({ value, label }));
const bookSortOptions = BOOK_SORTS.map(({ value, label }) => ({ value, label }));

export const metadata: Metadata = { title: "Reading list - Shared Reading Lists" };

export default async function ListPage({ params, searchParams }: PageProps<"/lists/[id]">) {
  const user = await requireUserOrNotFound();
  const { id } = await params;
  const { db } = getDatabase();
  const list = await findOwnedList(db, user.id, id);
  if (!list) notFound();
  const sort = parseBookSort((await searchParams).sort);
  const books = sortListBooks(await listOwnedListBooks(db, user.id, list.id), sort);
  const listPath = `/lists/${encodeURIComponent(list.id)}`;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/lists"
        className="text-sm font-semibold text-brand underline underline-offset-2 hover:text-brand-hover"
      >
        Back to my lists
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight break-words text-stone-900">{list.name}</h1>
      <ListDescription description={list.description} />
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href={`${listPath}/edit`} className={secondaryButtonClass}>
          Edit
        </Link>
        <form action={deleteListAction.bind(null, list.id)}>
          <button type="submit" className={`${dangerButtonClass} w-full sm:w-auto`}>
            Delete list
          </button>
        </form>
      </div>
      <ListBooks
        books={books}
        controls={
          books.length > 0 ? <BookSortForm listPath={listPath} options={bookSortOptions} selected={sort} /> : null
        }
      />
      <ShareLinkForm
        action={createShareLinkAction.bind(null, list.id)}
        options={shareLinkOptions}
        defaultOption={DEFAULT_SHARE_LINK_EXPIRY}
      />
      <BookSearch searchAction={searchBooksAction.bind(null, list.id)} addAction={addBookAction.bind(null, list.id)} />
    </div>
  );
}
