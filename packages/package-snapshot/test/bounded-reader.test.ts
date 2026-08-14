import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeFixtureCase } from "@package-spelunker/test-fixtures";
import { afterEach, describe, expect, it } from "vitest";

import { readContainedFile } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("readContainedFile", () => {
  it("CFG-001 reads a manifest exactly at maxManifestBytes", async () => {
    const fixture = await materialize("CFG-001", "positive");

    const result = await readContainedFile({
      path: requiredPath(fixture.paths, "manifest"),
      approvedRoots: [fixture.approvedRoot],
      artifactRoot: requiredPath(fixture.paths, "packageRoot"),
      maxBytes: 1_048_576,
      limit: "maxManifestBytes",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        byteLength: 1_048_576,
        path: { artifactRelativePath: "package.json" },
      },
    });
  });

  it("CFG-001 rejects one byte over maxManifestBytes without returning content", async () => {
    const fixture = await materialize("CFG-001", "adversarial");

    const result = await readContainedFile({
      path: requiredPath(fixture.paths, "manifest"),
      approvedRoots: [fixture.approvedRoot],
      artifactRoot: requiredPath(fixture.paths, "packageRoot"),
      maxBytes: 1_048_576,
      limit: "maxManifestBytes",
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "resource_limit_exceeded",
        message: "Selected artifact file exceeds the configured byte limit.",
        limit: "maxManifestBytes",
      },
    });
  });

  it("FS-002 reads a contained file link and rejects an escaping link", async () => {
    const positive = await materialize("FS-002", "positive");
    const adversarial = await materialize("FS-002", "adversarial");

    const admitted = await readContainedFile({
      path: requiredPath(positive.paths, "selected"),
      approvedRoots: [positive.approvedRoot],
      artifactRoot: requiredPath(positive.paths, "packageRoot"),
      maxBytes: 1_024,
      limit: "maxArtifactFileBytes",
    });
    const rejected = await readContainedFile({
      path: requiredPath(adversarial.paths, "selected"),
      approvedRoots: [adversarial.approvedRoot],
      artifactRoot: requiredPath(adversarial.paths, "packageRoot"),
      maxBytes: 1_024,
      limit: "maxArtifactFileBytes",
    });

    expect(admitted.ok && Buffer.from(admitted.value.bytes).toString("utf8")).toBe(
      "export type Safe = true;\n",
    );
    expect(rejected).toMatchObject({ ok: false, failure: { code: "outside_approved_root" } });
  });

  it("rejects a directory where artifact file content is required", async () => {
    const fixture = await materialize("FS-002", "positive");

    const result = await readContainedFile({
      path: requiredPath(fixture.paths, "packageRoot"),
      approvedRoots: [fixture.approvedRoot],
      artifactRoot: requiredPath(fixture.paths, "packageRoot"),
      maxBytes: 1_024,
      limit: "maxArtifactFileBytes",
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "malformed_artifact",
        message: "Selected artifact entry is not a readable regular file.",
      },
    });
  });
});

async function materialize(
  id: Parameters<typeof materializeFixtureCase>[0],
  variant: Parameters<typeof materializeFixtureCase>[1],
) {
  const directory = await mkdtemp(join(tmpdir(), "package-reader-test-"));
  temporaryDirectories.push(directory);
  return materializeFixtureCase(id, variant, directory);
}

function requiredPath(paths: Readonly<Record<string, string>>, name: string): string {
  const path = paths[name];
  if (path === undefined) throw new Error(`Fixture does not define path ${name}.`);
  return path;
}
