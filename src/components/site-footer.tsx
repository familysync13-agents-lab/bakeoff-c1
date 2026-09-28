/** App shell footer. Static content only (no dates or other values that change between renders). */
export function SiteFooter() {
  return (
    <footer className="border-t border-stone-200 bg-stone-100/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-8 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="font-semibold text-stone-800">Shared Reading Lists</p>
        <p>Create reading lists, add books and share them read-only.</p>
      </div>
    </footer>
  );
}
