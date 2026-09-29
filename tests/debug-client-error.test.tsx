// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TriggerClientErrorButton } from "@/app/debug/client-error/trigger-client-error";

describe("/debug/client-error", () => {
  it('renders a "Trigger client error" button', () => {
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(<TriggerClientErrorButton />), "text/html");
    const button = doc.querySelector("button");
    expect(button?.textContent).toBe("Trigger client error");
    expect(button?.getAttribute("type")).toBe("button");
  });
});
