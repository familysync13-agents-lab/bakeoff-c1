import { getServerConfig } from "@/server/config";
import { getHealth } from "@/server/health";
import { getDatabase } from "@/server/runtime";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  const { appEnv } = getServerConfig();
  try {
    return Response.json(await getHealth(getDatabase().db, appEnv), { headers: noStore });
  } catch (error) {
    console.error("[healthz] database check failed:", error instanceof Error ? error.message : error);
    return Response.json({ status: "error", env: appEnv }, { status: 503, headers: noStore });
  }
}
