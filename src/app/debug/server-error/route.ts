import { debugRoutesEnabled } from "@/server/config";

export const dynamic = "force-dynamic";

/** Forced unhandled server error (HTTP 500) to verify error monitoring; reported through `onRequestError`. */
export function GET(): Response {
  if (!debugRoutesEnabled()) return new Response("Not Found", { status: 404 });
  throw new Error("Forced server error (GET /debug/server-error)");
}
