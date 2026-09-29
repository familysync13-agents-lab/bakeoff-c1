"use client";

import { useActionState } from "react";
import { signIn, type AuthFormState } from "@/app/actions/auth";
import { FormAlert } from "@/components/form-alert";
import { inputClass, labelClass, primaryButtonClass } from "@/components/form-styles";

const initialState: AuthFormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initialState);
  const describedBy = state.error ? "login-error" : undefined;
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <FormAlert id="login-error" message={state.error} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className={labelClass}>
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={describedBy}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-password" className={labelClass}>
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={describedBy}
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        Sign in
      </button>
    </form>
  );
}
