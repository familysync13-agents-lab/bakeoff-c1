import { describe, expect, it } from "vitest";
import { LIST_NAME_ERROR, validateListName } from "@/server/lists";

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
