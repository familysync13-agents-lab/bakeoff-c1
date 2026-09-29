import { eq } from "drizzle-orm";
import type { Auth } from "../auth";
import type { Database } from "../db/client";
import { user } from "../db/schema";

export interface SeedUser {
  name: string;
  email: string;
  password: string;
}

// Synthetic preview/test accounts defined by the T0 contract (not secrets).
export const SEED_USERS: readonly SeedUser[] = [
  { name: "Alice", email: "alice@example.test", password: "Correct-Horse-1" },
  { name: "Bob", email: "bob@example.test", password: "Battery-Staple-2" },
];

/**
 * Idempotently creates the seed users with email+password credentials through Better Auth's own adapter and password
 * hashing, so they can sign in exactly like users who signed up. Existing users are left untouched; a user that is
 * missing its credential account (interrupted earlier run) gets one.
 */
export async function seedUsers(db: Database, auth: Auth, users: readonly SeedUser[] = SEED_USERS): Promise<void> {
  const ctx = await auth.$context;
  for (const seed of users) {
    const email = seed.email.toLowerCase();
    let [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (!existing) {
      const created = await ctx.internalAdapter.createUser(
        { name: seed.name, email, emailVerified: true },
        { method: "email-password" },
      );
      existing = { id: created.id };
    }
    const accounts = await ctx.internalAdapter.findAccounts(existing.id);
    if (!accounts.some((a) => a.providerId === "credential")) {
      await ctx.internalAdapter.linkAccount({
        userId: existing.id,
        providerId: "credential",
        accountId: existing.id,
        password: await ctx.password.hash(seed.password),
      });
    }
  }
}
