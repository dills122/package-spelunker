import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  materializeCheckedInFixture,
  materializeFixtureCase,
} from "@package-spelunker/test-fixtures";
import { afterEach, describe, expect, it } from "vitest";

import { readPackageManifest } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("readPackageManifest", () => {
  it("normalizes only first-slice package identity and resolution fields", async () => {
    const root = await createTemporaryDirectory("package-manifest-test-");
    const fixture = await materializeCheckedInFixture("npm-basic", root);
    const packageRoot = join(fixture.root, "node_modules", "fixture-pkg");

    const result = await readPackageManifest({
      packageRoot,
      approvedRoots: [fixture.root],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        manifest: {
          name: "fixture-pkg",
          version: "1.0.0",
          type: "module",
          exports: {
            ".": {
              import: "./dist/index.js",
              require: "./dist/index.cjs",
              types: "./dist/index.d.ts",
            },
            "./feature": {
              import: "./dist/feature.js",
              require: "./dist/feature.cjs",
              types: "./dist/feature.d.ts",
            },
            "./types-only": {
              types: "./dist/types-only.d.ts",
            },
          },
        },
        byteLength: 422,
        path: expect.objectContaining({ artifactRelativePath: "package.json" }),
        evidence: {
          kind: "file",
          path: "package.json",
          description: "Normalized package identity and resolution metadata.",
        },
      },
    });
    if (result.ok) {
      expect(Object.isFrozen(result.value.manifest)).toBe(true);
      expect(Object.isFrozen(result.value.manifest.exports)).toBe(true);
    }
  });

  it("CFG-001 distinguishes malformed JSON from a byte-limit failure", async () => {
    const fixture = await materializeFixtureCase(
      "CFG-001",
      "malformed",
      await createTemporaryDirectory("package-manifest-test-"),
    );

    const result = await readPackageManifest({
      packageRoot: requiredPath(fixture.paths, "packageRoot"),
      approvedRoots: [fixture.approvedRoot],
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "malformed_artifact",
        message: "Package manifest is not valid first-slice metadata.",
      },
    });
  });

  it("rejects a manifest without a complete package identity", async () => {
    const packageRoot = await createTemporaryDirectory("package-manifest-test-");
    await writeFile(join(packageRoot, "package.json"), '{"name":"missing-version"}\n');

    const result = await readPackageManifest({
      packageRoot,
      approvedRoots: [packageRoot],
    });

    expect(result).toMatchObject({ ok: false, failure: { code: "malformed_artifact" } });
  });
});

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function requiredPath(paths: Readonly<Record<string, string>>, name: string): string {
  const path = paths[name];
  if (path === undefined) throw new Error(`Fixture does not define path ${name}.`);
  return path;
}
