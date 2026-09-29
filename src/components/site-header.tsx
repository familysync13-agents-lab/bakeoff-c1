import Link from "next/link";
import { BookMark } from "./book-mark";

export interface SiteHeaderProps {
  /** Present when a user is signed in. */
  user?: { name: string } | null;
  /** Server Action that signs the user out (required when `user` is set). */
  signOutAction?: () => Promise<void>;
}

const navLink = "inline-flex h-9 items-center rounded-md px-3 text-stone-700 hover:bg-stone-100 hover:text-stone-900";
const navButton = "inline-flex h-9 items-center rounded-md bg-brand px-3.5 text-white shadow-sm hover:bg-brand-hover";

/** App shell header: product name (home link) and the primary navigation. */
export function SiteHeader({ user, signOutAction }: SiteHeaderProps) {
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
          {user ? (
            <ul className="flex items-center gap-1 text-sm font-medium">
              <li>
                <Link href="/lists" className={navLink}>
                  My lists
                </Link>
              </li>
              <li>
                <form action={signOutAction}>
                  <button type="submit" className={`${navButton} cursor-pointer`}>
                    Sign out
                  </button>
                </form>
              </li>
            </ul>
          ) : (
            <ul className="flex items-center gap-1 text-sm font-medium">
              <li>
                <Link href="/login" className={navLink}>
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/signup" className={navButton}>
                  Sign up
                </Link>
              </li>
            </ul>
          )}
        </nav>
      </div>
    </header>
  );
}
