import { describe, expect, it } from "vitest";

import { normalizeRuntimeConditions } from "../src/index.js";

describe("normalizeRuntimeConditions", () => {
  it("derives the import lookup kind and canonicalizes built-in and custom conditions", () => {
    const result = normalizeRuntimeConditions(["development", "node", "import", "custom"]);

    expect(result).toEqual({
      ok: true,
      value: {
        lookupKind: "import",
        conditions: ["custom", "default", "development", "import", "node"],
      },
    });
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.conditions)).toBe(true);
    }
  });

  it("restores required built-ins and deduplicates custom conditions", () => {
    expect(normalizeRuntimeConditions(["require", "custom", "custom"])).toEqual({
      ok: true,
      value: {
        lookupKind: "require",
        conditions: ["custom", "default", "node", "require"],
      },
    });
  });

  it("accepts the public contract boundary of 64 conditions", () => {
    const conditions = ["import", ...Array.from({ length: 63 }, (_, index) => `custom-${index}`)];

    expect(normalizeRuntimeConditions(conditions)).toMatchObject({
      ok: true,
      value: { lookupKind: "import" },
    });
  });

  it.each([
    { label: "neither lookup kind", conditions: ["node", "default"] },
    { label: "both lookup kinds", conditions: ["import", "require"] },
    { label: "an empty condition", conditions: ["import", ""] },
    { label: "too many conditions", conditions: ["import", ...Array(64).fill("custom")] },
  ])("rejects $label", ({ conditions }) => {
    expect(normalizeRuntimeConditions(conditions)).toEqual({
      ok: false,
      failure: {
        code: "invalid_request",
        message: "Runtime conditions must select exactly one bounded Node lookup kind.",
      },
    });
  });
});
