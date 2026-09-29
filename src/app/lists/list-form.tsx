"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ListFormState } from "@/app/lists/actions";
import { FormAlert } from "@/components/form-alert";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/components/form-styles";

interface ListFormProps {
  action: (state: ListFormState, formData: FormData) => Promise<ListFormState>;
  submitLabel: string;
  cancelHref: string;
  defaultName?: string;
  defaultDescription?: string;
}

/**
 * Name and description form shared by "create list" and "edit list". Validation happens on the server (no native
 * constraints), so an over-long value is re-displayed with an error instead of being silently truncated.
 */
export function ListForm({
  action,
  submitLabel,
  cancelHref,
  defaultName = "",
  defaultDescription = "",
}: ListFormProps) {
  const [state, formAction, pending] = useActionState(action, { name: defaultName, description: defaultDescription });
  const describedBy = (hint: string, field: "name" | "description") =>
    state.error && state.invalid?.includes(field) ? `${hint} list-form-error` : hint;
  const invalid = (field: "name" | "description") => (state.invalid?.includes(field) ? true : undefined);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <FormAlert id="list-form-error" message={state.error} />
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
          aria-invalid={invalid("name")}
          aria-describedby={describedBy("list-name-hint", "name")}
          className={inputClass}
        />
        <p id="list-name-hint" className="text-sm text-stone-600">
          Up to 100 characters.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="list-description" className={labelClass}>
          Description
        </label>
        <textarea
          id="list-description"
          name="description"
          rows={4}
          defaultValue={state.description}
          aria-invalid={invalid("description")}
          aria-describedby={describedBy("list-description-hint", "description")}
          className={textareaClass}
        />
        <p id="list-description-hint" className="text-sm text-stone-600">
          Optional. Up to 500 characters.
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
