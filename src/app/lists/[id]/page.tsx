import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookSearch } from "@/app/lists/[id]/book-search";
import { deleteListAction } from "@/app/lists/actions";
import { addBookAction, searchBooksAction } from "@/app/lists/book-actions";
import { formatAuthors, formatFirstPublished } from "@/components/book-text";
import { dangerButtonClass, secondaryButtonClass } from "@/components/form-styles";
import { listOwnedListBooks } from "@/server/books";
import { findOwnedList } from "@/server/lists";
import { getDatabase } from "@/server/runtime";
import { requireUserOrNotFound } from "@/server/session";

export const metadata: Metadata = { title: "Reading list - Shared Reading Lists" };

export default async function ListPage({ params }: PageProps<"/lists/[id]">) {
  const user = await requireUserOrNotFound();
  const { id } = await params;
  const { db } = getDatabase();
  const list = await findOwnedList(db, user.id, id);
  if (!list) notFound();
  const books = await listOwnedListBooks(db, user.id, list.id);
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
      <section aria-labelledby="books-heading" className="mt-10">
        <h2 id="books-heading" className="text-2xl font-bold tracking-tight text-stone-900">
          Books
        </h2>
        {books.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-stone-700">
            This list has no books yet.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {books.map((book) => (
              <li key={book.id} className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
                <p className="text-lg font-semibold break-words text-stone-900">{book.title}</p>
                <p className="break-words text-stone-700">{formatAuthors(book.authors)}</p>
                <p className="text-sm text-stone-600">{formatFirstPublished(book.firstPublishYear)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <BookSearch searchAction={searchBooksAction.bind(null, list.id)} addAction={addBookAction.bind(null, list.id)} />
    </div>
  );
}
