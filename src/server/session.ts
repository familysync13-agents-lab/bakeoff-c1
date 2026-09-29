import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./runtime";

export interface CurrentUser {
  id: string;
  name: string;
}

/** The signed-in user of the current request, or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session ? { id: session.user.id, name: session.user.name } : null;
}

/** The signed-in user; anonymous visitors are redirected to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
