import { access, mkdir, mkdtemp, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constructPackageSnapshot } from "@package-spelunker/package-snapshot";
import {
  materializeCheckedInFixture,
  materializeFixtureCase,
} from "@package-spelunker/test-fixtures";
import { afterEach, describe, expect, it } from "vitest";

import { discoverWorkspacePackage } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("discoverWorkspacePackage", () => {
  it("discovers the npm importer, package-manager context, config evidence, and exact package", async () => {
    const fixture = await materializeCheckedInFixture(
      "npm-basic",
      await createTemporaryDirectory("workspace-model-test-"),
    );
    await writeFile(join(fixture.root, "packages/app/tsconfig.json"), '{"compilerOptions":{}}\n');
    const canonicalRoot = await realpath(fixture.root);

    const result = await discoverWorkspacePackage({
      workspaceRoot: fixture.root,
      importer: "packages/app/src/index.ts",
      specifier: "fixture-pkg/feature",
    });

    expect(result, result.ok ? undefined : JSON.stringify(result.failure)).toMatchObject({
      ok: true,
      value: {
        approvedRoots: [canonicalRoot],
        workspaceRoot: canonicalRoot,
        importer: {
          path: join(canonicalRoot, "packages/app/src/index.ts"),
          relativePath: "packages/app/src/index.ts",
          packageRoot: join(canonicalRoot, "packages/app"),
          packageName: "@fixture/npm-app",
        },
        packageManager: "npm",
        requested: {
          requested: "fixture-pkg/feature",
          packageName: "fixture-pkg",
          packageSubpath: "feature",
        },
        selectedPackage: {
          root: join(canonicalRoot, "node_modules/fixture-pkg"),
          relativeRoot: "node_modules/fixture-pkg",
          entryPath: "node_modules/fixture-pkg",
          name: "fixture-pkg",
          version: "1.0.0",
          source: "installed",
        },
        configuration: {
          workspaceManifest: "package.json",
          importerManifest: "packages/app/package.json",
          lockfile: "package-lock.json",
          tsconfig: "packages/app/tsconfig.json",
        },
      },
    });
    if (result.ok) {
      expect(result.value.evidence.map(({ role, path }) => [role, path])).toEqual([
        ["workspace-manifest", "package.json"],
        ["lockfile", "package-lock.json"],
        ["importer-manifest", "packages/app/package.json"],
        ["tsconfig", "packages/app/tsconfig.json"],
        ["selected-package-manifest", "node_modules/fixture-pkg/package.json"],
      ]);
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.evidence)).toBe(true);
    }
  });

  it("discovers the pnpm symlinked store candidate without confusing it for a workspace package", async () => {
    const fixture = await materializeCheckedInFixture(
      "pnpm-basic",
      await createTemporaryDirectory("workspace-model-test-"),
    );
    const canonicalPackageRoot = await realpath(join(fixture.root, "node_modules/fixture-pkg"));

    const result = await discoverWorkspacePackage({
      workspaceRoot: fixture.root,
      importer: join(fixture.root, "packages/app/src/index.ts"),
      specifier: "fixture-pkg",
    });

    expect(result, result.ok ? undefined : JSON.stringify(result.failure)).toMatchObject({
      ok: true,
      value: {
        packageManager: "pnpm",
        selectedPackage: {
          root: canonicalPackageRoot,
          relativeRoot: "node_modules/.pnpm/fixture-pkg@1.0.0/node_modules/fixture-pkg",
          entryPath: "node_modules/fixture-pkg",
          source: "installed",
        },
        configuration: {
          workspaceConfig: "pnpm-workspace.yaml",
          lockfile: "pnpm-lock.yaml",
        },
      },
    });
  });

  it("selects a linked workspace package and hands its canonical context to snapshot construction", async () => {
    const fixture = await materializeCheckedInFixture(
      "workspace-linked",
      await createTemporaryDirectory("workspace-model-test-"),
    );
    const canonicalPackageRoot = await realpath(
      join(fixture.root, "node_modules/@fixture/linked-pkg"),
    );

    const discovery = await discoverWorkspacePackage({
      workspaceRoot: fixture.root,
      importer: "packages/app/src/index.ts",
      specifier: "@fixture/linked-pkg",
    });

    expect(discovery, discovery.ok ? undefined : JSON.stringify(discovery.failure)).toMatchObject({
      ok: true,
      value: {
        packageManager: "pnpm",
        selectedPackage: {
          root: canonicalPackageRoot,
          relativeRoot: "packages/linked-pkg",
          entryPath: "node_modules/@fixture/linked-pkg",
          name: "@fixture/linked-pkg",
          version: "1.0.0",
          source: "workspace",
        },
        configuration: {
          workspaceConfig: "pnpm-workspace.yaml",
        },
      },
    });
    if (!discovery.ok) return;

    const snapshot = await constructPackageSnapshot({
      packageRoot: discovery.value.selectedPackage.root,
      approvedRoots: discovery.value.approvedRoots,
      source: discovery.value.selectedPackage.source,
      context: {
        importer: discovery.value.importer.path,
        specifier: discovery.value.requested.requested,
        conditions: ["import", "node"],
        ...(discovery.value.configuration.tsconfig === undefined
          ? {}
          : {
              tsconfigPath: join(
                discovery.value.workspaceRoot,
                discovery.value.configuration.tsconfig,
              ),
            }),
      },
    });

    expect(snapshot, snapshot.ok ? undefined : JSON.stringify(snapshot.failure)).toMatchObject({
      ok: true,
      value: {
        identity: {
          name: "@fixture/linked-pkg",
          version: "1.0.0",
          source: "workspace",
        },
        context: {
          workspaceRoot: ".",
          importer: "packages/app/src/index.ts",
          specifier: "@fixture/linked-pkg",
          conditions: ["import", "node"],
        },
      },
    });
    await expect(access(fixture.executionSentinel)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("selects the importer-nearest installed package instance", async () => {
    const fixture = await materializeCheckedInFixture(
      "npm-basic",
      await createTemporaryDirectory("workspace-model-test-"),
    );
    const nearestRoot = join(fixture.root, "packages/app/node_modules/fixture-pkg");
    await mkdir(nearestRoot, { recursive: true });
    await writeFile(
      join(nearestRoot, "package.json"),
      '{"name":"fixture-pkg","version":"2.0.0"}\n',
    );

    const result = await discoverWorkspacePackage({
      workspaceRoot: fixture.root,
      importer: "packages/app/src/index.ts",
      specifier: "fixture-pkg",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        selectedPackage: {
          relativeRoot: "packages/app/node_modules/fixture-pkg",
          entryPath: "packages/app/node_modules/fixture-pkg",
          version: "2.0.0",
          source: "installed",
        },
      },
    });
  });

  it("returns a typed package_not_found failure for a missing package", async () => {
    const fixture = await materializeCheckedInFixture(
      "npm-basic",
      await createTemporaryDirectory("workspace-model-test-"),
    );

    await expect(
      discoverWorkspacePackage({
        workspaceRoot: fixture.root,
        importer: "packages/app/src/index.ts",
        specifier: "not-installed",
      }),
    ).resolves.toEqual({
      ok: false,
      failure: {
        code: "package_not_found",
        message: "No installed package candidate was found for the requested importer.",
      },
    });
  });

  it("returns typed ambiguous and unsupported package-manager contexts", async () => {
    const ambiguous = await materializeCheckedInFixture(
      "npm-basic",
      await createTemporaryDirectory("workspace-model-test-"),
    );
    await writeFile(join(ambiguous.root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const unsupported = await materializeCheckedInFixture(
      "npm-basic",
      await createTemporaryDirectory("workspace-model-test-"),
    );
    await unlink(join(unsupported.root, "package-lock.json"));

    await expect(
      discoverWorkspacePackage({
        workspaceRoot: ambiguous.root,
        importer: "packages/app/src/index.ts",
        specifier: "fixture-pkg",
      }),
    ).resolves.toMatchObject({
      ok: false,
      failure: {
        code: "unsupported_context",
        message: "Workspace package-manager or package selection context is ambiguous.",
      },
    });
    await expect(
      discoverWorkspacePackage({
        workspaceRoot: unsupported.root,
        importer: "packages/app/src/index.ts",
        specifier: "fixture-pkg",
      }),
    ).resolves.toMatchObject({
      ok: false,
      failure: {
        code: "unsupported_context",
        message: "Workspace package-manager or configuration context is unsupported.",
      },
    });
  });

  it("applies the named lockfile byte budget before parsing workspace context", async () => {
    const fixture = await materializeCheckedInFixture(
      "npm-basic",
      await createTemporaryDirectory("workspace-model-test-"),
    );

    await expect(
      discoverWorkspacePackage({
        workspaceRoot: fixture.root,
        importer: "packages/app/src/index.ts",
        specifier: "fixture-pkg",
        limits: { maxLockfileBytes: 8 },
      }),
    ).resolves.toEqual({
      ok: false,
      failure: {
        code: "resource_limit_exceeded",
        message: "Selected artifact file exceeds the configured byte limit.",
        limit: "maxLockfileBytes",
      },
    });
  });

  it("CTX-001 rejects an importer outside the approved workspace before config reads", async () => {
    const fixture = await materializeFixtureCase(
      "CTX-001",
      "adversarial",
      await createTemporaryDirectory("workspace-model-test-"),
    );

    await expect(
      discoverWorkspacePackage({
        workspaceRoot: fixture.approvedRoot,
        importer: requiredPath(fixture.paths, "importer"),
        specifier: "fixture-pkg",
      }),
    ).resolves.toEqual({
      ok: false,
      failure: {
        code: "outside_approved_root",
        message: "Selected path is outside the approved filesystem roots.",
      },
    });
  });

  it("rejects an escaping installed-package symlink selected from a valid workspace", async () => {
    const container = await createTemporaryDirectory("workspace-model-test-");
    const fixture = await materializeCheckedInFixture("npm-basic", join(container, "workspace"));
    const outsidePackage = join(container, "outside/fixture-pkg");
    await mkdir(outsidePackage, { recursive: true });
    await writeFile(
      join(outsidePackage, "package.json"),
      '{"name":"fixture-pkg","version":"9.9.9"}\n',
    );
    await rm(join(fixture.root, "node_modules/fixture-pkg"), { recursive: true });
    await symlink(
      join("..", "..", "outside", "fixture-pkg"),
      join(fixture.root, "node_modules/fixture-pkg"),
      "dir",
    );

    await expect(
      discoverWorkspacePackage({
        workspaceRoot: fixture.root,
        importer: "packages/app/src/index.ts",
        specifier: "fixture-pkg",
      }),
    ).resolves.toEqual({
      ok: false,
      failure: {
        code: "outside_approved_root",
        message: "Selected path is outside the approved filesystem roots.",
      },
    });
  });

  it("validates the package specifier before touching a nonexistent workspace", async () => {
    await expect(
      discoverWorkspacePackage({
        workspaceRoot: join(tmpdir(), "package-spelunker-does-not-exist"),
        importer: "packages/app/src/index.ts",
        specifier: "fixture-pkg/../escape",
      }),
    ).resolves.toEqual({
      ok: false,
      failure: {
        code: "invalid_request",
        message:
          "Package specifier must be a bare or scoped package name with an optional safe subpath.",
      },
    });
  });

  it("propagates cancellation before filesystem discovery", async () => {
    const fixture = await materializeCheckedInFixture(
      "npm-basic",
      await createTemporaryDirectory("workspace-model-test-"),
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      discoverWorkspacePackage({
        workspaceRoot: fixture.root,
        importer: "packages/app/src/index.ts",
        specifier: "fixture-pkg",
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({ ok: false, failure: { code: "cancelled" } });
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
