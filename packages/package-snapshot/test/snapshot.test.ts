import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  materializeCheckedInFixture,
  materializeFixtureCase,
} from "@package-spelunker/test-fixtures";
import { afterEach, describe, expect, it } from "vitest";

import { constructPackageSnapshot } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("constructPackageSnapshot", () => {
  it("derives stable identity from exact bytes and normalized context, not absolute roots", async () => {
    const first = await materializeWorkspace("npm-basic");
    const second = await materializeWorkspace("npm-basic");

    const firstResult = await snapshotNpmFixture(first.root);
    const secondResult = await snapshotNpmFixture(second.root);

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    if (!firstResult.ok || !secondResult.ok) return;
    expect(firstResult.value.identity).toEqual(secondResult.value.identity);
    expect(firstResult.value.identity.snapshotId).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(firstResult.value.identity.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(firstResult.value.context).toEqual({
      workspaceRoot: ".",
      importer: "packages/app/src/index.ts",
      specifier: "fixture-pkg",
      conditions: ["import", "node", "types"],
    });
    expect(firstResult.value.files.map((file) => file.path)).toEqual([
      "dist/feature.cjs",
      "dist/feature.d.ts",
      "dist/feature.js",
      "dist/index.cjs",
      "dist/index.d.ts",
      "dist/index.js",
      "dist/types-only.d.ts",
      "package.json",
    ]);
    expect(firstResult.value.evidence).toEqual([
      {
        kind: "policy",
        description: "Artifact files admitted by first-slice-v1 containment and read budgets.",
      },
      {
        kind: "file",
        path: "package.json",
        description: "Normalized package identity and resolution metadata.",
      },
    ]);
  });

  it("changes content identity when any captured package byte changes", async () => {
    const first = await materializeWorkspace("npm-basic");
    const second = await materializeWorkspace("npm-basic");
    await writeFile(
      join(second.root, "node_modules", "fixture-pkg", "dist", "index.d.ts"),
      "export interface FixtureValue { readonly changed: true }\n",
    );

    const firstResult = await snapshotNpmFixture(first.root);
    const secondResult = await snapshotNpmFixture(second.root);

    expect(firstResult.ok && secondResult.ok).toBe(true);
    if (!firstResult.ok || !secondResult.ok) return;
    expect(firstResult.value.identity.contentHash).not.toBe(
      secondResult.value.identity.contentHash,
    );
    expect(firstResult.value.identity.snapshotId).not.toBe(secondResult.value.identity.snapshotId);
  });

  it("includes empty directory topology in artifact content identity", async () => {
    const first = await materializeWorkspace("npm-basic");
    const second = await materializeWorkspace("npm-basic");
    await mkdir(join(second.root, "node_modules", "fixture-pkg", "empty"));

    const firstResult = await snapshotNpmFixture(first.root);
    const secondResult = await snapshotNpmFixture(second.root);

    expect(firstResult.ok && secondResult.ok).toBe(true);
    if (!firstResult.ok || !secondResult.ok) return;
    expect(firstResult.value.identity.contentHash).not.toBe(
      secondResult.value.identity.contentHash,
    );
    expect(firstResult.value.directories).toEqual(["dist"]);
    expect(secondResult.value.directories).toEqual(["dist", "empty"]);
  });

  it("changes snapshot identity but not content identity when normalized context changes", async () => {
    const fixture = await materializeWorkspace("npm-basic");
    const packageRoot = join(fixture.root, "node_modules", "fixture-pkg");
    const importer = join(fixture.root, "packages", "app", "src", "index.ts");

    const importResult = await constructPackageSnapshot({
      packageRoot,
      approvedRoots: [fixture.root],
      source: "installed",
      context: { importer, specifier: "fixture-pkg", conditions: ["node", "import"] },
    });
    const requireResult = await constructPackageSnapshot({
      packageRoot,
      approvedRoots: [fixture.root],
      source: "installed",
      context: { importer, specifier: "fixture-pkg", conditions: ["node", "require"] },
    });

    expect(importResult.ok && requireResult.ok).toBe(true);
    if (!importResult.ok || !requireResult.ok) return;
    expect(importResult.value.identity.contentHash).toBe(requireResult.value.identity.contentHash);
    expect(importResult.value.identity.snapshotId).not.toBe(
      requireResult.value.identity.snapshotId,
    );
  });

  it("captures an admitted workspace package symlink without executing package code", async () => {
    const fixture = await materializeWorkspace("workspace-linked");
    const packageRoot = join(fixture.root, "node_modules", "@fixture", "linked-pkg");

    const result = await constructPackageSnapshot({
      packageRoot,
      approvedRoots: [fixture.root],
      source: "workspace",
      context: {
        importer: join(fixture.root, "packages", "app", "src", "index.ts"),
        specifier: "@fixture/linked-pkg",
        conditions: ["node", "import"],
      },
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        identity: { name: "@fixture/linked-pkg", version: "1.0.0", source: "workspace" },
      },
    });
    await expect(access(fixture.executionSentinel)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns independent byte copies from the immutable in-memory snapshot", async () => {
    const fixture = await materializeWorkspace("npm-basic");
    const result = await snapshotNpmFixture(fixture.root);
    if (!result.ok) throw new Error(result.failure.message);

    const firstRead = result.value.readFile("dist/index.d.ts");
    const expected = await readFile(
      join(fixture.root, "node_modules", "fixture-pkg", "dist", "index.d.ts"),
    );
    if (firstRead === undefined) throw new Error("Snapshot file is missing");
    firstRead[0] = 0;

    expect(result.value.readFile("dist/index.d.ts")).toEqual(Uint8Array.from(expected));
    expect(Object.isFrozen(result.value.files)).toBe(true);
    expect(Object.isFrozen(result.value.identity)).toBe(true);
  });

  it("FS-001 rejects an escaping selected package root", async () => {
    const fixture = await materializeFixtureCase(
      "FS-001",
      "adversarial",
      await createTemporaryDirectory("package-snapshot-test-"),
    );

    const result = await constructPackageSnapshot({
      packageRoot: requiredPath(fixture.paths, "selected"),
      approvedRoots: [fixture.approvedRoot],
      source: "workspace",
      context: {
        importer: requiredPath(fixture.paths, "packageRoot"),
        specifier: "fixture-pkg",
        conditions: ["node"],
      },
    });

    expect(result).toMatchObject({ ok: false, failure: { code: "outside_approved_root" } });
  });

  it("reports aggregate byte and traversal budgets by exact limit name", async () => {
    const fixture = await materializeWorkspace("npm-basic");
    const packageRoot = join(fixture.root, "node_modules", "fixture-pkg");
    const context = {
      importer: join(fixture.root, "packages", "app", "src", "index.ts"),
      specifier: "fixture-pkg",
      conditions: ["node"],
    } as const;

    const byteLimited = await constructPackageSnapshot({
      packageRoot,
      approvedRoots: [fixture.root],
      source: "installed",
      context,
      limits: { maxArtifactBytesRead: 1 },
    });
    const traversalLimited = await constructPackageSnapshot({
      packageRoot,
      approvedRoots: [fixture.root],
      source: "installed",
      context,
      limits: { maxFilesVisited: 1 },
    });

    expect(byteLimited).toMatchObject({
      ok: false,
      failure: { code: "resource_limit_exceeded", limit: "maxArtifactBytesRead" },
    });
    expect(traversalLimited).toMatchObject({
      ok: false,
      failure: { code: "resource_limit_exceeded", limit: "maxFilesVisited" },
    });
  });

  it("stops before filesystem traversal when cancellation is already requested", async () => {
    const fixture = await materializeWorkspace("npm-basic");
    const controller = new AbortController();
    controller.abort();

    const result = await constructPackageSnapshot({
      packageRoot: join(fixture.root, "node_modules", "fixture-pkg"),
      approvedRoots: [fixture.root],
      source: "installed",
      context: {
        importer: join(fixture.root, "packages", "app", "src", "index.ts"),
        specifier: "fixture-pkg",
        conditions: ["node"],
      },
      signal: controller.signal,
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "cancelled",
        message: "Filesystem policy evaluation was cancelled.",
      },
    });
  });
});

async function snapshotNpmFixture(root: string) {
  return constructPackageSnapshot({
    packageRoot: join(root, "node_modules", "fixture-pkg"),
    approvedRoots: [root],
    source: "installed",
    context: {
      importer: join(root, "packages", "app", "src", "index.ts"),
      specifier: "fixture-pkg",
      conditions: ["types", "node", "import", "node"],
    },
  });
}

async function materializeWorkspace(name: Parameters<typeof materializeCheckedInFixture>[0]) {
  return materializeCheckedInFixture(
    name,
    await createTemporaryDirectory("package-snapshot-workspace-"),
  );
}

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
