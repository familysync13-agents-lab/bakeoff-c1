"use client";

import { useActionState } from "react";
import type { ShareLinkState } from "@/app/lists/share-actions";
import { FormAlert } from "@/components/form-alert";
import { inputClass, labelClass, secondaryButtonClass } from "@/components/form-styles";

type ShareLinkAction = (state: ShareLinkState, formData: FormData) => Promise<ShareLinkState>;

interface ShareLinkFormProps {
  /** Server Action bound to the list on the server (see the list page). */
  action: ShareLinkAction;
  options: readonly { value: string; label: string }[];
  defaultOption: string;
  signingKey?: string;
}

/** Owner-only: creates an expiring, signed read-only link to the list and shows it in a read-only field. */
export function ShareLinkForm({ action, options, defaultOption }: ShareLinkFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
  } satisfies ShareLinkState as ShareLinkState);
  return (
    <section
      aria-labelledby="share-heading"
      className="mt-10 flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <h2 id="share-heading" className="text-lg font-semibold text-stone-900">
        Share
      </h2>
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="share-expires-in" className={labelClass}>
            Link expires in
          </label>
          <select id="share-expires-in" name="expiresIn" defaultValue={defaultOption} className={inputClass}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className={`${secondaryButtonClass} shrink-0`}>
          Create share link
        </button>
      </form>
      {state.status === "error" ? <FormAlert id="share-link-error" message={state.error} /> : null}
      {state.status === "created" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="share-link" className={labelClass}>
            Share link
          </label>
          <input
            id="share-link"
            type="text"
            readOnly
            value={state.url}
            onFocus={(event) => event.currentTarget.select()}
            className={inputClass}
          />
          <p className="text-sm text-stone-600">Anyone with this link can view the list until it expires.</p>
        </div>
      ) : null}
    </section>
  );
}
