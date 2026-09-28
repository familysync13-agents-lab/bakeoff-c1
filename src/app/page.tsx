import Link from "next/link";

const steps = [
  {
    title: "Create reading lists",
    body: "Start a list for anything: a book club, a course, summer holidays or simply what to read next.",
  },
  {
    title: "Add books",
    body: "Search the book catalogue by title or author and add results to a list with one click.",
  },
  {
    title: "Share them read-only",
    body: "Send a link that anyone can open without an account. They see the list and its books; only you can change it.",
  },
] as const;

const sampleBooks = [
  { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", year: 1969, cover: "bg-amber-300" },
  { title: "Middlemarch", author: "George Eliot", year: 1871, cover: "bg-emerald-300" },
  { title: "Beloved", author: "Toni Morrison", year: 1987, cover: "bg-rose-300" },
] as const;

const primaryButton =
  "inline-flex h-11 items-center justify-center rounded-lg bg-brand px-5 text-base font-semibold text-white shadow-sm hover:bg-brand-hover";
const secondaryButton =
  "inline-flex h-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-5 text-base font-semibold text-stone-800 hover:border-stone-400 hover:bg-stone-50";

export default function Home() {
  return (
    <>
      <section aria-labelledby="hero-title" className="w-full">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-16 md:pb-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:pt-24 lg:pb-28">
          <div>
            <p className="text-sm font-semibold tracking-wide text-brand uppercase">Reading lists, made shareable</p>
            <h1
              id="hero-title"
              className="mt-3 text-4xl font-bold tracking-tight text-balance text-stone-900 sm:text-5xl lg:text-6xl"
            >
              Shared Reading Lists
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-pretty text-stone-700">
              Keep the books you want to read in tidy lists, add titles in seconds, and share any list with a read-only
              link. Friends, classmates and book clubs can follow along without signing up.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className={primaryButton}>
                Create your first list
              </Link>
              <Link href="/login" className={secondaryButton}>
                I already have an account
              </Link>
            </div>
          </div>
          <SampleList />
        </div>
      </section>

      <section aria-labelledby="how-title" className="w-full border-t border-stone-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <h2 id="how-title" className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            How it works
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-stone-700">
            Three simple steps from a pile of recommendations to a list you can hand to anyone.
          </p>
          <ol className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-stone-200 bg-paper p-6">
                <span
                  aria-hidden="true"
                  className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white"
                >
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-stone-900">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-stone-700">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="cta-title" className="w-full">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="flex flex-col items-start gap-6 rounded-3xl bg-brand px-6 py-10 sm:px-10 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 id="cta-title" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Your next great read, ready to share
              </h2>
              <p className="mt-2 max-w-xl text-emerald-50">Make an account and start your first reading list.</p>
            </div>
            <Link
              href="/signup"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-white px-5 text-base font-semibold text-brand shadow-sm hover:bg-emerald-50"
            >
              Get started
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/** Static illustration of a shared list (sample content, not user data). */
function SampleList() {
  return (
    <figure className="w-full max-w-md justify-self-center lg:justify-self-end">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-stone-900">Book club: autumn</p>
            <p className="text-sm text-stone-600">3 books</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
            Read-only link
          </span>
        </div>
        <ul className="mt-5 divide-y divide-stone-100">
          {sampleBooks.map((book) => (
            <li key={book.title} className="flex items-center gap-4 py-3">
              <span aria-hidden="true" className={`h-14 w-10 shrink-0 rounded-sm shadow-sm ${book.cover}`} />
              <span className="min-w-0">
                <span className="block truncate font-medium text-stone-900">{book.title}</span>
                <span className="block text-sm text-stone-600">
                  {book.author} · {book.year}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="mt-3 text-center text-sm text-stone-600">
        An example list, as a friend sees it through a share link.
      </figcaption>
    </figure>
  );
}
