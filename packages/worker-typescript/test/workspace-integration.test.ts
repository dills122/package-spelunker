import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveNodeRuntime } from "@package-spelunker/node-resolution";
import { constructPackageSnapshot } from "@package-spelunker/package-snapshot";
import { materializeCheckedInFixture } from "@package-spelunker/test-fixtures";
import { discoverWorkspacePackage } from "@package-spelunker/workspace-model";
import { afterEach, describe, expect, it } from "vitest";

import { prepareTypeScriptResolutionWorker, runTypeScriptResolutionWorker } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("workspace declaration resolution", () => {
  it.each([
    {
      fixture: "npm-basic" as const,
      specifier: "fixture-pkg/feature",
      runtimeTarget: "dist/feature.js",
      declarationTarget: "dist/feature.d.ts",
    },
    {
      fixture: "pnpm-basic" as const,
      specifier: "fixture-pkg",
      runtimeTarget: "dist/index.js",
      declarationTarget: "dist/index.d.ts",
    },
    {
      fixture: "workspace-linked" as const,
      specifier: "@fixture/linked-pkg",
      runtimeTarget: "dist/index.js",
      declarationTarget: "dist/index.d.ts",
    },
  ])(
    "keeps $fixture runtime and declaration targets independent",
    async ({ fixture, specifier, runtimeTarget, declarationTarget }) => {
      const destination = await mkdtemp(join(tmpdir(), "typescript-workspace-integration-"));
      temporaryDirectories.push(destination);
      await rm(destination, { recursive: true });
      const materialized = await materializeCheckedInFixture(fixture, destination);
      const tsconfigPath = join(materialized.root, "packages/app/tsconfig.json");
      await writeFile(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { module: "nodenext", moduleResolution: "nodenext" },
        }),
      );

      const discovery = await discoverWorkspacePackage({
        workspaceRoot: materialized.root,
        importer: "packages/app/src/index.ts",
        specifier,
      });
      expect(discovery.ok).toBe(true);
      if (!discovery.ok) return;

      const snapshot = await constructPackageSnapshot({
        packageRoot: discovery.value.selectedPackage.root,
        approvedRoots: discovery.value.approvedRoots,
        source: discovery.value.selectedPackage.source,
        context: {
          importer: discovery.value.importer.path,
          specifier,
          conditions: ["import", "node"],
          tsconfigPath: join(discovery.value.workspaceRoot, "packages/app/tsconfig.json"),
        },
      });
      expect(snapshot.ok, snapshot.ok ? undefined : JSON.stringify(snapshot.failure)).toBe(true);
      if (!snapshot.ok) return;

      const runtime = resolveNodeRuntime({
        snapshot: snapshot.value,
        packageSubpath:
          discovery.value.requested.packageSubpath === undefined
            ? "."
            : `./${discovery.value.requested.packageSubpath}`,
        lookupKind: "import",
        conditions: ["import", "node"],
      });
      expect(runtime).toMatchObject({ ok: true, value: { target: runtimeTarget } });

      const prepared = prepareTypeScriptResolutionWorker({
        operationId: `integration-${fixture}`,
        workspaceRoot: discovery.value.workspaceRoot,
        importer: discovery.value.importer.relativePath,
        packageEntryPath: discovery.value.selectedPackage.entryPath,
        packageRelativeRoot: discovery.value.selectedPackage.relativeRoot,
        tsconfigPath: discovery.value.configuration.tsconfig ?? null,
        specifier,
        typescriptConditions: ["import"],
        snapshot: snapshot.value,
      });
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;

      const declaration = await runTypeScriptResolutionWorker(prepared.value);
      expect(declaration).toMatchObject({
        ok: true,
        value: {
          target: declarationTarget,
          snapshotId: snapshot.value.identity.snapshotId,
          compilerVersion: "6.0.3",
          tsconfigPath: "packages/app/tsconfig.json",
        },
      });
      if (runtime.ok && declaration.ok) {
        expect(runtime.value.target).not.toBe(declaration.value.target);
        expect(runtime.value.trace.length).toBeGreaterThan(0);
        expect(declaration.value.trace.length).toBeGreaterThan(0);
      }
      await expect(access(materialized.executionSentinel)).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );
});
