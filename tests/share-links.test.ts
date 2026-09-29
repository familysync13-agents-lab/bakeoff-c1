import { describe, expect, it } from "vitest";
import {
  parseShareLinkExpiry,
  shareLinkExpirySeconds,
  shareUrl,
  signShareToken,
  verifyShareToken,
} from "@/server/share-links";

const key = "AGENTSAPP-CANARY-share-link-test";
const listA = "0b6c0f1e-3f0e-4c47-9d6e-4a1f2b3c4d5e";
const listB = "9f8e7d6c-5b4a-4321-8fed-cba987654321";
const now = Date.UTC(2026, 8, 29, 12, 0, 0);
const exp = now / 1000 + 60;
const base64urlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.";

describe("share link tokens", () => {
  it("round-trips the list and the expiry, and binds each token to its own list", () => {
    const a = signShareToken(key, listA, exp);
    const b = signShareToken(key, listB, exp);
    expect(verifyShareToken(key, a, now)).toEqual({ ok: true, listId: listA, expiresAt: exp });
    expect(verifyShareToken(key, b, now)).toEqual({ ok: true, listId: listB, expiresAt: exp });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  });

  it("rejects every single-character change, truncation and extension", () => {
    const token = signShareToken(key, listA, exp);
    for (let i = 0; i < token.length; i++) {
      for (const c of base64urlAlphabet) {
        if (c === token[i]) continue;
        const changed = token.slice(0, i) + c + token.slice(i + 1);
        expect(verifyShareToken(key, changed, now).ok, `${i}:${c}`).toBe(false);
      }
      expect(verifyShareToken(key, token.slice(0, i), now).ok).toBe(false);
      expect(verifyShareToken(key, token.slice(i + 1), now).ok).toBe(false);
    }
    for (const suffix of ["A", "=", ".", "%00", "x".repeat(600)]) {
      expect(verifyShareToken(key, token + suffix, now).ok).toBe(false);
      expect(verifyShareToken(key, suffix + token, now).ok).toBe(false);
    }
  });

  it("rejects tokens signed with another key, forged payloads and missing keys", () => {
    const token = signShareToken(key, listA, exp);
    expect(verifyShareToken("another-key", token, now)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyShareToken(undefined, token, now)).toEqual({ ok: false, reason: "invalid" });
    const [, signature] = token.split(".");
    const later = Buffer.from(`${listA}.${exp + 86_400}`).toString("base64url");
    expect(verifyShareToken(key, `${later}.${signature}`, now).ok).toBe(false);
    const other = Buffer.from(`${listB}.${exp}`).toString("base64url");
    expect(verifyShareToken(key, `${other}.${signature}`, now).ok).toBe(false);
    expect(() => signShareToken(undefined, listA, exp)).toThrow();
    expect(verifyShareToken(key, "", now).ok).toBe(false);
  });

  it("expires at the expiry time", () => {
    const token = signShareToken(key, listA, exp);
    expect(verifyShareToken(key, token, exp * 1000 - 1).ok).toBe(true);
    expect(verifyShareToken(key, token, exp * 1000)).toEqual({ ok: false, reason: "expired" });
    expect(verifyShareToken(key, token, now + 70_000)).toEqual({ ok: false, reason: "expired" });
  });

  it("never contains the signing key", () => {
    const token = signShareToken(key, listA, exp);
    expect(token).not.toContain(key);
    expect(Buffer.from(token.split(".")[0], "base64url").toString()).not.toContain(key);
  });
});

describe("share link options", () => {
  it("offers 1 minute, 1 day and 7 days", () => {
    expect(shareLinkExpirySeconds(parseShareLinkExpiry("1m")!)).toBe(60);
    expect(shareLinkExpirySeconds(parseShareLinkExpiry("1d")!)).toBe(86_400);
    expect(shareLinkExpirySeconds(parseShareLinkExpiry("7d")!)).toBe(604_800);
    expect(parseShareLinkExpiry("30d")).toBeNull();
    expect(parseShareLinkExpiry(null)).toBeNull();
  });

  it("builds absolute URLs below APP_URL", () => {
    expect(shareUrl("http://app:8080", "t.s")).toBe("http://app:8080/s/t.s");
    expect(shareUrl("http://app:8080/", "t.s")).toBe("http://app:8080/s/t.s");
  });
});
