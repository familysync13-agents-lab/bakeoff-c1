import { describe, expect, it } from "vitest";
import { getPublicClientConfig, getServerConfig } from "@/server/config";

const env = {
  APP_ENV: "preview",
  APP_RELEASE: "0123abcd",
  APP_SECRET: "app-secret-for-tests",
  DATABASE_URL: "postgres://app:dbpass@db:5432/preview",
  SENTRY_DSN: "http://server@ingest:9000/1",
  PUBLIC_SENTRY_DSN: "http://public@ingest:9000/1",
  V0_SECRET_CANARY: "AGENTSAPP-CANARY-test-value",
} as unknown as NodeJS.ProcessEnv;

describe("server configuration", () => {
  it("reads the preview interface environment", () => {
    expect(getServerConfig(env)).toMatchObject({
      appEnv: "preview",
      release: "0123abcd",
      sentryDsn: "http://server@ingest:9000/1",
      publicSentryDsn: "http://public@ingest:9000/1",
    });
  });

  it("treats empty DSNs as disabled", () => {
    const config = getServerConfig({ ...env, SENTRY_DSN: "", PUBLIC_SENTRY_DSN: "" });
    expect(config.sentryDsn).toBeUndefined();
    expect(getPublicClientConfig(config).sentryDsn).toBe("");
  });

  it("exposes only the public DSN, release and environment to the browser", () => {
    const pub = getPublicClientConfig(getServerConfig(env));
    expect(pub).toEqual({ sentryDsn: "http://public@ingest:9000/1", release: "0123abcd", environment: "preview" });
    const serialized = JSON.stringify(pub);
    for (const secret of [env.V0_SECRET_CANARY, env.APP_SECRET, "dbpass", env.SENTRY_DSN]) {
      expect(serialized).not.toContain(secret);
    }
  });
});
