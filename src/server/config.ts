import "server-only";

export interface ServerConfig {
  appEnv: string;
  appUrl: string | undefined;
  appSecret: string | undefined;
  release: string | undefined;
  databaseUrl: string;
  sentryDsn: string | undefined;
  publicSentryDsn: string | undefined;
  bookApiBaseUrl: string | undefined;
  /** HMAC-SHA256 key of share links (V0_SECRET_CANARY); server-only, never sent to the browser. */
  shareLinkKey: string | undefined;
}

const nonEmpty = (value: string | undefined): string | undefined => (value ? value : undefined);

/** Runtime configuration from the preview interface environment (read per call: values are set at container start). */
export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    appEnv: env.APP_ENV || "development",
    appUrl: nonEmpty(env.APP_URL),
    appSecret: nonEmpty(env.APP_SECRET),
    release: nonEmpty(env.APP_RELEASE),
    databaseUrl: env.DATABASE_URL ?? "",
    sentryDsn: nonEmpty(env.SENTRY_DSN),
    publicSentryDsn: nonEmpty(env.PUBLIC_SENTRY_DSN),
    bookApiBaseUrl: nonEmpty(env.BOOK_API_BASE_URL),
    shareLinkKey: nonEmpty(env.V0_SECRET_CANARY),
  };
}

/** The subset of configuration that is safe to send to the browser. Never add server secrets here. */
export interface PublicClientConfig {
  sentryDsn: string;
  release: string;
  environment: string;
}

export function getPublicClientConfig(config: ServerConfig = getServerConfig()): PublicClientConfig {
  return { sentryDsn: config.publicSentryDsn ?? "", release: config.release ?? "", environment: config.appEnv };
}
