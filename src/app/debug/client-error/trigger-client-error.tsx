"use client";

import { primaryButtonClass } from "@/components/form-styles";

/** Throws from the click handler: an unhandled browser error that the Sentry browser SDK reports. */
export function TriggerClientErrorButton() {
  return (
    <button
      type="button"
      className={primaryButtonClass}
      onClick={() => {
        throw new Error("Forced client error (/debug/client-error)");
      }}
    >
      Trigger client error
    </button>
  );
}
