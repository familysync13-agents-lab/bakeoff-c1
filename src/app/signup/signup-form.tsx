"use client";

import { useActionState } from "react";
import { signUp, type AuthFormState } from "@/app/actions/auth";
import { FormAlert } from "@/components/form-alert";
import { inputClass, labelClass, primaryButtonClass } from "@/components/form-styles";

const initialState: AuthFormState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initialState);
  const describedBy = state.error ? "signup-error" : undefined;
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <FormAlert id="signup-error" message={state.error} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-name" className={labelClass}>
          Name
        </label>
        <input
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          defaultValue={state.name}
          aria-describedby={describedBy}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-email" className={labelClass}>
          Email
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          aria-describedby={describedBy}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-password" className={labelClass}>
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-describedby={describedBy ? `signup-password-hint ${describedBy}` : "signup-password-hint"}
          className={inputClass}
        />
        <p id="signup-password-hint" className="text-sm text-stone-600">
          At least 8 characters.
        </p>
      </div>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        Sign up
      </button>
    </form>
  );
}
