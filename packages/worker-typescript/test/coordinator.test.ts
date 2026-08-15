import { posix } from "node:path";

import { describe, expect, it } from "vitest";

import {
  runTypeScriptResolutionWorker,
  type TypeScriptWorkerFileBroker,
  type TypeScriptWorkerRequestV1,
} from "../src/index.js";

const request: TypeScriptWorkerRequestV1 = {
  protocolVersion: "1",
  operation: "resolve-declaration",
  operationId: "operation-fixture",
  snapshotId: "sha256:fixture",
  specifier: "fixture-pkg",
  importer: "/workspace/packages/app/src/index.ts",
  packageRoot: "/workspace/node_modules/fixture-pkg",
  tsconfigPath: null,
  projectOptions: {
    moduleResolution: "nodenext",
    resolvePackageJsonExports: true,
  },
  conditions: {
    lookupKind: "import",
    conditions: ["default", "import", "node", "types"],
    customConditions: [],
  },
  limits: { maxResolverTraceSteps: 10000 },
};

describe("runTypeScriptResolutionWorker", () => {
  it("resolves through the real child and broker without ambient workspace reads", async () => {
    const calls: string[] = [];
    const broker = virtualBroker(
      {
        "/workspace/packages/app/package.json": JSON.stringify({ type: "module" }),
        "/workspace/packages/app/src/index.ts": "export {};",
        "/workspace/node_modules/fixture-pkg/package.json": JSON.stringify({
          name: "fixture-pkg",
          version: "1.0.0",
          exports: {
            ".": {
              import: {
                types: "./types/index.d.mts",
                default: "./dist/index.mjs",
              },
            },
          },
        }),
        "/workspace/node_modules/fixture-pkg/types/index.d.mts":
          "export declare const fixture: true;",
      },
      calls,
    );

    const result = await runTypeScriptResolutionWorker({ request, broker });

    expect(result).toMatchObject({
      ok: true,
      value: {
        target: "types/index.d.mts",
        compilerVersion: "6.0.3",
        snapshotId: "sha256:fixture",
      },
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((path) => path.startsWith("/workspace"))).toBe(true);
  });

  it("parses the selected project config and merges its custom conditions", async () => {
    const configuredRequest: TypeScriptWorkerRequestV1 = {
      ...request,
      tsconfigPath: "packages/app/tsconfig.json",
    };
    const broker = virtualBroker({
      "/workspace/packages/app/tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "node16",
          moduleResolution: "node16",
          customConditions: ["development"],
        },
      }),
      "/workspace/packages/app/package.json": JSON.stringify({ type: "module" }),
      "/workspace/packages/app/src/index.ts": "export {};",
      "/workspace/node_modules/fixture-pkg/package.json": JSON.stringify({
        name: "fixture-pkg",
        version: "1.0.0",
        exports: {
          ".": {
            development: { types: "./types/dev.d.mts", default: "./dist/dev.mjs" },
            import: { types: "./types/index.d.mts", default: "./dist/index.mjs" },
          },
        },
      }),
      "/workspace/node_modules/fixture-pkg/types/dev.d.mts":
        "export declare const development: true;",
    });

    await expect(
      runTypeScriptResolutionWorker({ request: configuredRequest, broker }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        target: "types/dev.d.mts",
        tsconfigPath: "packages/app/tsconfig.json",
        moduleResolution: "node16",
        conditions: ["default", "development", "import", "node", "types"],
      },
    });
  });

  it("normalizes an unsupported project config to a fixed failure", async () => {
    const configuredRequest: TypeScriptWorkerRequestV1 = {
      ...request,
      tsconfigPath: "tsconfig.json",
    };
    const broker = virtualBroker({
      "/workspace/tsconfig.json": JSON.stringify({
        compilerOptions: { module: "preserve", moduleResolution: "bundler" },
      }),
    });

    await expect(
      runTypeScriptResolutionWorker({ request: configuredRequest, broker }),
    ).resolves.toEqual({
      ok: false,
      failure: {
        code: "unsupported_context",
        message: "TypeScript project module resolution is outside first-slice support.",
      },
    });
  });

  it("returns cancellation without starting compiler work", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runTypeScriptResolutionWorker({
      request,
      broker: virtualBroker({}),
      signal: controller.signal,
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "cancelled",
        message: "Isolated TypeScript analysis was cancelled.",
      },
    });
  });

  it("terminates a child that exceeds wall time", async () => {
    const result = await runTypeScriptResolutionWorker({
      request,
      broker: virtualBroker({}),
      workerPath: new URL("fixtures/hanging-worker.mjs", import.meta.url),
      limits: { maxWallTimeMs: 50, maxCancellationGraceMs: 20 },
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "resource_limit_exceeded",
        message: "Isolated TypeScript analysis exceeded its wall-time budget.",
        limit: "maxWallTimeMs",
      },
    });
  });

  it("terminates a running child after cancellation", async () => {
    const controller = new AbortController();
    const pending = runTypeScriptResolutionWorker({
      request,
      broker: virtualBroker({}),
      workerPath: new URL("fixtures/hanging-worker.mjs", import.meta.url),
      signal: controller.signal,
      limits: { maxWallTimeMs: 1_000, maxCancellationGraceMs: 20 },
    });
    setTimeout(() => controller.abort(), 25);

    await expect(pending).resolves.toEqual({
      ok: false,
      failure: {
        code: "cancelled",
        message: "Isolated TypeScript analysis was cancelled.",
      },
    });
  });

  it("terminates a child that exceeds the output budget", async () => {
    const result = await runTypeScriptResolutionWorker({
      request,
      broker: virtualBroker({}),
      workerPath: new URL("fixtures/oversized-worker.mjs", import.meta.url),
      limits: { maxOutputBytes: 64, maxCancellationGraceMs: 20 },
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "resource_limit_exceeded",
        message: "Isolated TypeScript analysis exceeded its output budget.",
        limit: "maxOutputBytes",
      },
    });
  });

  it("survives child memory exhaustion", async () => {
    const result = await runTypeScriptResolutionWorker({
      request,
      broker: virtualBroker({}),
      workerPath: new URL("fixtures/memory-worker.mjs", import.meta.url),
      limits: {
        maxCompilerMemoryBytes: 33_554_432,
        maxWallTimeMs: 5_000,
        maxCancellationGraceMs: 20,
      },
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "analysis_failed",
        message: "Isolated TypeScript analysis could not complete safely.",
      },
    });
  });

  it.each([
    { label: "crash", fixture: "crashing-worker.mjs" },
    { label: "malformed output", fixture: "malformed-worker.mjs" },
    { label: "snapshot mismatch", fixture: "mismatch-worker.mjs" },
    { label: "condition mismatch", fixture: "conditions-worker.mjs" },
  ])("normalizes child $label", async ({ fixture }) => {
    const result = await runTypeScriptResolutionWorker({
      request,
      broker: virtualBroker({}),
      workerPath: new URL(`fixtures/${fixture}`, import.meta.url),
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "analysis_failed",
        message: "Isolated TypeScript analysis could not complete safely.",
      },
    });
  });
});

function virtualBroker(
  files: Readonly<Record<string, string>>,
  calls: string[] = [],
): TypeScriptWorkerFileBroker {
  const normalizedFiles = new Map(
    Object.entries(files).map(([path, contents]) => [posix.normalize(path), contents]),
  );
  const directories = new Set<string>(["/workspace"]);
  for (const path of normalizedFiles.keys()) {
    let directory = posix.dirname(path);
    while (directory.startsWith("/workspace") && !directories.has(directory)) {
      directories.add(directory);
      directory = posix.dirname(directory);
    }
  }

  return {
    fileExists(path) {
      calls.push(path);
      return normalizedFiles.has(path);
    },
    readFile(path) {
      calls.push(path);
      return normalizedFiles.get(path);
    },
    directoryExists(path) {
      calls.push(path);
      return directories.has(path);
    },
    getDirectories(path) {
      calls.push(path);
      return [...directories]
        .filter((candidate) => candidate !== path && posix.dirname(candidate) === path)
        .map((candidate) => posix.basename(candidate))
        .sort();
    },
    realpath(path) {
      calls.push(path);
      return path;
    },
  };
}
