import { describe, expect, it } from "vitest";
import { GET } from "@/app/debug/server-error/route";
import { debugRoutesEnabled, getServerConfig } from "@/server/config";
import { scrubSecrets } from "@/server/error-scrubbing";

const CANARY = "AGENTSAPP-CANARY-test-value";

describe("debug routes", () => {
  it("are available outside production only", () => {
    expect(debugRoutesEnabled(getServerConfig({ APP_ENV: "preview" } as unknown as NodeJS.ProcessEnv))).toBe(true);
    expect(debugRoutesEnabled(getServerConfig({ APP_ENV: "test" } as unknown as NodeJS.ProcessEnv))).toBe(true);
    expect(debugRoutesEnabled(getServerConfig({ APP_ENV: "production" } as unknown as NodeJS.ProcessEnv))).toBe(false);
  });

  it("GET /debug/server-error throws an unhandled error without secrets in the message", () => {
    process.env.V0_SECRET_CANARY = CANARY;
    expect(() => GET()).toThrowError(/Forced server error/);
    try {
      GET();
    } catch (error) {
      expect(String((error as Error).stack)).not.toContain(CANARY);
    }
  });
});

describe("scrubSecrets", () => {
  it("removes secret values from every string and key of an event", () => {
    const event = {
      message: `boom ${CANARY}`,
      exception: {
        values: [{ type: "Error", value: `key=${CANARY}`, stacktrace: { frames: [{ vars: { k: CANARY } }] } }],
      },
      breadcrumbs: [{ message: `x${CANARY}x`, data: { [CANARY]: 1 } }],
      request: { url: `/s/${CANARY}`, headers: { cookie: CANARY } },
      level: "error",
      timestamp: 1,
    };
    const scrubbed = scrubSecrets(event, [CANARY, undefined, ""]);
    expect(JSON.stringify(scrubbed)).not.toContain(CANARY);
    expect(scrubbed.message).toBe("boom [Filtered]");
    expect(scrubbed.exception.values[0].type).toBe("Error");
    expect(scrubbed.timestamp).toBe(1);
  });

  it("handles cyclic data and leaves events without secrets unchanged", () => {
    const event: Record<string, unknown> = { message: "plain" };
    event.self = event;
    expect(scrubSecrets(event, [CANARY]).message).toBe("plain");
    expect(scrubSecrets({ message: CANARY }, [])).toEqual({ message: CANARY });
  });
});
