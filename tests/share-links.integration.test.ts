import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addBookToOwnedList } from "@/server/books";
import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { createList, deleteOwnedList, findOwnedList } from "@/server/lists";
import { setupDatabase } from "@/server/setup";
import { signShareToken } from "@/server/share-links";
import { resetDatabase, testDatabaseUrl } from "./support/db";

// Server Actions and pages run against the test database with a controllable signed-in user.
const current = vi.hoisted(() => ({ userId: null as string | null, db: null as unknown }));

vi.mock("@/server/runtime", () => ({ getDatabase: () => current.db }));
vi.mock("next/cache", () => ({ refresh: () => undefined }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }) }));
vi.mock("@/server/session", async () => {
  const { notFound, redirect } = await import("next/navigation");
  return {
    requireUser: async () => {
      if (!current.userId) redirect("/login");
      return { id: current.userId, name: "Test" };
    },
    requireUserOrNotFound: async () => {
      if (!current.userId) notFound();
      return { id: current.userId, name: "Test" };
    },
  };
});

const { createShareLinkAction } = await import("@/app/lists/share-actions");
const { deleteListAction, renameListAction } = await import("@/app/lists/actions");
const { addBookAction } = await import("@/app/lists/book-actions");
const { default: SharedListPage } = await import("@/app/s/[token]/page");
const { default: ListPage } = await import("@/app/lists/[id]/page");

const url = testDatabaseUrl();
const canary = "AGENTSAPP-CANARY-integration-test-value";
const saved = { canary: process.env.V0_SECRET_CANARY, appUrl: process.env.APP_URL };
let handle: DatabaseHandle;
let alice: string;
let bob: string;

const dune = { key: "/works/OL893415W", title: "Dune", authors: ["Frank Herbert"], firstPublishYear: 1965 };
const expiryForm = (value: string) => {
  const data = new FormData();
  data.append("expiresIn", value);
  return data;
};
const digestOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return String((error as { digest?: unknown }).digest ?? error);
  }
  throw new Error("expected a redirect or a 404");
};
const tokenOf = (shareUrl: string) => shareUrl.replace(/^http:\/\/app:8080\/s\//, "");
const openShare = async (token: string) =>
  renderToStaticMarkup(await SharedListPage({ params: Promise.resolve({ token }), searchParams: Promise.resolve({}) }));
const createLink = async (listId: string, expiresIn = "7d"): Promise<string> => {
  current.userId = alice;
  const state = await createShareLinkAction(listId, { status: "idle" }, expiryForm(expiresIn));
  if (state.status !== "created") throw new Error(`share link not created: ${JSON.stringify(state)}`);
  return state.url;
};

beforeAll(async () => {
  process.env.V0_SECRET_CANARY = canary;
  process.env.APP_URL = "http://app:8080";
  await resetDatabase(url);
  await setupDatabase({
    databaseUrl: url,
    secret: "test".repeat(8),
    baseURL: "http://localhost:8080",
    migrationsFolder: path.resolve("drizzle"),
  });
  handle = createDatabase(url);
  current.db = handle;
  const ids = Object.fromEntries((await handle.db.select().from(user)).map((u) => [u.email, u.id]));
  alice = ids["alice@example.test"];
  bob = ids["bob@example.test"];
});

afterAll(async () => {
  process.env.V0_SECRET_CANARY = saved.canary;
  process.env.APP_URL = saved.appUrl;
  vi.useRealTimers();
  await handle?.pool.end();
});

describe("creating share links", () => {
  let listId: string;
  beforeEach(async () => {
    listId = (await createList(handle.db, alice, "Shared list")).id;
  });

  it("gives the owner an absolute {APP_URL}/s/{token} link that never contains the key", async () => {
    const link = await createLink(listId);
    expect(link).toMatch(/^http:\/\/app:8080\/s\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(link).not.toContain(canary);
  });

  it("falls back to the request origin without APP_URL", async () => {
    delete process.env.APP_URL;
    try {
      current.userId = alice;
      const state = await createShareLinkAction(listId, { status: "idle" }, expiryForm("1d"));
      expect(state).toMatchObject({ status: "created", url: expect.stringMatching(/^http:\/\/localhost:3000\/s\//) });
    } finally {
      process.env.APP_URL = "http://app:8080";
    }
  });

  it("rejects unknown expiry options and a missing signing key", async () => {
    current.userId = alice;
    expect(await createShareLinkAction(listId, { status: "idle" }, expiryForm("30d"))).toMatchObject({
      status: "error",
    });
    delete process.env.V0_SECRET_CANARY;
    try {
      expect(await createShareLinkAction(listId, { status: "idle" }, expiryForm("7d"))).toMatchObject({
        status: "error",
        error: "Share links are unavailable. Please try again later.",
      });
    } finally {
      process.env.V0_SECRET_CANARY = canary;
    }
  });

  it("does not create links for another user or an anonymous visitor", async () => {
    current.userId = bob;
    expect(await digestOf(createShareLinkAction(listId, { status: "idle" }, expiryForm("7d")))).toContain(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    current.userId = null;
    expect(await digestOf(createShareLinkAction(listId, { status: "idle" }, expiryForm("7d")))).toContain("/login");
  });

  it("shows the expiry select (default 7 days) and the button on the owner's list page", async () => {
    current.userId = alice;
    const html = renderToStaticMarkup(
      await ListPage({ params: Promise.resolve({ id: listId }), searchParams: Promise.resolve({}) }),
    );
    expect(html).toMatch(/<label for="share-expires-in"[^>]*>Link expires in<\/label>/);
    expect(html).toMatch(/<option value="1m">1 minute<\/option>/);
    expect(html).toMatch(/<option value="1d">1 day<\/option>/);
    expect(html).toMatch(/<option value="7d" selected="">7 days<\/option>/);
    expect(html).toMatch(/>Create share link<\/button>/);
    expect(html).not.toContain(canary);
  });
});

describe("opening share links", () => {
  let listId: string;
  let otherId: string;
  beforeEach(async () => {
    listId = (await createList(handle.db, alice, "Alice's sci-fi")).id;
    otherId = (await createList(handle.db, alice, "Alice's poetry")).id;
    await addBookToOwnedList(handle.db, alice, listId, dune);
  });

  it("shows the list name and books to anonymous visitors, without any controls", async () => {
    const token = tokenOf(await createLink(listId));
    current.userId = null;
    const html = await openShare(token);
    expect(html).toMatch(/<h1[^>]*>Alice&#x27;s sci-fi<\/h1>/);
    expect(html).toContain("Dune");
    expect(html).toContain("Frank Herbert");
    for (const control of ["Edit", "Delete list", "Search", "Add", "Create share link"]) {
      expect(html).not.toContain(`>${control}<`);
    }
    expect(html).not.toMatch(/<(form|button|input|select)\b/);
    expect(html).not.toContain(canary);
  });

  it("shows each link's own list only", async () => {
    const a = tokenOf(await createLink(listId));
    const b = tokenOf(await createLink(otherId));
    const htmlA = await openShare(a);
    const htmlB = await openShare(b);
    expect(htmlA).toContain("Alice&#x27;s sci-fi");
    expect(htmlA).not.toContain("Alice&#x27;s poetry");
    expect(htmlB).toContain("Alice&#x27;s poetry");
    expect(htmlB).not.toContain("Alice&#x27;s sci-fi");
    expect(htmlB).not.toContain("Dune");
  });

  it("answers 404 for tampered, truncated and extended tokens", async () => {
    const token = tokenOf(await createLink(listId));
    const flip = (i: number) => token.slice(0, i) + (token[i] === "A" ? "B" : "A") + token.slice(i + 1);
    for (const bad of [flip(0), flip(10), flip(token.length - 1), token.slice(0, -1), `${token}A`, "x"]) {
      expect(await digestOf(openShare(bad))).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
    }
  });

  it("answers 404 once a 1-minute link has expired", async () => {
    const token = tokenOf(await createLink(listId, "1m"));
    expect(await openShare(token)).toContain("Alice&#x27;s sci-fi");
    vi.useFakeTimers({ now: Date.now() + 70_000, toFake: ["Date"] });
    try {
      expect(await digestOf(openShare(token))).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers 404 after the owner deleted the list", async () => {
    const token = tokenOf(await createLink(listId));
    await deleteOwnedList(handle.db, alice, listId);
    expect(await digestOf(openShare(token))).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("answers 404 for a well-formed token signed with another key", async () => {
    const forged = signShareToken("not-the-canary", listId, Math.floor(Date.now() / 1000) + 600);
    expect(await digestOf(openShare(forged))).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("does not let anonymous share-link visitors rename, delete or add books", async () => {
    await createLink(listId);
    current.userId = null;
    const rename = new FormData();
    rename.append("name", "Renamed");
    expect(await digestOf(renameListAction(listId, {}, rename))).toContain("/login");
    expect(await digestOf(deleteListAction(listId))).toContain("/login");
    const add = new FormData();
    add.append("key", "/works/OL1W");
    add.append("title", "Injected");
    expect(await digestOf(addBookAction(listId, { status: "idle" }, add))).toContain("/login");
    expect(await findOwnedList(handle.db, alice, listId)).toEqual({
      id: listId,
      name: "Alice's sci-fi",
      description: null,
    });
  });
});
