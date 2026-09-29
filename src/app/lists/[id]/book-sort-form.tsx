import { inputClass, labelClass, secondaryButtonClass } from "@/components/form-styles";

interface BookSortFormProps {
  /** The list page itself: the form navigates to `{listPath}?sort=...` (view only, nothing is saved). */
  listPath: string;
  options: readonly { value: string; label: string }[];
  selected: string;
}

/** Owner-only "Sort by" control of the list page; a plain GET form, so it also works without JavaScript. */
export function BookSortForm({ listPath, options, selected }: BookSortFormProps) {
  return (
    <form action={listPath} method="get" autoComplete="off" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label htmlFor="book-sort" className={labelClass}>
        Sort by
      </label>
      <div className="w-40">
        <select id="book-sort" name="sort" defaultValue={selected} className={inputClass}>
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
