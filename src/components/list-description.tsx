/** A list's plain-text description, shown directly below the page h1; renders nothing when the list has none. */
export function ListDescription({ description }: { description: string | null }) {
  if (!description) return null;
  return <p className="mt-3 text-base whitespace-pre-line break-words text-stone-700">{description}</p>;
}
