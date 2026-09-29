// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/app-shell";
import Home from "@/app/page";

function render(): Document {
  const html = renderToStaticMarkup(
    <AppShell>
      <Home />
    </AppShell>,
  );
  return new DOMParser().parseFromString(`<!doctype html><html lang="en"><body>${html}</body></html>`, "text/html");
}

const links = (doc: Document, name: string) =>
  [...doc.querySelectorAll("a")].filter((a) => a.textContent?.trim() === name).map((a) => a.getAttribute("href"));

describe("landing page and app shell", () => {
  it("has exactly one h1 with the product name", () => {
    const h1s = [...render().querySelectorAll("h1")];
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toContain("Shared Reading Lists");
  });

  it("links Sign up to /signup and Sign in to /login in the primary navigation", () => {
    const doc = render();
    const nav = doc.querySelector('header nav[aria-label="Primary"]');
    expect(nav).not.toBeNull();
    expect(links(doc, "Sign up")).toEqual(["/signup"]);
    expect(links(doc, "Sign in")).toEqual(["/login"]);
    expect(nav?.textContent).toContain("Sign up");
    expect(nav?.textContent).toContain("Sign in");
  });

  it("renders header, one main landmark and footer", () => {
    const doc = render();
    expect(doc.querySelectorAll("header")).toHaveLength(1);
    expect(doc.querySelectorAll("main")).toHaveLength(1);
    expect(doc.querySelectorAll("footer")).toHaveLength(1);
    const skip = doc.querySelector('a[href^="#"]');
    expect(doc.getElementById(skip?.getAttribute("href")?.slice(1) ?? "")?.tagName).toBe("MAIN");
  });

  it("explains creating lists, adding books and read-only sharing", () => {
    const text = render().body.textContent ?? "";
    expect(text).toContain("Create reading lists");
    expect(text).toContain("Add books");
    expect(text).toContain("Share them read-only");
  });
});

describe("app shell when signed in", () => {
  const signOut = async () => {};
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html lang="en"><body>${renderToStaticMarkup(
      <AppShell user={{ name: "Alice" }} signOutAction={signOut}>
        <p>content</p>
      </AppShell>,
    )}</body></html>`,
    "text/html",
  );

  it("shows a Sign out button and a link to the user's lists instead of Sign in / Sign up", () => {
    const buttons = [...doc.querySelectorAll("header button")].map((b) => b.textContent?.trim());
    expect(buttons).toEqual(["Sign out"]);
    expect(links(doc, "My lists")).toEqual(["/lists"]);
    expect(links(doc, "Sign in")).toEqual([]);
    expect(links(doc, "Sign up")).toEqual([]);
  });
});
