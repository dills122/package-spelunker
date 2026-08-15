import { describe, expect, it } from "vitest";

import { normalizeTypeScriptConditions } from "../src/index.js";

describe("normalizeTypeScriptConditions", () => {
  it("derives import mode and separates compiler-owned from custom conditions", () => {
    const result = normalizeTypeScriptConditions(
      ["types", "node", "import", "request-custom", "default"],
      ["project-custom"],
    );

    expect(result).toEqual({
      ok: true,
      value: {
        lookupKind: "import",
        conditions: ["default", "import", "node", "project-custom", "request-custom", "types"],
        customConditions: ["project-custom", "request-custom"],
      },
    });
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.conditions)).toBe(true);
      expect(Object.isFrozen(result.value.customConditions)).toBe(true);
    }
  });

  it("derives require mode and deduplicates merged custom conditions", () => {
    expect(
      normalizeTypeScriptConditions(["require", "custom", "custom"], ["custom", "project"]),
    ).toEqual({
      ok: true,
      value: {
        lookupKind: "require",
        conditions: ["custom", "default", "node", "project", "require", "types"],
        customConditions: ["custom", "project"],
      },
    });
  });

  it.each([
    { label: "neither lookup kind", request: ["types", "default"], project: [] },
    { label: "both lookup kinds", request: ["import", "require"], project: [] },
    { label: "empty condition", request: ["import", ""], project: [] },
    {
      label: "too many merged conditions",
      request: ["import"],
      project: Array.from({ length: 61 }, (_, index) => `project-${index}`),
    },
  ])("rejects $label", ({ request, project }) => {
    expect(normalizeTypeScriptConditions(request, project)).toEqual({
      ok: false,
      failure: {
        code: "invalid_request",
        message: "TypeScript conditions must select one bounded lookup kind.",
      },
    });
  });
});
