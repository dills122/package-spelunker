import { posix } from "node:path";

import { describe, expect, it } from "vitest";

import {
  normalizeTypeScriptConditions,
  resolveTypeScriptDeclaration,
  type TypeScriptResolutionFileHost,
} from "../src/index.js";

describe("resolveTypeScriptDeclaration", () => {
  it.each([
    {
      lookupKind: "import" as const,
      expectedTarget: "types/import.d.mts",
    },
    {
      lookupKind: "require" as const,
      expectedTarget: "types/require.d.cts",
    },
  ])("selects the conditional $lookupKind declaration", ({ lookupKind, expectedTarget }) => {
    const conditions = normalizeTypeScriptConditions([lookupKind]);
    if (!conditions.ok) throw new Error("Expected valid test conditions.");

    const result = resolveTypeScriptDeclaration({
      snapshotId: "sha256:fixture",
      specifier: "fixture-pkg",
      importer: "/workspace/packages/app/src/index.ts",
      packageRoot: "/workspace/node_modules/fixture-pkg",
      tsconfigPath: null,
      projectOptions: { moduleResolution: "nodenext" },
      conditions: conditions.value,
      host: virtualHost({
        "/workspace/package.json": JSON.stringify({ private: true }),
        "/workspace/packages/app/package.json": JSON.stringify({ type: "module" }),
        "/workspace/packages/app/src/index.ts": "export {};",
        "/workspace/node_modules/fixture-pkg/package.json": JSON.stringify({
          name: "fixture-pkg",
          version: "1.0.0",
          exports: {
            ".": {
              import: {
                types: "./types/import.d.mts",
                default: "./dist/index.mjs",
              },
              require: {
                types: "./types/require.d.cts",
                default: "./dist/index.cjs",
              },
            },
          },
        }),
        "/workspace/node_modules/fixture-pkg/types/import.d.mts":
          "export declare const mode: 'import';",
        "/workspace/node_modules/fixture-pkg/types/require.d.cts":
          "export declare const mode: 'require';",
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        target: expectedTarget,
        compilerVersion: "6.0.3",
        tsconfigPath: null,
        moduleResolution: "nodenext",
        lookupKind,
        snapshotId: "sha256:fixture",
      },
    });
    if (result.ok) {
      expect(result.value.trace.length).toBeGreaterThan(0);
      expect(result.value.trace.every((step) => !step.path?.startsWith("/"))).toBe(true);
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.trace)).toBe(true);
    }
  });

  it("uses TypeScript typesVersions semantics when exports is absent", () => {
    const conditions = normalizeTypeScriptConditions(["import"]);
    if (!conditions.ok) throw new Error("Expected valid test conditions.");

    const result = resolveTypeScriptDeclaration({
      snapshotId: "sha256:types-versions",
      specifier: "fixture-pkg",
      importer: "/workspace/src/index.ts",
      packageRoot: "/workspace/node_modules/fixture-pkg",
      tsconfigPath: "tsconfig.json",
      projectOptions: { moduleResolution: "nodenext" },
      conditions: conditions.value,
      host: virtualHost({
        "/workspace/src/index.ts": "export {};",
        "/workspace/tsconfig.json": "{}",
        "/workspace/node_modules/fixture-pkg/package.json": JSON.stringify({
          name: "fixture-pkg",
          version: "1.0.0",
          types: "index.d.ts",
          typesVersions: { ">=6.0": { "*": ["ts6/*"] } },
        }),
        "/workspace/node_modules/fixture-pkg/index.d.ts": "export declare const version: 5;",
        "/workspace/node_modules/fixture-pkg/ts6/index.d.ts": "export declare const version: 6;",
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      value: { target: "ts6/index.d.ts", compilerVersion: "6.0.3" },
    });
  });

  it("reports a paths redirect outside the selected package as unsupported", () => {
    const conditions = normalizeTypeScriptConditions(["import"]);
    if (!conditions.ok) throw new Error("Expected valid test conditions.");

    const result = resolveTypeScriptDeclaration({
      snapshotId: "sha256:redirect",
      specifier: "fixture-pkg",
      importer: "/workspace/src/index.ts",
      packageRoot: "/workspace/node_modules/fixture-pkg",
      tsconfigPath: "tsconfig.json",
      projectOptions: {
        moduleResolution: "nodenext",
        baseUrl: "/workspace",
        paths: { "fixture-pkg": ["src/shim.ts"] },
      },
      conditions: conditions.value,
      host: virtualHost({
        "/workspace/src/index.ts": "export {};",
        "/workspace/src/shim.ts": "export declare const shim: true;",
        "/workspace/tsconfig.json": "{}",
        "/workspace/node_modules/fixture-pkg/package.json": JSON.stringify({
          name: "fixture-pkg",
          version: "1.0.0",
          types: "index.d.ts",
        }),
        "/workspace/node_modules/fixture-pkg/index.d.ts": "export declare const real: true;",
      }),
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "unsupported_context",
        message: "TypeScript resolved outside the selected package snapshot.",
      },
    });
  });

  it("does not expose compiler probes outside the virtual workspace root", () => {
    const conditions = normalizeTypeScriptConditions(["import"]);
    if (!conditions.ok) throw new Error("Expected valid test conditions.");
    const calls: string[] = [];
    const baseHost = virtualHost({ "/workspace/src/index.ts": "export {};" });
    const recordingHost: TypeScriptResolutionFileHost = {
      ...baseHost,
      fileExists(path) {
        calls.push(path);
        return baseHost.fileExists(path);
      },
      readFile(path) {
        calls.push(path);
        return baseHost.readFile(path);
      },
      directoryExists(path) {
        calls.push(path);
        return baseHost.directoryExists(path);
      },
      getDirectories(path) {
        calls.push(path);
        return baseHost.getDirectories(path);
      },
      realpath(path) {
        calls.push(path);
        return baseHost.realpath(path);
      },
    };

    resolveTypeScriptDeclaration({
      snapshotId: "sha256:contained",
      specifier: "missing-package",
      importer: "/workspace/src/index.ts",
      packageRoot: "/workspace/node_modules/missing-package",
      tsconfigPath: null,
      projectOptions: { moduleResolution: "nodenext" },
      conditions: conditions.value,
      host: recordingHost,
    });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((path) => path === "/workspace" || path.startsWith("/workspace/"))).toBe(
      true,
    );
  });

  it("does not report a JavaScript implementation as a declaration target", () => {
    const conditions = normalizeTypeScriptConditions(["require"]);
    if (!conditions.ok) throw new Error("Expected valid test conditions.");

    const result = resolveTypeScriptDeclaration({
      snapshotId: "sha256:javascript-only",
      specifier: "fixture-pkg",
      importer: "/workspace/src/index.ts",
      packageRoot: "/workspace/node_modules/fixture-pkg",
      tsconfigPath: null,
      projectOptions: { moduleResolution: "nodenext" },
      conditions: conditions.value,
      host: virtualHost({
        "/workspace/src/index.ts": "export {};",
        "/workspace/node_modules/fixture-pkg/package.json": JSON.stringify({
          name: "fixture-pkg",
          version: "1.0.0",
          main: "index.js",
        }),
        "/workspace/node_modules/fixture-pkg/index.js": "module.exports = {};",
      }),
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "resolution_failed",
        message: "TypeScript did not resolve a declaration for the selected package.",
      },
    });
  });

  it("rejects an unsafe inward package specifier", () => {
    const conditions = normalizeTypeScriptConditions(["import"]);
    if (!conditions.ok) throw new Error("Expected valid test conditions.");

    expect(
      resolveTypeScriptDeclaration({
        snapshotId: "sha256:unsafe",
        specifier: "../outside",
        importer: "/workspace/src/index.ts",
        packageRoot: "/workspace/node_modules/fixture-pkg",
        tsconfigPath: null,
        projectOptions: { moduleResolution: "nodenext" },
        conditions: conditions.value,
        host: virtualHost({}),
      }),
    ).toEqual({
      ok: false,
      failure: {
        code: "invalid_request",
        message: "TypeScript resolution input is not valid bounded workspace context.",
      },
    });
  });

  it("returns fixed cancellation and trace-limit failures", () => {
    const conditions = normalizeTypeScriptConditions(["import"]);
    if (!conditions.ok) throw new Error("Expected valid test conditions.");
    const controller = new AbortController();
    controller.abort();
    const input = {
      snapshotId: "sha256:limits",
      specifier: "fixture-pkg",
      importer: "/workspace/src/index.ts",
      packageRoot: "/workspace/node_modules/fixture-pkg",
      tsconfigPath: null,
      projectOptions: { moduleResolution: "nodenext" as const },
      conditions: conditions.value,
      host: virtualHost({}),
    };

    expect(resolveTypeScriptDeclaration({ ...input, signal: controller.signal })).toEqual({
      ok: false,
      failure: {
        code: "cancelled",
        message: "TypeScript declaration resolution was cancelled.",
      },
    });
    expect(
      resolveTypeScriptDeclaration({ ...input, limits: { maxResolverTraceSteps: 1 } }),
    ).toEqual({
      ok: false,
      failure: {
        code: "resource_limit_exceeded",
        message: "TypeScript resolution exceeded its configured trace budget.",
        limit: "maxResolverTraceSteps",
      },
    });
  });
});

function virtualHost(files: Readonly<Record<string, string>>): TypeScriptResolutionFileHost {
  const normalizedFiles = new Map(
    Object.entries(files).map(([path, contents]) => [posix.normalize(path), contents]),
  );
  const directories = new Set<string>(["/"]);
  for (const path of normalizedFiles.keys()) {
    let directory = posix.dirname(path);
    while (!directories.has(directory)) {
      directories.add(directory);
      directory = posix.dirname(directory);
    }
  }

  return {
    currentDirectory: "/workspace",
    fileExists(path) {
      return normalizedFiles.has(posix.normalize(path));
    },
    readFile(path) {
      return normalizedFiles.get(posix.normalize(path));
    },
    directoryExists(path) {
      return directories.has(posix.normalize(path));
    },
    getDirectories(path) {
      const directory = posix.normalize(path);
      return [...directories]
        .filter((candidate) => posix.dirname(candidate) === directory && candidate !== directory)
        .map((candidate) => posix.basename(candidate))
        .sort();
    },
    realpath(path) {
      return posix.normalize(path);
    },
  };
}
