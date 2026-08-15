import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  prepareTypeScriptResolutionWorker,
  runTypeScriptResolutionWorker,
  type TypeScriptResolutionSnapshot,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("prepareTypeScriptResolutionWorker", () => {
  it("maps logical and physical package roots to the same immutable snapshot", async () => {
    const workspaceRoot = await createWorkspace();
    const snapshot = fixtureSnapshot();
    const prepared = prepareTypeScriptResolutionWorker({
      operationId: "context-fixture",
      workspaceRoot,
      importer: "packages/app/src/index.ts",
      packageEntryPath: "node_modules/fixture-pkg",
      packageRelativeRoot: "node_modules/.pnpm/fixture-pkg@1.0.0/node_modules/fixture-pkg",
      tsconfigPath: "packages/app/tsconfig.json",
      specifier: "fixture-pkg",
      typescriptConditions: ["import"],
      snapshot,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    expect(prepared.value.request).toMatchObject({
      snapshotId: "sha256:fixture",
      importer: "/workspace/packages/app/src/index.ts",
      packageRoot: "/workspace/node_modules/.pnpm/fixture-pkg@1.0.0/node_modules/fixture-pkg",
      tsconfigPath: "packages/app/tsconfig.json",
      conditions: {
        lookupKind: "import",
        conditions: ["default", "import", "node", "types"],
      },
    });
    await expect(
      prepared.value.broker.readFile("/workspace/node_modules/fixture-pkg/package.json"),
    ).resolves.toContain('"name":"fixture-pkg"');
    await expect(
      prepared.value.broker.readFile(
        "/workspace/node_modules/.pnpm/fixture-pkg@1.0.0/node_modules/fixture-pkg/package.json",
      ),
    ).resolves.toContain('"name":"fixture-pkg"');
    await expect(
      prepared.value.broker.realpath("/workspace/node_modules/fixture-pkg"),
    ).resolves.toBe("/workspace/node_modules/.pnpm/fixture-pkg@1.0.0/node_modules/fixture-pkg");
  });

  it("memoizes workspace bytes and missing observations", async () => {
    const workspaceRoot = await createWorkspace();
    const prepared = prepareTypeScriptResolutionWorker({
      operationId: "memo-fixture",
      workspaceRoot,
      importer: "packages/app/src/index.ts",
      packageEntryPath: "node_modules/fixture-pkg",
      packageRelativeRoot: "node_modules/fixture-pkg",
      tsconfigPath: "packages/app/tsconfig.json",
      specifier: "fixture-pkg",
      typescriptConditions: ["import"],
      snapshot: fixtureSnapshot(),
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const configPath = "/workspace/packages/app/tsconfig.json";
    const first = await prepared.value.broker.readFile(configPath);
    await writeFile(join(workspaceRoot, "packages/app/tsconfig.json"), '{"changed":true}\n');
    await expect(prepared.value.broker.readFile(configPath)).resolves.toBe(first);

    const missingPath = "/workspace/packages/app/src/missing.ts";
    await expect(prepared.value.broker.fileExists(missingPath)).resolves.toBe(false);
    await expect(prepared.value.broker.directoryExists(configPath)).resolves.toBe(false);
    await writeFile(join(workspaceRoot, "packages/app/src/missing.ts"), "export {};\n");
    await expect(prepared.value.broker.fileExists(missingPath)).resolves.toBe(false);
  });

  it("resolves through the isolated worker using snapshot package bytes", async () => {
    const workspaceRoot = await createWorkspace();
    const prepared = prepareTypeScriptResolutionWorker({
      operationId: "resolve-fixture",
      workspaceRoot,
      importer: "packages/app/src/index.ts",
      packageEntryPath: "node_modules/fixture-pkg",
      packageRelativeRoot: "node_modules/.pnpm/fixture-pkg@1.0.0/node_modules/fixture-pkg",
      tsconfigPath: "packages/app/tsconfig.json",
      specifier: "fixture-pkg",
      typescriptConditions: ["import"],
      snapshot: fixtureSnapshot(),
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    await expect(runTypeScriptResolutionWorker(prepared.value)).resolves.toMatchObject({
      ok: true,
      value: {
        target: "types/index.d.mts",
        snapshotId: "sha256:fixture",
        tsconfigPath: "packages/app/tsconfig.json",
        projectContextHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
    });
  });

  it("fails closed when a live directory exceeds the broker entry budget", async () => {
    const workspaceRoot = await createWorkspace();
    await Promise.all([mkdir(join(workspaceRoot, "one")), mkdir(join(workspaceRoot, "two"))]);
    const prepared = prepareTypeScriptResolutionWorker({
      operationId: "directory-budget-fixture",
      workspaceRoot,
      importer: "packages/app/src/index.ts",
      packageEntryPath: "node_modules/fixture-pkg",
      packageRelativeRoot: "node_modules/fixture-pkg",
      tsconfigPath: "packages/app/tsconfig.json",
      specifier: "fixture-pkg",
      typescriptConditions: ["import"],
      snapshot: fixtureSnapshot(),
      brokerLimits: { maxWorkspaceEntriesObserved: 1 },
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    await expect(prepared.value.broker.getDirectories("/workspace")).rejects.toThrow(
      "Workspace directory result is too large.",
    );
  });

  it("rejects mismatched or ambiguous bounded context", () => {
    expect(
      prepareTypeScriptResolutionWorker({
        operationId: "invalid-fixture",
        workspaceRoot: "/workspace",
        importer: "../outside.ts",
        packageEntryPath: "node_modules/fixture-pkg",
        packageRelativeRoot: "node_modules/fixture-pkg",
        tsconfigPath: null,
        specifier: "fixture-pkg",
        typescriptConditions: ["import", "require"],
        snapshot: fixtureSnapshot(),
      }),
    ).toEqual({
      ok: false,
      failure: {
        code: "invalid_request",
        message: "TypeScript worker context is not valid bounded snapshot input.",
      },
    });
    expect(
      prepareTypeScriptResolutionWorker({
        operationId: "mismatch-fixture",
        workspaceRoot: "/workspace",
        importer: "src/index.ts",
        packageEntryPath: "node_modules/fixture-pkg",
        packageRelativeRoot: "node_modules/fixture-pkg",
        tsconfigPath: null,
        specifier: "other-pkg",
        typescriptConditions: ["import"],
        snapshot: fixtureSnapshot(),
      }),
    ).toMatchObject({ ok: false, failure: { code: "invalid_request" } });
  });
});

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "typescript-worker-context-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "packages/app/src"), { recursive: true });
  await writeFile(join(root, "packages/app/src/index.ts"), "export {};\n");
  await writeFile(
    join(root, "packages/app/tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "nodenext", moduleResolution: "nodenext" },
    }),
  );
  await writeFile(join(root, "packages/app/package.json"), '{"type":"module"}\n');
  return root;
}

function fixtureSnapshot(): TypeScriptResolutionSnapshot {
  const contents = new Map<string, Uint8Array>([
    [
      "package.json",
      Buffer.from(
        JSON.stringify({
          name: "fixture-pkg",
          version: "1.0.0",
          exports: {
            ".": {
              import: { types: "./types/index.d.mts", default: "./dist/index.mjs" },
            },
          },
        }),
      ),
    ],
    ["types/index.d.mts", Buffer.from("export declare const fixture: true;\n")],
  ]);
  return {
    identity: { snapshotId: "sha256:fixture", name: "fixture-pkg", version: "1.0.0" },
    files: [
      { path: "package.json", byteLength: contents.get("package.json")?.byteLength ?? 0 },
      {
        path: "types/index.d.mts",
        byteLength: contents.get("types/index.d.mts")?.byteLength ?? 0,
      },
    ],
    directories: ["types"],
    readFile: (path) => contents.get(path),
  };
}
