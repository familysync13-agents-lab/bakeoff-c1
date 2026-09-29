import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { ListBook } from "./books";
import type { Database } from "./db/client";
import { book, readingList } from "./db/schema";
import type { ReadingList } from "./lists";

/** Link lifetimes offered to the owner ("Link expires in"); the default is 7 days. */
export const SHARE_LINK_EXPIRIES = [
  { value: "1m", label: "1 minute", seconds: 60 * 60 },
  { value: "1d", label: "1 day", seconds: 24 * 60 * 60 },
  { value: "7d", label: "7 days", seconds: 7 * 24 * 60 * 60 },
] as const;
export type ShareLinkExpiry = (typeof SHARE_LINK_EXPIRIES)[number]["value"];
export const DEFAULT_SHARE_LINK_EXPIRY: ShareLinkExpiry = "7d";

export const SHARE_LINK_EXPIRY_ERROR = "Choose when the link expires.";
export const SHARE_LINK_UNAVAILABLE = "Share links are unavailable. Please try again later.";

export function parseShareLinkExpiry(raw: unknown): ShareLinkExpiry | null {
  return SHARE_LINK_EXPIRIES.find((option) => option.value === raw)?.value ?? null;
}

export function shareLinkExpirySeconds(expiry: ShareLinkExpiry): number {
  return SHARE_LINK_EXPIRIES.find((option) => option.value === expiry)!.seconds;
}

/*
 * Token = base64url("<listId>.<expiresAt unix seconds>") "." base64url(HMAC-SHA256(key, "share-link:v1:<listId>.<exp>")).
 * The key is V0_SECRET_CANARY, which never leaves the server; only the MAC is published. Verification recomputes the
 * complete canonical token and compares it in constant time, so any changed, removed or added character is rejected
 * (including non-canonical base64 spellings of the same bytes).
 */
const DOMAIN = "share-link:v1:";
const MAX_TOKEN_LENGTH = 512;

const mac = (key: string, payload: string): string =>
  createHmac("sha256", key)
    .update(DOMAIN + payload)
    .digest("base64url");

function requireKey(key: string | undefined): string {
  if (!key) throw new Error("share links are unavailable: V0_SECRET_CANARY is not configured");
  return key;
}

export function signShareToken(key: string | undefined, listId: string, expiresAt: number): string {
  if (!/^[0-9a-f-]{1,64}$/i.test(listId) || !Number.isSafeInteger(expiresAt) || expiresAt < 0) {
    throw new Error("invalid share link payload");
  }
  const payload = `${listId}.${expiresAt}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${mac(requireKey(key), payload)}`;
}

export type ShareTokenCheck =
  { ok: true; listId: string; expiresAt: number } | { ok: false; reason: "invalid" | "expired" };

/** Checks signature and expiry (`now` in milliseconds). Never throws for untrusted input. */
export function verifyShareToken(key: string | undefined, token: string, now: number = Date.now()): ShareTokenCheck {
  if (!key || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "invalid" };
  const [encodedPayload, signature, ...rest] = token.split(".");
  if (!encodedPayload || !signature || rest.length > 0) return { ok: false, reason: "invalid" };
  const match = /^([0-9a-f-]{1,64})\.(0|[1-9]\d{0,15})$/i.exec(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  );
  if (!match) return { ok: false, reason: "invalid" };
  const listId = match[1];
  const expiresAt = Number(match[2]);
  if (!Number.isSafeInteger(expiresAt)) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(signShareToken(key, listId, expiresAt), "utf8");
  const actual = Buffer.from(token, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: "invalid" };
  if (now >= expiresAt * 1000) return { ok: false, reason: "expired" };
  return { ok: true, listId, expiresAt };
}

/** Absolute share URL `{APP_URL}/s/{token}`. */
export function shareUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/s/${token}`;
}

// Read-only access for share-link visitors: deliberately not owner-scoped, because the verified token is the grant.
// A deleted list simply no longer exists (its books are removed with it), so its links answer 404.

export async function findSharedList(
  db: Database,
  listId: string,
): Promise<{ list: ReadingList; books: ListBook[] } | null> {
  const [list] = await db
    .select({ id: readingList.id, name: readingList.name })
    .from(readingList)
    .where(eq(readingList.id, listId));
  if (!list) return null;
  const books = await db
    .select({ id: book.id, title: book.title, authors: book.authors, firstPublishYear: book.firstPublishYear })
    .from(book)
    .where(eq(book.listId, list.id))
    .orderBy(asc(book.createdAt), asc(book.id));
  return { list, books };
}
