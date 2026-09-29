import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader, type SiteHeaderProps } from "./site-header";

export const MAIN_CONTENT_ID = "main-content";

/** Layout used by every page: skip link, header with primary navigation, main content area and footer. */
export function AppShell({ children, ...header }: SiteHeaderProps & { children: ReactNode }) {
  return (
    <>
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only rounded-md bg-white px-4 py-2 text-sm font-medium text-stone-900 shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <SiteHeader {...header} />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex w-full flex-1 flex-col outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
