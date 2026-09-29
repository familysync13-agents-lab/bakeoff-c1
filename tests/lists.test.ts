import { describe, expect, it } from "vitest";
import { LIST_DESCRIPTION_ERROR, LIST_NAME_ERROR, validateListDescription, validateListName } from "@/server/lists";

describe("validateListName", () => {
  it("accepts 1 to 100 characters and trims surrounding whitespace", () => {
    expect(validateListName("X")).toEqual({ ok: true, name: "X" });
    expect(validateListName("  Summer reads  ")).toEqual({ ok: true, name: "Summer reads" });
    expect(validateListName("a".repeat(100))).toEqual({ ok: true, name: "a".repeat(100) });
  });

  it("counts characters, not UTF-16 code units", () => {
    expect(validateListName("📚".repeat(100)).ok).toBe(true);
    expect(validateListName("📚".repeat(101)).ok).toBe(false);
  });

  it("rejects empty, blank, missing and over-long names with a message mentioning the name", () => {
    for (const raw of ["", "   ", null, undefined, 42, "a".repeat(101)]) {
      expect(validateListName(raw)).toEqual({ ok: false, error: LIST_NAME_ERROR });
    }
    expect(LIST_NAME_ERROR).toMatch(/name/i);
  });
});

describe("validateListDescription", () => {
  it("accepts up to 500 characters and treats blank or missing as no description", () => {
    expect(validateListDescription("a".repeat(500))).toEqual({ ok: true, description: "a".repeat(500) });
    expect(validateListDescription("📚".repeat(500)).ok).toBe(true);
    for (const raw of ["", "   \n ", null, undefined])
      expect(validateListDescription(raw)).toEqual({ ok: true, description: null });
  });

  it("trims surrounding whitespace and counts a submitted CRLF line break as one character", () => {
    expect(validateListDescription("  Cosy mysteries\r\nfor winter  ")).toEqual({
      ok: true,
      description: "Cosy mysteries\nfor winter",
    });
    expect(validateListDescription(`${"a".repeat(249)}\r\n${"b".repeat(250)}`).ok).toBe(true);
  });

  it("rejects more than 500 characters with a message mentioning the description", () => {
    expect(validateListDescription("a".repeat(501))).toEqual({ ok: false, error: LIST_DESCRIPTION_ERROR });
    expect(validateListDescription("📚".repeat(501)).ok).toBe(false);
    expect(LIST_DESCRIPTION_ERROR).toMatch(/description/i);
  });
});
