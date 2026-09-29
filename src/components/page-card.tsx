import type { ReactNode } from "react";

/** Centred card used by the sign-in, sign-up and list form pages. */
export function PageCard({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6 sm:py-16">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">{title}</h1>
        {intro ? <div className="mt-2 text-stone-700">{intro}</div> : null}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
