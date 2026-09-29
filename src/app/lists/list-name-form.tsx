"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ListFormState } from "@/app/lists/actions";
import { FormAlert } from "@/components/form-alert";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "@/components/form-styles";

interface ListNameFormProps {
  action: (state: ListFormState, formData: FormData) => Promise<ListFormState>;
  submitLabel: string;
  cancelHref: string;
  defaultName?: string;
}

/** Name form shared by "create list" and "edit list". Validation happens on the server (no native constraints). */
export function ListNameForm({ action, submitLabel, cancelHref, defaultName = "" }: ListNameFormProps) {
  const [state, formAction, pending] = useActionState(action, { name: defaultName });
  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <FormAlert id="list-name-error" message={state.error} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="list-name" className={labelClass}>
          Name
        </label>
        <input
          id="list-name"
          name="name"
          type="text"
          autoComplete="off"
          defaultValue={state.name}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "list-name-hint list-name-error" : "list-name-hint"}
          className={inputClass}
        />
        <p id="list-name-hint" className="text-sm text-stone-600">
          Up to 100 characters.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {submitLabel}
        </button>
        <Link href={cancelHref} className={secondaryButtonClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
