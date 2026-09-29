import * as Sentry from "@sentry/nextjs";
import { dataCollection } from "./monitoring/sentry-options";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getServerConfig } = await import("./server/config");
  const { scrubSecrets } = await import("./server/error-scrubbing");
  const config = getServerConfig();
  if (!config.sentryDsn) return;
  // Server secrets never leave the process, even if one ends up in an error message, frame or breadcrumb.
  const secrets = [config.shareLinkKey, config.appSecret, config.databaseUrl];
  Sentry.init({
    dsn: config.sentryDsn,
    release: config.release,
    environment: config.appEnv,
    dataCollection,
    beforeSend: (event) => scrubSecrets(event, secrets),
  });
}

export const onRequestError = Sentry.captureRequestError;
