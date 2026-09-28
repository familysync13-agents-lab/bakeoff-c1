import Link from "next/link";
import { BookMark } from "./book-mark";

/** App shell header: product name (home link) and the primary navigation. */
export function SiteHeader() {
  return (
    <header className="border-b border-stone-200 bg-paper/90">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-stone-900 sm:text-base"
        >
          <BookMark className="hidden size-7 shrink-0 sm:block" />
          <span>Shared Reading Lists</span>
        </Link>
        <nav aria-label="Primary">
          <ul className="flex items-center gap-1 text-sm font-medium">
            <li>
              <Link
                href="/login"
                className="inline-flex h-9 items-center rounded-md px-3 text-stone-700 hover:bg-stone-100 hover:text-stone-900"
              >
                Sign in
              </Link>
            </li>
            <li>
              <Link
                href="/signup"
                className="inline-flex h-9 items-center rounded-md bg-brand px-3.5 text-white shadow-sm hover:bg-brand-hover"
              >
                Sign up
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
