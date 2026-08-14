import { lstat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  ManifestFailure,
  PackageSnapshotSource,
  PathPolicyFailure,
  PathPolicyLimits,
  PathResolution,
} from "@package-spelunker/package-snapshot";
import {
  readContainedFile,
  readPackageManifest,
  resolveContainedPath,
} from "@package-spelunker/package-snapshot";

import {
  type InvalidPackageSpecifierFailure,
  type PackageSpecifier,
  parsePackageSpecifier,
} from "./package-specifier.js";

export type WorkspacePackageManager = "npm" | "pnpm";

export type WorkspaceEvidenceRole =
  | "workspace-manifest"
  | "lockfile"
  | "workspace-config"
  | "importer-manifest"
  | "tsconfig"
  | "selected-package-manifest";

export interface WorkspaceEvidence {
  readonly kind: "file";
  readonly role: WorkspaceEvidenceRole;
  readonly path: string;
  readonly description: string;
}

export interface WorkspaceModelLimits {
  readonly maxManifestBytes: number;
  readonly maxLockfileBytes: number;
}

export interface DiscoverWorkspacePackageInput {
  readonly workspaceRoot: string;
  readonly importer: string;
  readonly specifier: string;
  readonly tsconfigPath?: string;
  readonly limits?: Partial<WorkspaceModelLimits>;
  readonly pathLimits?: Partial<PathPolicyLimits>;
  readonly signal?: AbortSignal;
}

export interface WorkspacePackageSelection {
  readonly approvedRoots: readonly [string];
  readonly workspaceRoot: string;
  readonly importer: {
    readonly path: string;
    readonly relativePath: string;
    readonly packageRoot: string;
    readonly packageName: string;
  };
  readonly packageManager: WorkspacePackageManager;
  readonly requested: PackageSpecifier;
  readonly selectedPackage: {
    readonly root: string;
    readonly relativeRoot: string;
    readonly entryPath: string;
    readonly name: string;
    readonly version: string;
    readonly source: PackageSnapshotSource;
  };
  readonly configuration: {
    readonly workspaceManifest: string;
    readonly importerManifest: string;
    readonly lockfile?: string;
    readonly workspaceConfig?: string;
    readonly tsconfig?: string;
  };
  readonly evidence: readonly WorkspaceEvidence[];
}

export type WorkspaceModelFailure =
  | InvalidPackageSpecifierFailure
  | PathPolicyFailure
  | ManifestFailure
  | {
      readonly code: "malformed_artifact";
      readonly message: "Workspace configuration is not valid bounded metadata.";
    }
  | {
      readonly code: "package_not_found";
      readonly message: "No installed package candidate was found for the requested importer.";
    }
  | {
      readonly code: "unsupported_context";
      readonly message:
        | "Workspace package-manager or configuration context is unsupported."
        | "Workspace package-manager or package selection context is ambiguous.";
    };

export type WorkspacePackageSelectionResult =
  | { readonly ok: true; readonly value: WorkspacePackageSelection }
  | { readonly ok: false; readonly failure: WorkspaceModelFailure };

export async function discoverWorkspacePackage(
  input: DiscoverWorkspacePackageInput,
): Promise<WorkspacePackageSelectionResult> {
  const requested = parsePackageSpecifier(input.specifier);
  if (!requested.ok) return requested;

  const root = await resolveContainedPath({
    path: input.workspaceRoot,
    approvedRoots: [input.workspaceRoot],
    ...(input.pathLimits === undefined ? {} : { limits: input.pathLimits }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  if (!root.ok) return root;
  const workspaceRoot = root.value.canonicalPath;
  const approvedRoots = [workspaceRoot] as const;
  const limits = effectiveWorkspaceLimits(input.limits);

  const importerInput = mapWorkspaceInput(input.importer, input.workspaceRoot, workspaceRoot);
  const importer = await resolveContainedPath({
    path: importerInput,
    approvedRoots,
    ...(input.pathLimits === undefined ? {} : { limits: input.pathLimits }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  if (!importer.ok) return importer;
  if (!(await isRegularFile(importer.value.canonicalPath))) return malformedWorkspace();

  const workspaceManifestPath = join(workspaceRoot, "package.json");
  const workspaceManifestRead = await readWorkspaceMetadata(
    workspaceManifestPath,
    approvedRoots,
    limits.maxManifestBytes,
    "maxManifestBytes",
    input,
  );
  if (!workspaceManifestRead.ok) return workspaceManifestRead;
  const workspaceManifest = parseWorkspaceManifest(workspaceManifestRead.value.bytes);
  if (workspaceManifest === undefined) return malformedWorkspace();

  const manager = await discoverPackageManager(workspaceRoot, approvedRoots, limits, input);
  if (!manager.ok) return manager;

  const patterns =
    manager.value.manager === "npm"
      ? workspaceManifest.workspacePatterns
      : manager.value.workspacePatterns;
  if (patterns === undefined || patterns.some((pattern) => !isSupportedWorkspacePattern(pattern))) {
    return unsupportedWorkspace();
  }

  const importerPackage = await findNearestImporterPackage(
    dirname(importer.value.canonicalPath),
    workspaceRoot,
    approvedRoots,
    limits,
    input,
  );
  if (!importerPackage.ok) return importerPackage;
  const importerPackageRelative = workspaceRelative(workspaceRoot, importerPackage.value.root);
  if (
    importerPackageRelative !== "." &&
    !patterns.some((pattern) => matchesWorkspacePattern(importerPackageRelative, pattern))
  ) {
    return unsupportedWorkspace();
  }

  const tsconfig = await discoverTsconfig(
    input.tsconfigPath,
    dirname(importer.value.canonicalPath),
    workspaceRoot,
    approvedRoots,
    limits,
    input,
  );
  if (!tsconfig.ok) return tsconfig;

  const selectedPackage = await selectInstalledPackage(
    importerPackage.value.root,
    workspaceRoot,
    approvedRoots,
    requested.value,
    patterns,
    input,
  );
  if (!selectedPackage.ok) return selectedPackage;

  const importerManifestPath = workspaceRelative(
    workspaceRoot,
    join(importerPackage.value.root, "package.json"),
  );
  const evidenceEntries: WorkspaceEvidence[] = [
    evidenceEntry(
      "workspace-manifest",
      "package.json",
      "Workspace package declarations and package-manager context.",
    ),
    ...(manager.value.lockfile === undefined
      ? []
      : [
          evidenceEntry(
            "lockfile",
            manager.value.lockfile,
            "Package-manager lockfile selected for this workspace context.",
          ),
        ]),
    ...(manager.value.workspaceConfig === undefined
      ? []
      : [
          evidenceEntry(
            "workspace-config",
            manager.value.workspaceConfig,
            "Workspace package membership configuration.",
          ),
        ]),
    evidenceEntry(
      "importer-manifest",
      importerManifestPath,
      "Nearest workspace package manifest for the explicit importer.",
    ),
    ...(tsconfig.value === undefined
      ? []
      : [
          evidenceEntry(
            "tsconfig",
            tsconfig.value,
            "Nearest or explicitly selected TypeScript project configuration.",
          ),
        ]),
    evidenceEntry(
      "selected-package-manifest",
      `${selectedPackage.value.relativeRoot}/package.json`,
      "Manifest identity for the exact installed package candidate.",
    ),
  ];
  const evidence = Object.freeze(evidenceEntries.map((entry) => Object.freeze(entry)));

  const configuration = Object.freeze({
    workspaceManifest: "package.json",
    importerManifest: importerManifestPath,
    ...(manager.value.lockfile === undefined ? {} : { lockfile: manager.value.lockfile }),
    ...(manager.value.workspaceConfig === undefined
      ? {}
      : { workspaceConfig: manager.value.workspaceConfig }),
    ...(tsconfig.value === undefined ? {} : { tsconfig: tsconfig.value }),
  });
  return {
    ok: true,
    value: Object.freeze({
      approvedRoots,
      workspaceRoot,
      importer: Object.freeze({
        path: importer.value.canonicalPath,
        relativePath: workspaceRelative(workspaceRoot, importer.value.canonicalPath),
        packageRoot: importerPackage.value.root,
        packageName: importerPackage.value.name,
      }),
      packageManager: manager.value.manager,
      requested: Object.freeze(requested.value),
      selectedPackage: Object.freeze(selectedPackage.value),
      configuration,
      evidence,
    }),
  };
}

interface WorkspaceManifest {
  readonly name: string;
  readonly workspacePatterns?: readonly string[];
}

interface ImporterPackage {
  readonly root: string;
  readonly name: string;
}

interface PackageManagerContext {
  readonly manager: WorkspacePackageManager;
  readonly lockfile?: string;
  readonly workspaceConfig?: string;
  readonly workspacePatterns?: readonly string[];
}

type InternalResult<T> =
  | { readonly ok: true; readonly value: T }
  | Extract<WorkspacePackageSelectionResult, { readonly ok: false }>;

function effectiveWorkspaceLimits(overrides: Partial<WorkspaceModelLimits> | undefined) {
  return {
    maxManifestBytes: loweredLimit(overrides?.maxManifestBytes, 1_048_576),
    maxLockfileBytes: loweredLimit(overrides?.maxLockfileBytes, 33_554_432),
  };
}

function loweredLimit(candidate: number | undefined, policyDefault: number): number {
  if (candidate === undefined || !Number.isSafeInteger(candidate) || candidate < 1) {
    return policyDefault;
  }
  return Math.min(candidate, policyDefault);
}

async function discoverPackageManager(
  workspaceRoot: string,
  approvedRoots: readonly string[],
  limits: WorkspaceModelLimits,
  input: DiscoverWorkspacePackageInput,
): Promise<InternalResult<PackageManagerContext>> {
  const candidates = await Promise.all(
    ["package-lock.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"].map(
      async (name) =>
        [name, await probeContainedPath(join(workspaceRoot, name), approvedRoots, input)] as const,
    ),
  );
  for (const [, candidate] of candidates) if (!candidate.ok) return candidate;
  const present = new Set(
    candidates.flatMap(([name, candidate]) => (candidate.ok && candidate.value ? [name] : [])),
  );
  const managers = new Set<WorkspacePackageManager>();
  if (present.has("package-lock.json")) managers.add("npm");
  if (present.has("pnpm-lock.yaml") || present.has("pnpm-workspace.yaml")) managers.add("pnpm");
  if (managers.size > 1) return ambiguousWorkspace();
  const manager = [...managers][0];
  if (manager === undefined) return unsupportedWorkspace();

  const lockfile = manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml";
  if (present.has(lockfile)) {
    const read = await readWorkspaceMetadata(
      join(workspaceRoot, lockfile),
      approvedRoots,
      limits.maxLockfileBytes,
      "maxLockfileBytes",
      input,
    );
    if (!read.ok) return read;
  }

  if (manager === "pnpm" && present.has("pnpm-workspace.yaml")) {
    const read = await readWorkspaceMetadata(
      join(workspaceRoot, "pnpm-workspace.yaml"),
      approvedRoots,
      limits.maxManifestBytes,
      "maxManifestBytes",
      input,
    );
    if (!read.ok) return read;
    const workspacePatterns = parsePnpmWorkspacePatterns(read.value.bytes);
    if (workspacePatterns === undefined) return malformedWorkspace();
    return {
      ok: true,
      value: {
        manager,
        ...(present.has(lockfile) ? { lockfile } : {}),
        workspaceConfig: "pnpm-workspace.yaml",
        workspacePatterns,
      },
    };
  }

  return { ok: true, value: { manager, ...(present.has(lockfile) ? { lockfile } : {}) } };
}

async function findNearestImporterPackage(
  start: string,
  workspaceRoot: string,
  approvedRoots: readonly string[],
  limits: WorkspaceModelLimits,
  input: DiscoverWorkspacePackageInput,
): Promise<InternalResult<ImporterPackage>> {
  let current = start;
  while (isContained(workspaceRoot, current)) {
    const manifestPath = join(current, "package.json");
    const probe = await probeContainedPath(manifestPath, approvedRoots, input);
    if (!probe.ok) return probe;
    if (probe.value !== undefined) {
      const read = await readWorkspaceMetadata(
        manifestPath,
        approvedRoots,
        limits.maxManifestBytes,
        "maxManifestBytes",
        input,
      );
      if (!read.ok) return read;
      const manifest = parseWorkspaceManifest(read.value.bytes);
      if (manifest === undefined) return malformedWorkspace();
      return { ok: true, value: { root: current, name: manifest.name } };
    }
    if (current === workspaceRoot) break;
    current = dirname(current);
  }
  return unsupportedWorkspace();
}

async function discoverTsconfig(
  requestedPath: string | undefined,
  start: string,
  workspaceRoot: string,
  approvedRoots: readonly string[],
  limits: WorkspaceModelLimits,
  input: DiscoverWorkspacePackageInput,
): Promise<InternalResult<string | undefined>> {
  if (requestedPath !== undefined) {
    const selectedPath = mapWorkspaceInput(requestedPath, input.workspaceRoot, workspaceRoot);
    const read = await readWorkspaceMetadata(
      selectedPath,
      approvedRoots,
      limits.maxManifestBytes,
      "maxManifestBytes",
      input,
    );
    if (!read.ok) return read;
    return { ok: true, value: workspaceRelative(workspaceRoot, read.value.path.canonicalPath) };
  }

  let current = start;
  while (isContained(workspaceRoot, current)) {
    const candidatePath = join(current, "tsconfig.json");
    const candidate = await probeContainedPath(candidatePath, approvedRoots, input);
    if (!candidate.ok) return candidate;
    if (candidate.value !== undefined) {
      const read = await readWorkspaceMetadata(
        candidatePath,
        approvedRoots,
        limits.maxManifestBytes,
        "maxManifestBytes",
        input,
      );
      if (!read.ok) return read;
      return { ok: true, value: workspaceRelative(workspaceRoot, read.value.path.canonicalPath) };
    }
    if (current === workspaceRoot) break;
    current = dirname(current);
  }
  return { ok: true, value: undefined };
}

async function selectInstalledPackage(
  importerPackageRoot: string,
  workspaceRoot: string,
  approvedRoots: readonly string[],
  requested: PackageSpecifier,
  workspacePatterns: readonly string[],
  input: DiscoverWorkspacePackageInput,
): Promise<InternalResult<WorkspacePackageSelection["selectedPackage"]>> {
  const packageSegments = requested.packageName.split("/");
  let current = importerPackageRoot;
  while (isContained(workspaceRoot, current)) {
    const entry = join(current, "node_modules", ...packageSegments);
    const candidate = await probeContainedPath(entry, approvedRoots, input);
    if (!candidate.ok) return candidate;
    if (candidate.value !== undefined) {
      if (!(await isDirectory(candidate.value.canonicalPath))) return malformedWorkspace();
      const manifest = await readPackageManifest({
        packageRoot: candidate.value.canonicalPath,
        approvedRoots,
        ...(input.limits?.maxManifestBytes === undefined
          ? {}
          : { maxManifestBytes: input.limits.maxManifestBytes }),
        ...(input.pathLimits === undefined ? {} : { pathLimits: input.pathLimits }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      if (!manifest.ok) return manifest;
      if (manifest.value.manifest.name !== requested.packageName) return malformedWorkspace();
      const relativeRoot = workspaceRelative(workspaceRoot, candidate.value.canonicalPath);
      const entryPath = workspaceRelative(workspaceRoot, entry);
      const source =
        !relativeRoot.startsWith("node_modules/") &&
        workspacePatterns.some((pattern) => matchesWorkspacePattern(relativeRoot, pattern))
          ? "workspace"
          : "installed";
      return {
        ok: true,
        value: {
          root: candidate.value.canonicalPath,
          relativeRoot,
          entryPath,
          name: manifest.value.manifest.name,
          version: manifest.value.manifest.version,
          source,
        },
      };
    }
    if (current === workspaceRoot) break;
    current = dirname(current);
  }
  return packageNotFound();
}

async function readWorkspaceMetadata(
  path: string,
  approvedRoots: readonly string[],
  maxBytes: number,
  limit: "maxManifestBytes" | "maxLockfileBytes",
  input: DiscoverWorkspacePackageInput,
) {
  return readContainedFile({
    path,
    approvedRoots,
    maxBytes,
    limit,
    ...(input.pathLimits === undefined ? {} : { pathLimits: input.pathLimits }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
}

async function probeContainedPath(
  path: string,
  approvedRoots: readonly string[],
  input: DiscoverWorkspacePackageInput,
): Promise<InternalResult<PathResolution | undefined>> {
  const parentPath = dirname(path);
  if (!isContained(approvedRoots[0] ?? "", parentPath)) {
    return {
      ok: false,
      failure: {
        code: "outside_approved_root",
        message: "Selected path is outside the approved filesystem roots.",
      },
    };
  }
  try {
    await lstat(parentPath);
  } catch (error) {
    if (isMissingFileError(error)) return { ok: true, value: undefined };
    return malformedWorkspace();
  }
  const parent = await resolveContainedPath({
    path: parentPath,
    approvedRoots,
    ...(input.pathLimits === undefined ? {} : { limits: input.pathLimits }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  if (!parent.ok) return parent;
  const selected = join(parent.value.canonicalPath, path.slice(path.lastIndexOf(sep) + 1));
  try {
    await lstat(selected);
  } catch (error) {
    if (isMissingFileError(error)) return { ok: true, value: undefined };
    return malformedWorkspace();
  }
  const resolution = await resolveContainedPath({
    path: selected,
    approvedRoots,
    ...(input.pathLimits === undefined ? {} : { limits: input.pathLimits }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  return resolution.ok ? { ok: true, value: resolution.value } : resolution;
}

function parseWorkspaceManifest(bytes: Uint8Array): WorkspaceManifest | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !isBoundedIdentifier(parsed.name)) return undefined;
  const rawWorkspaces = Array.isArray(parsed.workspaces)
    ? parsed.workspaces
    : isRecord(parsed.workspaces) && Array.isArray(parsed.workspaces.packages)
      ? parsed.workspaces.packages
      : undefined;
  if (rawWorkspaces !== undefined && !rawWorkspaces.every(isBoundedString)) return undefined;
  return {
    name: parsed.name,
    ...(rawWorkspaces === undefined ? {} : { workspacePatterns: Object.freeze(rawWorkspaces) }),
  };
}

function parsePnpmWorkspacePatterns(bytes: Uint8Array): readonly string[] | undefined {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^packages:\s*(?:#.*)?$/.test(line));
  if (start < 0) return undefined;
  const patterns: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) break;
    const match = /^\s+-\s+(.+?)\s*(?:#.*)?$/.exec(line);
    if (match?.[1] === undefined) continue;
    const pattern = unquoteYamlScalar(match[1]);
    if (pattern === undefined || !isBoundedString(pattern)) return undefined;
    patterns.push(pattern);
  }
  return Object.freeze(patterns);
}

function unquoteYamlScalar(value: string): string | undefined {
  if (value.startsWith("'") || value.startsWith('"')) {
    if (value.length < 2 || value.at(-1) !== value[0]) return undefined;
    return value.slice(1, -1);
  }
  return value;
}

function isSupportedWorkspacePattern(pattern: string): boolean {
  if (pattern.startsWith("/") || pattern.includes("\\") || pattern.includes("..")) return false;
  const parts = pattern.split("/");
  return parts.every(
    (part, index) =>
      (part === "*" && index === parts.length - 1) || /^[A-Za-z0-9._~-]+$/.test(part),
  );
}

function matchesWorkspacePattern(packagePath: string, pattern: string): boolean {
  if (!pattern.endsWith("/*")) return packagePath === pattern;
  const prefix = pattern.slice(0, -1);
  if (!packagePath.startsWith(prefix)) return false;
  const remainder = packagePath.slice(prefix.length);
  return remainder.length > 0 && !remainder.includes("/");
}

function workspaceRelative(workspaceRoot: string, path: string): string {
  const value = relative(workspaceRoot, path).split(sep).join("/");
  return value === "" ? "." : value;
}

function mapWorkspaceInput(path: string, inputRoot: string, canonicalRoot: string): string {
  if (!isAbsolute(path)) return join(canonicalRoot, path);
  const candidate = relative(resolve(inputRoot), resolve(path));
  if (candidate === "" || (!candidate.startsWith(`..${sep}`) && candidate !== "..")) {
    return join(canonicalRoot, candidate);
  }
  return path;
}

function isContained(root: string, path: string): boolean {
  const candidate = relative(root, resolve(path));
  return candidate === "" || (!candidate.startsWith(`..${sep}`) && candidate !== "..");
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch {
    return false;
  }
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedIdentifier(value: unknown): value is string {
  return isBoundedString(value) && value.trim() !== "" && Buffer.byteLength(value) <= 256;
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value !== "" && Buffer.byteLength(value) <= 4_096;
}

function evidenceEntry(
  role: WorkspaceEvidenceRole,
  path: string,
  description: string,
): WorkspaceEvidence {
  return { kind: "file", role, path, description };
}

function malformedWorkspace(): Extract<WorkspacePackageSelectionResult, { readonly ok: false }> {
  return {
    ok: false,
    failure: {
      code: "malformed_artifact",
      message: "Workspace configuration is not valid bounded metadata.",
    },
  };
}

function unsupportedWorkspace(): Extract<WorkspacePackageSelectionResult, { readonly ok: false }> {
  return {
    ok: false,
    failure: {
      code: "unsupported_context",
      message: "Workspace package-manager or configuration context is unsupported.",
    },
  };
}

function ambiguousWorkspace(): Extract<WorkspacePackageSelectionResult, { readonly ok: false }> {
  return {
    ok: false,
    failure: {
      code: "unsupported_context",
      message: "Workspace package-manager or package selection context is ambiguous.",
    },
  };
}

function packageNotFound(): Extract<WorkspacePackageSelectionResult, { readonly ok: false }> {
  return {
    ok: false,
    failure: {
      code: "package_not_found",
      message: "No installed package candidate was found for the requested importer.",
    },
  };
}
