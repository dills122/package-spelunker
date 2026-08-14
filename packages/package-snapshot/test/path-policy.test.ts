import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeFixtureCase } from "@package-spelunker/test-fixtures";
import { afterEach, describe, expect, it } from "vitest";

import { resolveContainedPath } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("resolveContainedPath", () => {
  it("CTX-001 admits a nested importer under the approved root", async () => {
    const fixture = await materialize("CTX-001", "positive");

    const result = await resolveContainedPath({
      path: requiredPath(fixture.paths, "importer"),
      approvedRoots: [fixture.approvedRoot],
    });

    expect(result).toMatchObject({
      ok: true,
      value: { relativePath: "packages/app/src/index.ts", symlinkHops: 0 },
    });
  });

  it("CTX-001 rejects lexical traversal before reading outside the approved root", async () => {
    const fixture = await materialize("CTX-001", "adversarial");

    const result = await resolveContainedPath({
      path: requiredPath(fixture.paths, "importer"),
      approvedRoots: [fixture.approvedRoot],
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "outside_approved_root",
        message: "Selected path is outside the approved filesystem roots.",
      },
    });
  });

  it("FS-001 admits a workspace package link whose target stays approved", async () => {
    const fixture = await materialize("FS-001", "positive");

    const result = await resolveContainedPath({
      path: requiredPath(fixture.paths, "selected"),
      approvedRoots: [fixture.approvedRoot],
    });

    expect(result).toMatchObject({
      ok: true,
      value: { relativePath: "packages/fixture-pkg", symlinkHops: 1 },
    });
  });

  it("FS-001 rejects a workspace package link whose target escapes", async () => {
    const fixture = await materialize("FS-001", "adversarial");

    const result = await resolveContainedPath({
      path: requiredPath(fixture.paths, "selected"),
      approvedRoots: [fixture.approvedRoot],
    });

    expect(result).toMatchObject({ ok: false, failure: { code: "outside_approved_root" } });
  });

  it("FS-002 enforces the selected artifact root for file links", async () => {
    const positive = await materialize("FS-002", "positive");
    const adversarial = await materialize("FS-002", "adversarial");

    const admitted = await resolveContainedPath({
      path: requiredPath(positive.paths, "selected"),
      approvedRoots: [positive.approvedRoot],
      artifactRoot: requiredPath(positive.paths, "packageRoot"),
    });
    const rejected = await resolveContainedPath({
      path: requiredPath(adversarial.paths, "selected"),
      approvedRoots: [adversarial.approvedRoot],
      artifactRoot: requiredPath(adversarial.paths, "packageRoot"),
    });

    expect(admitted).toMatchObject({
      ok: true,
      value: { artifactRelativePath: "internal.d.ts", symlinkHops: 1 },
    });
    expect(rejected).toMatchObject({ ok: false, failure: { code: "outside_approved_root" } });
  });

  it("FS-003 admits a short symlink chain and rejects a cycle", async () => {
    const positive = await materialize("FS-003", "positive");
    const adversarial = await materialize("FS-003", "adversarial");

    const admitted = await resolveContainedPath({
      path: requiredPath(positive.paths, "selected"),
      approvedRoots: [positive.approvedRoot],
      artifactRoot: requiredPath(positive.paths, "packageRoot"),
    });
    const rejected = await resolveContainedPath({
      path: requiredPath(adversarial.paths, "selected"),
      approvedRoots: [adversarial.approvedRoot],
      artifactRoot: requiredPath(adversarial.paths, "packageRoot"),
    });

    expect(admitted).toMatchObject({ ok: true, value: { symlinkHops: 2 } });
    expect(rejected).toEqual({
      ok: false,
      failure: {
        code: "malformed_artifact",
        message: "Selected path could not be canonicalized safely.",
      },
    });
  });

  it("FS-003 reports maxSymlinkHops by name at the configured boundary", async () => {
    const fixture = await materialize("FS-003", "positive");

    const result = await resolveContainedPath({
      path: requiredPath(fixture.paths, "selected"),
      approvedRoots: [fixture.approvedRoot],
      artifactRoot: requiredPath(fixture.paths, "packageRoot"),
      limits: { maxSymlinkHops: 1 },
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "resource_limit_exceeded",
        message: "Selected path exceeds the configured filesystem policy.",
        limit: "maxSymlinkHops",
      },
    });
  });

  it("FS-004 applies UTF-8 byte and normalized-segment limits inclusively", async () => {
    const root = await createTemporaryDirectory();
    const unicodeFile = join(root, "é");
    const nestedFile = join(root, "a", "b", "c");
    await writeFile(unicodeFile, "safe\n");
    await mkdir(join(root, "a", "b"), { recursive: true });
    await writeFile(nestedFile, "safe\n");

    const byteBoundary = await resolveContainedPath({
      path: unicodeFile,
      approvedRoots: [root],
      limits: { maxRelativePathBytes: 2 },
    });
    const overByteLimit = await resolveContainedPath({
      path: unicodeFile,
      approvedRoots: [root],
      limits: { maxRelativePathBytes: 1 },
    });
    const segmentBoundary = await resolveContainedPath({
      path: nestedFile,
      approvedRoots: [root],
      limits: { maxPathSegments: 3 },
    });
    const overSegmentLimit = await resolveContainedPath({
      path: nestedFile,
      approvedRoots: [root],
      limits: { maxPathSegments: 2 },
    });

    expect(byteBoundary).toMatchObject({ ok: true });
    expect(overByteLimit).toMatchObject({
      ok: false,
      failure: { code: "resource_limit_exceeded", limit: "maxRelativePathBytes" },
    });
    expect(segmentBoundary).toMatchObject({ ok: true });
    expect(overSegmentLimit).toMatchObject({
      ok: false,
      failure: { code: "resource_limit_exceeded", limit: "maxPathSegments" },
    });
  });

  it("requires every approved root to remain a directory", async () => {
    const directory = await createTemporaryDirectory();
    const fileRoot = join(directory, "not-a-directory");
    await writeFile(fileRoot, "content\n");

    const result = await resolveContainedPath({
      path: fileRoot,
      approvedRoots: [fileRoot],
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "malformed_artifact",
        message: "Selected path could not be canonicalized safely.",
      },
    });
  });
});

async function materialize(
  id: Parameters<typeof materializeFixtureCase>[0],
  variant: Parameters<typeof materializeFixtureCase>[1],
) {
  const directory = await createTemporaryDirectory();
  return materializeFixtureCase(id, variant, directory);
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "package-snapshot-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function requiredPath(paths: Readonly<Record<string, string>>, name: string): string {
  const path = paths[name];
  if (path === undefined) throw new Error(`Fixture does not define path ${name}.`);
  return path;
}
