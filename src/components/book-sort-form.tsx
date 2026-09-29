import { labelClass, secondaryButtonClass } from "./form-styles";

export interface BookSortFormProps {
  /** Path of the owner's list page; the form navigates to `{action}?sort={value}`. */
  action: string;
  options: readonly { value: string; label: string }[];
  selected: string;
}

/** "Sort by" control of the owner's list page: a plain GET form, so the order is in the URL and survives reloads. */
export function BookSortForm({ action, options, selected }: BookSortFormProps) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="book-sort" className={labelClass}>
          Sort by
        </label>
        <select
          id="book-sort"
          name="sort"
          defaultValue={selected}
          className="block h-11 rounded-lg border border-stone-300 bg-white px-3 text-base text-stone-900 shadow-sm focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={secondaryButtonClass}>
        Sort
      </button>
    </form>
  );
}
