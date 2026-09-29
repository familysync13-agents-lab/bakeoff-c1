// Browser error-monitoring configuration, rendered by the root layout as <meta> tags at request time
// (APP_ENV and the DSN are runtime values of the preview, not build-time constants).
export const SENTRY_META = {
  dsn: "app-sentry-dsn",
  release: "app-release",
  environment: "app-env",
} as const;

export interface ClientSentryConfig {
  dsn: string;
  release: string | undefined;
  environment: string | undefined;
}

type MetaReader = (name: string) => string | null | undefined;

/** Returns the browser Sentry options, or null when no DSN is configured (monitoring disabled). */
export function readClientSentryConfig(readMeta: MetaReader): ClientSentryConfig | null {
  const dsn = readMeta(SENTRY_META.dsn)?.trim();
  if (!dsn) return null;
  return {
    dsn,
    release: readMeta(SENTRY_META.release) || undefined,
    environment: readMeta(SENTRY_META.environment) || undefined,
  };
}
