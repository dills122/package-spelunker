import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type CheckedInFixtureName,
  checkedInFixtureMatrixIds,
  checkedInFixtureNames,
  resolveCheckedInFixture,
} from "../src/index.js";

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

describe("checked-in workspace fixtures", () => {
  it("provides the planned npm, pnpm, and workspace-link layouts", () => {
    expect(checkedInFixtureNames).toEqual(["npm-basic", "pnpm-basic", "workspace-linked"]);

    for (const name of checkedInFixtureNames) {
      expect(relative(process.cwd(), resolveCheckedInFixture(name))).toBe(
        join("fixtures", "workspaces", name),
      );
    }
  });

  it("maps each layout to stable acceptance-matrix IDs", () => {
    expect(checkedInFixtureMatrixIds).toEqual({
      "npm-basic": ["CTX-002", "CFG-003", "EXP-001", "DECL-002"],
      "pnpm-basic": ["CFG-002", "CFG-003"],
      "workspace-linked": ["FS-001", "CFG-002"],
    });
  });

  it.each(checkedInFixtureNames)("keeps %s independent of lifecycle scripts", async (name) => {
    const root = resolveCheckedInFixture(name);
    const paths = await readdir(root, { recursive: true });
    const packageJsonPaths = paths.filter((path) => path.endsWith("package.json"));

    expect(packageJsonPaths.length).toBeGreaterThan(0);
    for (const path of packageJsonPaths) {
      expect(await readJson(join(root, path))).not.toHaveProperty("scripts");
    }
  });

  it("models subpaths, conditional exports, type-only exports, and declaration re-exports", async () => {
    const packageRoot = join(resolveCheckedInFixture("npm-basic"), "node_modules", "fixture-pkg");
    const manifest = await readJson(join(packageRoot, "package.json"));
    const declaration = await readFile(join(packageRoot, "dist", "index.d.ts"), "utf8");

    expect(manifest.exports).toMatchObject({
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./feature": { types: "./dist/feature.d.ts", import: "./dist/feature.js" },
      "./types-only": { types: "./dist/types-only.d.ts" },
    });
    expect(declaration).toContain('export { feature } from "./feature.js";');
  });

  it.each(checkedInFixtureNames)(
    "contains an execution sentinel in %s runtime code",
    async (name) => {
      const root = resolveCheckedInFixture(name);
      const paths = await readdir(root, { recursive: true });
      const runtimePaths = paths.filter(
        (path) => path.endsWith(".js") || path.endsWith(".cjs"),
      );

      expect(runtimePaths.length).toBeGreaterThan(0);
      for (const path of runtimePaths) {
        expect(await readFile(join(root, path), "utf8")).toContain("FIXTURE_RUNTIME_EXECUTED");
      }
    },
  );

  it("rejects an unknown checked-in fixture name", () => {
    expect(() => resolveCheckedInFixture("unknown" as CheckedInFixtureName)).toThrowError(
      "Unknown checked-in fixture: unknown",
    );
  });
});
