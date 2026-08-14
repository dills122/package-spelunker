import type { PackageSnapshot } from "@package-spelunker/package-snapshot";
import { describe, expect, it } from "vitest";

import { resolveNodeRuntime } from "../src/index.js";

describe("resolveNodeRuntime", () => {
  it("resolves exact and nested conditional exports from an immutable snapshot", () => {
    const snapshot = createSnapshot(
      {
        name: "fixture-pkg",
        version: "1.0.0",
        type: "module",
        exports: {
          ".": {
            import: {
              development: "./dist/development.js",
              default: "./dist/index.js",
            },
            require: "./dist/index.cjs",
          },
          "./feature": "./dist/feature.js",
        },
      },
      ["dist/development.js", "dist/index.js", "dist/index.cjs", "dist/feature.js"],
    );

    const result = resolveNodeRuntime({
      snapshot,
      packageSubpath: ".",
      lookupKind: "import",
      conditions: ["development", "import", "node", "default"],
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        target: "dist/development.js",
        lookupKind: "import",
        moduleMode: "esm",
        conditions: ["default", "development", "import", "node"],
      },
    });
    if (result.ok) {
      expect(result.value.usage.resolverTraceSteps).toBe(result.value.trace.length);
      expect(result.value.trace).toContainEqual({
        kind: "condition",
        condition: "development",
        outcome: "matched",
      });
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.trace)).toBe(true);
    }
  });

  it("keeps condition-object insertion order authoritative", () => {
    const snapshot = createSnapshot(
      {
        name: "fixture-pkg",
        version: "1.0.0",
        type: "module",
        exports: {
          default: "./fallback.cjs",
          import: "./index.js",
        },
      },
      ["fallback.cjs", "index.js"],
    );

    expect(
      resolveNodeRuntime({
        snapshot,
        packageSubpath: ".",
        lookupKind: "import",
        conditions: ["import"],
      }),
    ).toMatchObject({
      ok: true,
      value: { target: "fallback.cjs", lookupKind: "import", moduleMode: "commonjs" },
    });
  });

  it("resolves an exact package subpath", () => {
    const snapshot = createSnapshot(
      {
        name: "fixture-pkg",
        version: "1.0.0",
        type: "commonjs",
        exports: { "./feature": "./feature.js" },
      },
      ["feature.js"],
    );

    expect(
      resolveNodeRuntime({
        snapshot,
        packageSubpath: "./feature",
        lookupKind: "require",
        conditions: ["require"],
      }),
    ).toMatchObject({
      ok: true,
      value: { target: "feature.js", moduleMode: "commonjs" },
    });
  });

  it("does not fall through to main for an unexported subpath", () => {
    const snapshot = createSnapshot(
      {
        name: "fixture-pkg",
        version: "1.0.0",
        type: "module",
        main: "./legacy.js",
        exports: { ".": "./index.js" },
      },
      ["index.js", "legacy.js"],
    );

    expect(
      resolveNodeRuntime({
        snapshot,
        packageSubpath: "./private",
        lookupKind: "import",
        conditions: ["import"],
      }),
    ).toEqual({
      ok: false,
      failure: {
        code: "resolution_failed",
        message: "Package runtime target is not exported or does not exist in the snapshot.",
      },
    });
  });

  it("selects the most specific subpath pattern and substitutes nested segments", () => {
    const snapshot = createSnapshot(
      {
        name: "fixture-pkg",
        version: "1.0.0",
        type: "module",
        exports: {
          "./features/*": "./dist/features/*.js",
          "./features/private/*": "./dist/private/*.cjs",
        },
      },
      ["dist/features/a/b.js", "dist/private/a/b.cjs"],
    );

    const result = resolveNodeRuntime({
      snapshot,
      packageSubpath: "./features/private/a/b",
      lookupKind: "import",
      conditions: ["import"],
    });

    expect(result).toMatchObject({
      ok: true,
      value: { target: "dist/private/a/b.cjs", moduleMode: "commonjs" },
    });
    if (result.ok) {
      expect(result.value.trace).toContainEqual({
        kind: "pattern",
        key: "./features/private/*",
        replacement: "a/b",
      });
    }
  });

  it("uses the first resolvable array target and treats null as an exclusion", () => {
    const fallbackSnapshot = createSnapshot(
      {
        name: "fixture-pkg",
        version: "1.0.0",
        exports: ["../unsafe.js", null, "./index.js"],
      },
      ["index.js"],
    );
    const excludedSnapshot = createSnapshot(
      {
        name: "fixture-pkg",
        version: "1.0.0",
        exports: { "./private/*": null, "./*": "./*.js" },
      },
      ["private/secret.js"],
    );

    expect(
      resolveNodeRuntime({
        snapshot: fallbackSnapshot,
        packageSubpath: ".",
        lookupKind: "require",
        conditions: ["require"],
      }),
    ).toMatchObject({ ok: true, value: { target: "index.js", moduleMode: "commonjs" } });
    expect(
      resolveNodeRuntime({
        snapshot: excludedSnapshot,
        packageSubpath: "./private/secret",
        lookupKind: "import",
        conditions: ["import"],
      }),
    ).toMatchObject({ ok: false, failure: { code: "resolution_failed" } });
  });

  it.each([
    "../escape.js",
    "./../escape.js",
    "./node_modules/dependency/index.js",
    "./dist/%2e%2e/escape.js",
    "./dist/%2Fescape.js",
    "./dist\\index.js",
    "/absolute/index.js",
    "https://example.invalid/index.js",
  ])("rejects unsafe export target %s", (target) => {
    const snapshot = createSnapshot({ name: "fixture-pkg", version: "1.0.0", exports: target }, []);

    expect(
      resolveNodeRuntime({
        snapshot,
        packageSubpath: ".",
        lookupKind: "import",
        conditions: ["import"],
      }),
    ).toMatchObject({ ok: false, failure: { code: "malformed_artifact" } });
  });

  it("propagates cancellation and names exact traversal limits", () => {
    const snapshot = createSnapshot(
      {
        name: "fixture-pkg",
        version: "1.0.0",
        exports: { import: { node: "./index.js" } },
      },
      ["index.js"],
    );
    const controller = new AbortController();
    controller.abort();

    expect(
      resolveNodeRuntime({
        snapshot,
        packageSubpath: ".",
        lookupKind: "import",
        conditions: ["import"],
        signal: controller.signal,
      }),
    ).toMatchObject({ ok: false, failure: { code: "cancelled" } });
    expect(
      resolveNodeRuntime({
        snapshot,
        packageSubpath: ".",
        lookupKind: "import",
        conditions: ["import"],
        limits: { maxExportMapNodes: 1 },
      }),
    ).toMatchObject({
      ok: false,
      failure: { code: "resource_limit_exceeded", limit: "maxExportMapNodes" },
    });
    expect(
      resolveNodeRuntime({
        snapshot,
        packageSubpath: ".",
        lookupKind: "import",
        conditions: ["import"],
        limits: { maxGraphDepth: 1 },
      }),
    ).toMatchObject({
      ok: false,
      failure: { code: "resource_limit_exceeded", limit: "maxGraphDepth" },
    });
    expect(
      resolveNodeRuntime({
        snapshot,
        packageSubpath: ".",
        lookupKind: "import",
        conditions: ["import"],
        limits: { maxResolverTraceSteps: 1 },
      }),
    ).toMatchObject({
      ok: false,
      failure: { code: "resource_limit_exceeded", limit: "maxResolverTraceSteps" },
    });
  });
});

function createSnapshot(
  manifest: Record<string, unknown>,
  paths: readonly string[],
): PackageSnapshot {
  const encoder = new TextEncoder();
  const contents = new Map<string, Uint8Array>([
    ["package.json", encoder.encode(JSON.stringify(manifest))],
    ...paths.map((path) => [path, encoder.encode(`// ${path}\n`)] as const),
  ]);
  const files = [...contents].map(([path, bytes]) =>
    Object.freeze({
      path,
      kind: "file" as const,
      byteLength: bytes.byteLength,
      contentHash: `hash-${path}`,
    }),
  );

  return Object.freeze({
    identity: Object.freeze({
      snapshotId: "snapshot-id",
      name: String(manifest.name),
      version: String(manifest.version),
      source: "installed" as const,
      contentHash: "content-hash",
    }),
    context: Object.freeze({
      workspaceRoot: "." as const,
      importer: "packages/app/src/index.ts",
      specifier: String(manifest.name),
      conditions: Object.freeze(["import", "node"]),
    }),
    manifest: Object.freeze({
      name: String(manifest.name),
      version: String(manifest.version),
      type: manifest.type === "module" ? ("module" as const) : ("commonjs" as const),
    }),
    files: Object.freeze(files),
    directories: Object.freeze([]),
    evidence: Object.freeze([]),
    usage: Object.freeze({ artifactBytesRead: 0, filesVisited: files.length }),
    readFile(path: string): Uint8Array | undefined {
      const bytes = contents.get(path);
      return bytes === undefined ? undefined : Uint8Array.from(bytes);
    },
  });
}
