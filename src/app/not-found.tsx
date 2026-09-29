import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 text-center sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-stone-900">Page not found</h1>
      <p className="mt-3 text-stone-700">This page does not exist or you do not have access to it.</p>
      <Link
        href="/"
        className="mt-6 inline-block font-semibold text-brand underline underline-offset-2 hover:text-brand-hover"
      >
        Go to the home page
      </Link>
    </div>
  );
}
