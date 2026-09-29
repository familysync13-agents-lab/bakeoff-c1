"use server";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ownsReadingList } from "@/server/books";
import { getServerConfig } from "@/server/config";
import { getDatabase } from "@/server/runtime";
import { requireUser } from "@/server/session";
import {
  parseShareLinkExpiry,
  SHARE_LINK_EXPIRY_ERROR,
  SHARE_LINK_UNAVAILABLE,
  shareLinkExpirySeconds,
  shareUrl,
  signShareToken,
} from "@/server/share-links";

export type ShareLinkState =
  { status: "idle" } | { status: "created"; url: string } | { status: "error"; error: string };

const idOf = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) notFound();
  return value;
};

/** APP_URL, or (in local development without it) the origin the request was sent to. */
async function appBaseUrl(): Promise<string> {
  const configured = getServerConfig().appUrl;
  if (configured) return configured;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// Like the other list actions, this re-checks the session and ownership on every call: only the owner can mint links.
export async function createShareLinkAction(
  listId: string,
  _state: ShareLinkState,
  formData: FormData,
): Promise<ShareLinkState> {
  const user = await requireUser();
  const id = idOf(listId);
  if (!(await ownsReadingList(getDatabase().db, user.id, id))) notFound();
  const expiry = parseShareLinkExpiry(formData.get("expiresIn"));
  if (!expiry) return { status: "error", error: SHARE_LINK_EXPIRY_ERROR };
  const key = getServerConfig().shareLinkKey;
  if (!key) {
    console.warn("[share] share links are unavailable: signing key is not configured");
    return { status: "error", error: SHARE_LINK_UNAVAILABLE };
  }
  const expiresAt = Math.floor(Date.now() / 1000) + shareLinkExpirySeconds(expiry);
  return { status: "created", url: shareUrl(await appBaseUrl(), signShareToken(key, id, expiresAt)) };
}
