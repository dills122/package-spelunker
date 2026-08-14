import { cp, mkdir, symlink, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";

import { type FixtureCaseId, getFixtureCase } from "./catalog.js";
import { type CheckedInFixtureName, resolveCheckedInFixture } from "./checked-in-fixtures.js";

export type FixtureVariantName = "positive" | "adversarial" | "malformed";

export interface MaterializedCheckedInFixture {
  readonly name: CheckedInFixtureName;
  readonly root: string;
  readonly executionSentinel: string;
}

export interface MaterializedFixture {
  readonly id: FixtureCaseId;
  readonly variant: FixtureVariantName;
  readonly root: string;
  readonly approvedRoot: string;
  readonly paths: Readonly<Record<string, string>>;
  readonly expectedOutcome: string;
  readonly executionSentinel: string;
}

export async function materializeCheckedInFixture(
  name: CheckedInFixtureName,
  destination: string,
): Promise<MaterializedCheckedInFixture> {
  await cp(resolveCheckedInFixture(name), destination, { recursive: true, force: false });

  if (name === "pnpm-basic") {
    await symlink(
      join(".pnpm", "fixture-pkg@1.0.0", "node_modules", "fixture-pkg"),
      join(destination, "node_modules", "fixture-pkg"),
      "dir",
    );
  }

  if (name === "workspace-linked") {
    const scopeRoot = join(destination, "node_modules", "@fixture");
    await mkdir(scopeRoot, { recursive: true });
    await symlink(join("..", "..", "packages", "linked-pkg"), join(scopeRoot, "linked-pkg"), "dir");
  }

  return {
    name,
    root: destination,
    executionSentinel: join(destination, ".fixture-runtime-executed"),
  };
}

export async function materializeFixtureCase(
  id: FixtureCaseId,
  variant: FixtureVariantName,
  destination: string,
): Promise<MaterializedFixture> {
  if (variant === "malformed" && id !== "CFG-001") {
    throw new Error(`Fixture ${id} does not define a malformed variant.`);
  }

  const approvedRoot = join(destination, "approved");
  const paths = await materializePaths(id, variant, destination, approvedRoot);
  const fixtureCase = getFixtureCase(id);
  const expectedOutcome =
    variant === "malformed" ? "malformed_artifact" : fixtureCase[variant].expectedOutcome;

  return {
    id,
    variant,
    root: destination,
    approvedRoot,
    paths,
    expectedOutcome,
    executionSentinel: join(destination, ".fixture-runtime-executed"),
  };
}

async function materializePaths(
  id: FixtureCaseId,
  variant: FixtureVariantName,
  root: string,
  approvedRoot: string,
): Promise<Readonly<Record<string, string>>> {
  await mkdir(approvedRoot, { recursive: true });

  switch (id) {
    case "CTX-001":
      return materializeApprovedRoot(variant, root, approvedRoot);
    case "FS-001":
      return materializeWorkspaceSymlink(variant, root, approvedRoot);
    case "FS-002":
      return materializeFileSymlink(variant, root, approvedRoot);
    case "FS-003":
      return materializeSymlinkCycle(variant, approvedRoot);
    case "CFG-001":
      return materializeManifestBoundary(variant, approvedRoot);
  }
}

async function materializeApprovedRoot(
  variant: FixtureVariantName,
  root: string,
  approvedRoot: string,
): Promise<Readonly<Record<string, string>>> {
  const importerRoot = join(approvedRoot, "packages", "app", "src");
  const outsideRoot = join(root, "outside");
  await mkdir(importerRoot, { recursive: true });
  await mkdir(outsideRoot, { recursive: true });
  await writeFile(join(importerRoot, "index.ts"), "export const safe = true;\n");
  await writeFile(join(outsideRoot, "secret.ts"), "export const outside = true;\n");

  const importer =
    variant === "positive"
      ? join(importerRoot, "index.ts")
      : `${join(approvedRoot, "packages", "app")}${sep}..${sep}..${sep}..${sep}outside${sep}secret.ts`;
  return { importer };
}

async function materializeWorkspaceSymlink(
  variant: FixtureVariantName,
  root: string,
  approvedRoot: string,
): Promise<Readonly<Record<string, string>>> {
  const packageRoot = join(approvedRoot, "packages", "fixture-pkg");
  const outsidePackageRoot = join(root, "outside", "fixture-pkg");
  const nodeModulesRoot = join(approvedRoot, "node_modules");
  await mkdir(packageRoot, { recursive: true });
  await mkdir(outsidePackageRoot, { recursive: true });
  await mkdir(nodeModulesRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), '{"name":"fixture-pkg","version":"1.0.0"}\n');
  await writeFile(
    join(outsidePackageRoot, "package.json"),
    '{"name":"fixture-pkg","version":"9.9.9"}\n',
  );

  const selected = join(nodeModulesRoot, "fixture-pkg");
  await symlink(
    variant === "positive"
      ? join("..", "packages", "fixture-pkg")
      : join("..", "..", "outside", "fixture-pkg"),
    selected,
    "dir",
  );
  return { packageRoot, selected };
}

async function materializeFileSymlink(
  variant: FixtureVariantName,
  root: string,
  approvedRoot: string,
): Promise<Readonly<Record<string, string>>> {
  const packageRoot = join(approvedRoot, "node_modules", "fixture-pkg");
  const outsideRoot = join(root, "outside");
  await mkdir(packageRoot, { recursive: true });
  await mkdir(outsideRoot, { recursive: true });
  await writeFile(join(packageRoot, "internal.d.ts"), "export type Safe = true;\n");
  await writeFile(join(outsideRoot, "escape.d.ts"), "export type Escaped = true;\n");

  const selected = join(packageRoot, "index.d.ts");
  await symlink(
    variant === "positive" ? "internal.d.ts" : join("..", "..", "..", "outside", "escape.d.ts"),
    selected,
    "file",
  );
  return { packageRoot, selected };
}

async function materializeSymlinkCycle(
  variant: FixtureVariantName,
  approvedRoot: string,
): Promise<Readonly<Record<string, string>>> {
  const packageRoot = join(approvedRoot, "node_modules", "fixture-pkg");
  const linkRoot = join(packageRoot, "links");
  await mkdir(linkRoot, { recursive: true });
  await writeFile(join(packageRoot, "target.d.ts"), "export type Safe = true;\n");

  const selected = join(linkRoot, "a.d.ts");
  await symlink("b.d.ts", selected, "file");
  await symlink(
    variant === "positive" ? join("..", "target.d.ts") : "a.d.ts",
    join(linkRoot, "b.d.ts"),
    "file",
  );
  return { packageRoot, selected };
}

async function materializeManifestBoundary(
  variant: FixtureVariantName,
  approvedRoot: string,
): Promise<Readonly<Record<string, string>>> {
  const packageRoot = join(approvedRoot, "node_modules", "fixture-pkg");
  const manifest = join(packageRoot, "package.json");
  await mkdir(packageRoot, { recursive: true });

  if (variant === "malformed") {
    await writeFile(manifest, '{"name":\n');
  } else {
    await writeFile(manifest, manifestWithBytes(variant === "positive" ? 1_048_576 : 1_048_577));
  }
  return { manifest, packageRoot };
}

function manifestWithBytes(targetBytes: number): string {
  const prefix = '{"name":"fixture-pkg","padding":"';
  const suffix = '"}\n';
  const paddingBytes = targetBytes - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  if (paddingBytes < 0) throw new Error(`Manifest target is too small: ${targetBytes}`);
  return `${prefix}${"x".repeat(paddingBytes)}${suffix}`;
}
