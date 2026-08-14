import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { fixtureCatalog, getFixtureCase } from "../src/index.js";

const matrixPath = new URL("../../../fixtures/matrix.md", import.meta.url);

describe("fixtureCatalog", () => {
  it("uses unique stable IDs declared by the fixture matrix", async () => {
    const matrix = await readFile(matrixPath, "utf8");
    const ids = fixtureCatalog.map((fixture) => fixture.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(matrix).toContain(`| ${id} |`);
    }
  });

  it("pairs every implemented adversarial case with a positive control", () => {
    for (const fixture of fixtureCatalog) {
      expect(fixture.positive.kind).toBe("positive");
      expect(fixture.adversarial.kind).toBe("adversarial");
      expect(fixture.positive.prohibitsExecution).toBe(true);
      expect(fixture.adversarial.prohibitsExecution).toBe(true);
      expect(fixture.provenance).toBe("repository-owned");
    }
  });

  it("returns a fixture case by its stable ID", () => {
    expect(getFixtureCase("FS-001")).toMatchObject({
      id: "FS-001",
      area: "workspace-symlink",
    });
  });

  it("rejects an unknown fixture ID", () => {
    expect(() => getFixtureCase("UNKNOWN-001")).toThrowError("Unknown fixture ID: UNKNOWN-001");
  });
});
