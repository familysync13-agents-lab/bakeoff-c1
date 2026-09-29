import { inputClass, labelClass, secondaryButtonClass } from "@/components/form-styles";

interface BookSortFormProps {
  /** The list page path; the form navigates to `{listPath}?sort=...` (a view-only choice, nothing is saved). */
  listPath: string;
  options: readonly { value: string; label: string }[];
  selected: string;
}

/** Owner-only "Sort by" control for the list's books; a plain GET form, so it works without JavaScript. */
export function BookSortForm({ listPath, options, selected }: BookSortFormProps) {
  return (
    <form method="get" action={listPath} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1.5 sm:w-60">
        <label htmlFor="book-sort" className={labelClass}>
          Sort by
        </label>
        <select key={selected} id="book-sort" name="sort" defaultValue={selected} className={inputClass}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={`${secondaryButtonClass} shrink-0`}>
        Sort
      </button>
    </form>
  );
}
