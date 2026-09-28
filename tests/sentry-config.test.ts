import { describe, expect, it } from "vitest";
import { readClientSentryConfig, SENTRY_META } from "@/client/sentry-config";

const reader = (values: Record<string, string>) => (name: string) => values[name];

describe("readClientSentryConfig", () => {
  it("returns release and environment with the DSN", () => {
    const config = readClientSentryConfig(
      reader({
        [SENTRY_META.dsn]: "http://public@ingest:9000/1",
        [SENTRY_META.release]: "abc123",
        [SENTRY_META.environment]: "preview",
      }),
    );
    expect(config).toEqual({ dsn: "http://public@ingest:9000/1", release: "abc123", environment: "preview" });
  });

  it("disables monitoring when the DSN is empty or missing", () => {
    expect(
      readClientSentryConfig(reader({ [SENTRY_META.dsn]: "  ", [SENTRY_META.environment]: "preview" })),
    ).toBeNull();
    expect(readClientSentryConfig(reader({}))).toBeNull();
  });
});
