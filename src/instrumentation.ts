import * as Sentry from "@sentry/nextjs";
import { dataCollection } from "./monitoring/sentry-options";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getServerConfig } = await import("./server/config");
  const config = getServerConfig();
  if (!config.sentryDsn) return;
  Sentry.init({
    dsn: config.sentryDsn,
    release: config.release,
    environment: config.appEnv,
    dataCollection,
  });
}

export const onRequestError = Sentry.captureRequestError;
