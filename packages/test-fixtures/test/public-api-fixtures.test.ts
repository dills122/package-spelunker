import { mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  materializePublicApiLimitFixture,
  materializePublicApiSemanticFixture,
  type PublicApiFixtureLayout,
  type PublicApiLimitDimension,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "package-spelunker-public-api-fixture-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("materializePublicApiSemanticFixture", () => {
  it("produces identical package-relative declaration bytes under npm, pnpm, and workspace links", async () => {
    const layouts: PublicApiFixtureLayout[] = ["npm", "pnpm", "workspace-linked"];
    const materialized = await Promise.all(
      layouts.map(async (layout) =>
        materializePublicApiSemanticFixture(layout, await createTemporaryDirectory()),
      ),
    );

    const packageContents = await Promise.all(
      materialized.map(async ({ packageRoot }) => {
        const paths = (await readdir(packageRoot, { recursive: true }))
          .filter((path) => path === "package.json" || path.endsWith(".d.ts"))
          .sort();
        return Promise.all(
          paths.map(
            async (path) => [path, await readFile(join(packageRoot, path), "utf8")] as const,
          ),
        );
      }),
    );

    expect(packageContents[1]).toEqual(packageContents[0]);
    expect(packageContents[2]).toEqual(packageContents[0]);
    expect(materialized.map(({ packageRoot, root }) => relative(root, packageRoot))).toEqual([
      join("node_modules", "semantic-fixture"),
      join("node_modules", ".pnpm", "semantic-fixture@1.0.0", "node_modules", "semantic-fixture"),
      join("packages", "semantic-fixture"),
    ]);
    for (const fixture of materialized) {
      expect(await realpath(fixture.selectedPackage)).toBe(await realpath(fixture.packageRoot));
      expect(relative(fixture.packageRoot, fixture.declarationTarget)).toBe("dist/index.d.ts");
    }
  });

  it("covers the alpha compiler semantics without runtime files or lifecycle scripts", async () => {
    const fixture = await materializePublicApiSemanticFixture(
      "npm",
      await createTemporaryDirectory(),
    );
    const packagePaths = await readdir(fixture.packageRoot, { recursive: true });
    const declarations = await Promise.all(
      packagePaths
        .filter((path) => path.endsWith(".d.ts"))
        .map((path) => readFile(join(fixture.packageRoot, path), "utf8")),
    );
    const combined = declarations.join("\n");
    const manifest = JSON.parse(
      await readFile(join(fixture.packageRoot, "package.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(packagePaths.every((path) => !path.endsWith(".js") && !path.endsWith(".cjs"))).toBe(
      true,
    );
    expect(manifest).not.toHaveProperty("scripts");
    expect(combined).toContain("export default function");
    expect(combined).toContain("export * from");
    expect(combined).toContain("export { original as aliased }");
    expect(combined).toContain("export interface Merged");
    expect(combined).toContain("export namespace Merged");
    expect(combined).toContain("function parse(value: string)");
    expect(combined).toContain("class Derived<T extends string = string>");
    expect(combined).toContain("private brand");
    expect(combined).toContain("protected inherited");
    expect(combined).toContain("@deprecated Use currentValue instead.");
    expect(combined).toContain('export * from "./cycle-b.js"');
    expect(combined).toContain('export * from "./cycle-a.js"');
  });
});

describe("materializePublicApiLimitFixture", () => {
  const dimensions: PublicApiLimitDimension[] = ["graph", "declarations", "symbols", "signatures"];

  it.each(dimensions)("generates exact below, at, and above cases for %s", async (dimension) => {
    const below = await materializePublicApiLimitFixture({
      dimension,
      boundary: "below",
      limit: 3,
      destination: await createTemporaryDirectory(),
    });
    const at = await materializePublicApiLimitFixture({
      dimension,
      boundary: "at",
      limit: 3,
      destination: await createTemporaryDirectory(),
    });
    const above = await materializePublicApiLimitFixture({
      dimension,
      boundary: "above",
      limit: 3,
      destination: await createTemporaryDirectory(),
    });

    expect([below.size, at.size, above.size]).toEqual([2, 3, 4]);
    expect([below.expectedOutcome, at.expectedOutcome, above.expectedOutcome]).toEqual([
      "complete",
      "complete",
      "resource_limit_exceeded",
    ]);
    for (const fixture of [below, at, above]) {
      expect(await readFile(fixture.declarationTarget, "utf8")).not.toContain(
        "FIXTURE_RUNTIME_EXECUTED",
      );
      await expectGeneratedSize(fixture.dimension, fixture.packageRoot, fixture.size);
    }
  });
});

async function expectGeneratedSize(
  dimension: PublicApiLimitDimension,
  packageRoot: string,
  size: number,
): Promise<void> {
  const declarationPaths = (await readdir(join(packageRoot, "dist"))).filter((path) =>
    path.endsWith(".d.ts"),
  );
  if (dimension === "graph") {
    expect(declarationPaths).toHaveLength(size + 1);
    return;
  }
  if (dimension === "declarations") {
    expect(declarationPaths).toHaveLength(size);
    return;
  }

  expect(declarationPaths).toEqual(["index.d.ts"]);
  const declaration = await readFile(join(packageRoot, "dist", "index.d.ts"), "utf8");
  const prefix =
    dimension === "symbols" ? "export declare const symbol" : "export declare function parse";
  expect(declaration.split("\n").filter((line) => line.startsWith(prefix))).toHaveLength(size);
}
