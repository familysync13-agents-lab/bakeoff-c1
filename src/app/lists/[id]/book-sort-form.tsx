import Form from "next/form";
import { inputClass, labelClass, secondaryButtonClass } from "@/components/form-styles";

interface BookSortFormProps {
  /** The list page itself; submitting navigates to `{listPath}?sort={value}`. */
  listPath: string;
  options: readonly { value: string; label: string }[];
  selected: string;
}

/** Owner-only "Sort by" control of the list page: a view-only choice carried in the URL, never saved. */
export function BookSortForm({ listPath, options, selected }: BookSortFormProps) {
  return (
    // Keyed by the selection so the select shows the current URL's sort after a client-side navigation.
    <Form key={selected} action={listPath} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1.5 sm:w-56">
        <label htmlFor="book-sort" className={labelClass}>
          Sort by
        </label>
        <select id="book-sort" name="sort" defaultValue={selected} className={inputClass}>
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
    </Form>
  );
}
