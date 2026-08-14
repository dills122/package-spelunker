import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constructPackageSnapshot } from "@package-spelunker/package-snapshot";
import {
  type CheckedInFixtureName,
  materializeCheckedInFixture,
} from "@package-spelunker/test-fixtures";
import { discoverWorkspacePackage } from "@package-spelunker/workspace-model";
import { afterEach, describe, expect, it } from "vitest";

import { type RuntimeLookupKind, resolveNodeRuntime } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("snapshot-backed Node runtime resolution", () => {
  it.each([
    {
      fixtureName: "npm-basic" as const,
      specifier: "fixture-pkg/feature",
      lookupKind: "import" as const,
      target: "dist/feature.js",
      moduleMode: "esm" as const,
      source: "installed" as const,
    },
    {
      fixtureName: "npm-basic" as const,
      specifier: "fixture-pkg/feature",
      lookupKind: "require" as const,
      target: "dist/feature.cjs",
      moduleMode: "commonjs" as const,
      source: "installed" as const,
    },
    {
      fixtureName: "pnpm-basic" as const,
      specifier: "fixture-pkg",
      lookupKind: "import" as const,
      target: "dist/index.js",
      moduleMode: "esm" as const,
      source: "installed" as const,
    },
    {
      fixtureName: "workspace-linked" as const,
      specifier: "@fixture/linked-pkg",
      lookupKind: "import" as const,
      target: "dist/index.js",
      moduleMode: "esm" as const,
      source: "workspace" as const,
    },
  ])(
    "resolves $fixtureName $lookupKind to the captured $target",
    async ({ fixtureName, specifier, lookupKind, target, moduleMode, source }) => {
      const captured = await captureFixture(fixtureName, specifier, lookupKind);

      expect(captured.snapshot.identity.source).toBe(source);
      expect(
        resolveNodeRuntime({
          snapshot: captured.snapshot,
          packageSubpath: captured.packageSubpath,
          lookupKind,
          conditions: ["node", lookupKind, "default"],
        }),
      ).toMatchObject({
        ok: true,
        value: { target, lookupKind, moduleMode },
      });
      await expect(access(captured.executionSentinel)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );
});

async function captureFixture(
  fixtureName: CheckedInFixtureName,
  specifier: string,
  lookupKind: RuntimeLookupKind,
) {
  const destination = await mkdtemp(join(tmpdir(), "node-resolution-test-"));
  temporaryDirectories.push(destination);
  const fixture = await materializeCheckedInFixture(fixtureName, destination);
  const discovery = await discoverWorkspacePackage({
    workspaceRoot: fixture.root,
    importer: "packages/app/src/index.ts",
    specifier,
  });
  if (!discovery.ok) throw new Error(JSON.stringify(discovery.failure));

  const snapshot = await constructPackageSnapshot({
    packageRoot: discovery.value.selectedPackage.root,
    approvedRoots: discovery.value.approvedRoots,
    source: discovery.value.selectedPackage.source,
    context: {
      importer: discovery.value.importer.path,
      specifier: discovery.value.requested.requested,
      conditions: ["node", lookupKind, "default"],
    },
  });
  if (!snapshot.ok) throw new Error(JSON.stringify(snapshot.failure));

  return {
    snapshot: snapshot.value,
    packageSubpath:
      discovery.value.requested.packageSubpath === undefined
        ? "."
        : `./${discovery.value.requested.packageSubpath}`,
    executionSentinel: fixture.executionSentinel,
  };
}
