import { access, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  type MaterializedFixture,
  materializeCheckedInFixture,
  materializeFixtureCase,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "package-spelunker-fixture-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("materializeCheckedInFixture", () => {
  it("rejects a non-empty destination before copying fixture data", async () => {
    const destination = await createTemporaryDirectory();
    const marker = join(destination, "keep.txt");
    await writeFile(marker, "keep\n");

    await expect(materializeCheckedInFixture("npm-basic", destination)).rejects.toThrowError(
      `Fixture destination must be empty: ${destination}`,
    );
    expect(await readFile(marker, "utf8")).toBe("keep\n");
  });

  it("recreates the pnpm virtual-store package link", async () => {
    const destination = await createTemporaryDirectory();
    const fixture = await materializeCheckedInFixture("pnpm-basic", destination);

    expect(await realpath(join(fixture.root, "node_modules", "fixture-pkg"))).toBe(
      await realpath(
        join(
          fixture.root,
          "node_modules",
          ".pnpm",
          "fixture-pkg@1.0.0",
          "node_modules",
          "fixture-pkg",
        ),
      ),
    );
  });

  it("recreates the admitted workspace package link", async () => {
    const destination = await createTemporaryDirectory();
    const fixture = await materializeCheckedInFixture("workspace-linked", destination);

    expect(await realpath(join(fixture.root, "node_modules", "@fixture", "linked-pkg"))).toBe(
      await realpath(join(fixture.root, "packages", "linked-pkg")),
    );
  });
});

describe("materializeFixtureCase", () => {
  it("rejects a non-empty destination before generating fixture data", async () => {
    const destination = await createTemporaryDirectory();
    const marker = join(destination, "keep.txt");
    await writeFile(marker, "keep\n");

    await expect(
      materializeFixtureCase("FS-001", "positive", destination),
    ).rejects.toThrowError(`Fixture destination must be empty: ${destination}`);
    expect(await readFile(marker, "utf8")).toBe("keep\n");
  });

  it("pairs contained and escaping importer paths for CTX-001", async () => {
    const positive = await materialize("CTX-001", "positive");
    const adversarial = await materialize("CTX-001", "adversarial");

    expect(await realpath(requiredPath(positive, "importer"))).toContain(
      await realpath(positive.approvedRoot),
    );
    expect(await realpath(requiredPath(adversarial, "importer"))).not.toContain(
      await realpath(adversarial.approvedRoot),
    );
    expect(requiredPath(adversarial, "importer")).toContain("..");
  });

  it("pairs contained and escaping workspace package links for FS-001", async () => {
    const positive = await materialize("FS-001", "positive");
    const adversarial = await materialize("FS-001", "adversarial");

    expect(await realpath(requiredPath(positive, "selected"))).toContain(
      await realpath(positive.approvedRoot),
    );
    expect(await realpath(requiredPath(adversarial, "selected"))).not.toContain(
      await realpath(adversarial.approvedRoot),
    );
  });

  it("pairs contained and escaping declaration links for FS-002", async () => {
    const positive = await materialize("FS-002", "positive");
    const adversarial = await materialize("FS-002", "adversarial");

    expect(await realpath(requiredPath(positive, "selected"))).toContain(
      await realpath(requiredPath(positive, "packageRoot")),
    );
    expect(await realpath(requiredPath(adversarial, "selected"))).not.toContain(
      await realpath(requiredPath(adversarial, "packageRoot")),
    );
  });

  it("pairs an acyclic chain with a symlink cycle for FS-003", async () => {
    const positive = await materialize("FS-003", "positive");
    const adversarial = await materialize("FS-003", "adversarial");

    expect(await readFile(requiredPath(positive, "selected"), "utf8")).toBe(
      "export type Safe = true;\n",
    );
    await expect(realpath(requiredPath(adversarial, "selected"))).rejects.toMatchObject({
      code: "ELOOP",
    });
  });

  it("creates exact manifest byte boundaries and malformed input for CFG-001", async () => {
    const positive = await materialize("CFG-001", "positive");
    const adversarial = await materialize("CFG-001", "adversarial");
    const malformed = await materialize("CFG-001", "malformed");
    const malformedContent = await readFile(requiredPath(malformed, "manifest"), "utf8");

    expect((await stat(requiredPath(positive, "manifest"))).size).toBe(1_048_576);
    expect((await stat(requiredPath(adversarial, "manifest"))).size).toBe(1_048_577);
    expect(() => JSON.parse(malformedContent)).toThrow();
  });

  it("never creates the execution sentinel", async () => {
    const fixture = await materialize("FS-001", "positive");

    await expect(access(fixture.executionSentinel)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function materialize(
  id: Parameters<typeof materializeFixtureCase>[0],
  variant: Parameters<typeof materializeFixtureCase>[1],
): Promise<MaterializedFixture> {
  return materializeFixtureCase(id, variant, await createTemporaryDirectory());
}

function requiredPath(fixture: MaterializedFixture, name: string): string {
  const path = fixture.paths[name];
  if (path === undefined) throw new Error(`Fixture ${fixture.id} does not define path ${name}.`);
  return path;
}
