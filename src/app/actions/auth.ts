"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/server/auth";
import { getAuth } from "@/server/runtime";

export interface AuthFormState {
  error?: string;
  name?: string;
  email?: string;
}

const text = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

// Deliberately loose: the address is not verified (non-goal); this only rejects obvious typos.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUp(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const name = text(formData, "name").trim();
  const email = text(formData, "email").trim().toLowerCase();
  const password = text(formData, "password");
  const kept = { name, email };
  if (name.length < 1 || [...name].length > 100)
    return { ...kept, error: "Name must be between 1 and 100 characters." };
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return { ...kept, error: "Enter a valid email address." };
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return { ...kept, error: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.` };
  }
  try {
    await getAuth().api.signUpEmail({ body: { name, email, password }, headers: await headers() });
  } catch (error) {
    if (isAPIError(error) && String(error.body?.code ?? "").startsWith("USER_ALREADY_EXISTS")) {
      return { ...kept, error: "An account with this email already exists. Sign in instead." };
    }
    throw error;
  }
  redirect("/lists");
}

export async function signIn(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = text(formData, "email").trim().toLowerCase();
  const password = text(formData, "password");
  try {
    await getAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (error) {
    if (isAPIError(error)) return { email, error: "Invalid email or password." };
    throw error;
  }
  redirect("/lists");
}

export async function signOut(): Promise<void> {
  const requestHeaders = await headers();
  const auth = getAuth();
  if (await auth.api.getSession({ headers: requestHeaders })) {
    await auth.api.signOut({ headers: requestHeaders });
  }
  redirect("/");
}
