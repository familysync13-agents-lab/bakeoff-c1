import { count } from "drizzle-orm";
import type { Database } from "./db/client";
import { user } from "./db/schema";

export interface Health {
  status: "ok";
  env: string;
  users: number;
}

export async function getHealth(db: Database, appEnv: string): Promise<Health> {
  const [row] = await db.select({ users: count() }).from(user);
  return { status: "ok", env: appEnv, users: Number(row?.users ?? 0) };
}
