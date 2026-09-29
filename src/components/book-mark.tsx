/** Decorative product mark (an open book); hidden from assistive technology. */
export function BookMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <rect width="32" height="32" rx="8" className="fill-brand" />
      <path d="M8 10.5c2.8-.9 5.5-.6 8 1v11c-2.5-1.6-5.2-1.9-8-1z" className="fill-white" />
      <path d="M24 10.5c-2.8-.9-5.5-.6-8 1v11c2.5-1.6 5.2-1.9 8-1z" className="fill-amber-200" />
    </svg>
  );
}
