import { createHash, type Hash } from "node:crypto";
import type { Dirent } from "node:fs";
import { lstat, opendir } from "node:fs/promises";
import { join } from "node:path";

import { readContainedFile } from "./bounded-reader.js";
import type { ManifestFailure, NormalizedPackageManifest } from "./manifest.js";
import { normalizePackageManifest } from "./manifest.js";
import type { PathPolicyLimits } from "./path-policy.js";
import { resolveContainedPath } from "./path-policy.js";

export type PackageSnapshotSource = "installed" | "workspace";

export interface PackageSnapshotContextInput {
  readonly importer: string;
  readonly specifier: string;
  readonly conditions: readonly string[];
  readonly tsconfigPath?: string;
}

export interface NormalizedPackageSnapshotContext {
  readonly workspaceRoot: ".";
  readonly importer: string;
  readonly specifier: string;
  readonly conditions: readonly string[];
  readonly tsconfigPath?: string;
}

export interface PackageSnapshotLimits {
  readonly maxManifestBytes: number;
  readonly maxArtifactFileBytes: number;
  readonly maxArtifactBytesRead: number;
  readonly maxFilesVisited: number;
}

export interface ConstructPackageSnapshotInput {
  readonly packageRoot: string;
  readonly approvedRoots: readonly string[];
  readonly source: PackageSnapshotSource;
  readonly context: PackageSnapshotContextInput;
  readonly limits?: Partial<PackageSnapshotLimits>;
  readonly pathLimits?: Partial<PathPolicyLimits>;
  readonly signal?: AbortSignal;
}

export interface PackageSnapshotFile {
  readonly path: string;
  readonly kind: "file" | "symlink-file";
  readonly byteLength: number;
  readonly contentHash: string;
  readonly symlinkTarget?: string;
}

export interface PackageSnapshotIdentity {
  readonly snapshotId: string;
  readonly name: string;
  readonly version: string;
  readonly source: PackageSnapshotSource;
  readonly contentHash: string;
}

export interface PackageSnapshotEvidence {
  readonly kind: "file" | "policy";
  readonly path?: string;
  readonly description: string;
}

export interface PackageSnapshotUsage {
  readonly artifactBytesRead: number;
  readonly filesVisited: number;
}

export interface PackageSnapshot {
  readonly identity: PackageSnapshotIdentity;
  readonly context: NormalizedPackageSnapshotContext;
  readonly manifest: NormalizedPackageManifest;
  readonly files: readonly PackageSnapshotFile[];
  readonly directories: readonly string[];
  readonly evidence: readonly PackageSnapshotEvidence[];
  readonly usage: PackageSnapshotUsage;
  readFile(path: string): Uint8Array | undefined;
}

export type SnapshotConstructionFailure =
  | ManifestFailure
  | {
      readonly code: "invalid_request";
      readonly message: "Snapshot context is not valid normalized workspace input.";
    }
  | {
      readonly code: "malformed_artifact";
      readonly message: "Package artifact cannot form a safe immutable snapshot.";
    }
  | {
      readonly code: "resource_limit_exceeded";
      readonly message: "Package artifact exceeds the configured snapshot budget.";
      readonly limit: "maxArtifactBytesRead" | "maxFilesVisited";
    };

export type PackageSnapshotResult =
  | { readonly ok: true; readonly value: PackageSnapshot }
  | { readonly ok: false; readonly failure: SnapshotConstructionFailure };

/** Captures one installed/workspace package as a bounded immutable, content-identified snapshot. */
export async function constructPackageSnapshot(
  input: ConstructPackageSnapshotInput,
): Promise<PackageSnapshotResult> {
  const limits = effectiveSnapshotLimits(input.limits);
  const root = await resolveContainedPath({
    path: input.packageRoot,
    approvedRoots: input.approvedRoots,
    ...(input.pathLimits === undefined ? {} : { limits: input.pathLimits }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  if (!root.ok) return root;
  if (!(await isDirectory(root.value.canonicalPath))) return malformedSnapshot();

  const context = await normalizeContext(input);
  if (!context.ok) return context;

  const state: CaptureState = {
    limits,
    pathLimits: input.pathLimits,
    approvedRoots: input.approvedRoots,
    artifactRoot: root.value.canonicalPath,
    filesVisited: 0,
    artifactBytesRead: 0,
    files: [],
    directories: [],
    contents: new Map(),
    visitedDirectories: new Set(),
    signal: input.signal,
  };
  const captured = await captureDirectory(root.value.canonicalPath, "", state);
  if (!captured.ok) return captured;
  if (input.signal?.aborted) return cancelledSnapshot();

  const manifestBytes = state.contents.get("package.json");
  if (manifestBytes === undefined) return malformedSnapshot();
  const normalizedManifest = normalizePackageManifest(manifestBytes);
  if (!normalizedManifest.ok) return normalizedManifest;

  const files = Object.freeze(
    [...state.files].sort((left, right) => compare(left.path, right.path)),
  );
  const directories = Object.freeze([...state.directories].sort(compare));
  const contentHash = artifactContentHash(files, directories, state.contents);
  const identity = Object.freeze({
    snapshotId: snapshotIdentityHash(
      contentHash,
      normalizedManifest.value,
      input.source,
      context.value,
    ),
    name: normalizedManifest.value.name,
    version: normalizedManifest.value.version,
    source: input.source,
    contentHash,
  });
  const evidence = Object.freeze([
    Object.freeze({
      kind: "policy" as const,
      description: "Artifact files admitted by first-slice-v1 containment and read budgets.",
    }),
    Object.freeze({
      kind: "file" as const,
      path: "package.json",
      description: "Normalized package identity and resolution metadata.",
    }),
  ]);
  const usage = Object.freeze({
    artifactBytesRead: state.artifactBytesRead,
    filesVisited: state.filesVisited,
  });

  return {
    ok: true,
    value: Object.freeze({
      identity,
      context: context.value,
      manifest: normalizedManifest.value,
      files,
      directories,
      evidence,
      usage,
      readFile(path: string): Uint8Array | undefined {
        const bytes = state.contents.get(path);
        return bytes === undefined ? undefined : Uint8Array.from(bytes);
      },
    }),
  };
}

const firstSliceV1SnapshotLimits: PackageSnapshotLimits = Object.freeze({
  maxManifestBytes: 1_048_576,
  maxArtifactFileBytes: 8_388_608,
  maxArtifactBytesRead: 134_217_728,
  maxFilesVisited: 10_000,
});

interface CaptureState {
  readonly limits: PackageSnapshotLimits;
  readonly pathLimits: Partial<PathPolicyLimits> | undefined;
  readonly approvedRoots: readonly string[];
  readonly artifactRoot: string;
  filesVisited: number;
  artifactBytesRead: number;
  readonly files: PackageSnapshotFile[];
  readonly directories: string[];
  readonly contents: Map<string, Uint8Array>;
  readonly visitedDirectories: Set<string>;
  readonly signal: AbortSignal | undefined;
}

type SnapshotFailureResult = Extract<PackageSnapshotResult, { readonly ok: false }>;
type CaptureResult = { readonly ok: true } | SnapshotFailureResult;

async function captureDirectory(
  directory: string,
  logicalPrefix: string,
  state: CaptureState,
): Promise<CaptureResult> {
  if (state.signal?.aborted) return cancelledSnapshot();
  if (state.visitedDirectories.has(directory)) return malformedSnapshot();
  state.visitedDirectories.add(directory);

  const directoryResolution = await resolveContainedPath({
    path: directory,
    approvedRoots: state.approvedRoots,
    artifactRoot: state.artifactRoot,
    ...(state.pathLimits === undefined ? {} : { limits: state.pathLimits }),
    ...(state.signal === undefined ? {} : { signal: state.signal }),
  });
  if (!directoryResolution.ok) return directoryResolution;
  if (directoryResolution.value.canonicalPath !== directory) return malformedSnapshot();

  const entries: Dirent<string>[] = [];
  try {
    const handle = await opendir(directory);
    for await (const entry of handle) {
      if (state.signal?.aborted) return cancelledSnapshot();
      state.filesVisited += 1;
      if (state.filesVisited > state.limits.maxFilesVisited) {
        return snapshotBudgetExceeded("maxFilesVisited");
      }
      entries.push(entry);
    }
  } catch {
    return malformedSnapshot();
  }
  entries.sort((left, right) => compare(left.name, right.name));

  for (const entry of entries) {
    if (state.signal?.aborted) return cancelledSnapshot();
    const logicalPath = logicalPrefix === "" ? entry.name : `${logicalPrefix}/${entry.name}`;
    const selectedPath = join(directory, entry.name);
    const resolution = await resolveContainedPath({
      path: selectedPath,
      approvedRoots: state.approvedRoots,
      artifactRoot: state.artifactRoot,
      ...(state.pathLimits === undefined ? {} : { limits: state.pathLimits }),
      ...(state.signal === undefined ? {} : { signal: state.signal }),
    });
    if (!resolution.ok) return resolution;

    if (entry.isDirectory()) {
      if (resolution.value.canonicalPath !== selectedPath) return malformedSnapshot();
      state.directories.push(logicalPath);
      const nested = await captureDirectory(resolution.value.canonicalPath, logicalPath, state);
      if (!nested.ok) return nested;
      continue;
    }

    if (!entry.isFile() && !entry.isSymbolicLink()) return malformedSnapshot();
    if (entry.isSymbolicLink() && (await isDirectory(resolution.value.canonicalPath))) {
      return malformedSnapshot();
    }

    const limit = logicalPath === "package.json" ? "maxManifestBytes" : "maxArtifactFileBytes";
    const maxBytes =
      limit === "maxManifestBytes"
        ? state.limits.maxManifestBytes
        : state.limits.maxArtifactFileBytes;
    const read = await readContainedFile({
      path: selectedPath,
      approvedRoots: state.approvedRoots,
      artifactRoot: state.artifactRoot,
      maxBytes,
      limit,
      ...(state.pathLimits === undefined ? {} : { pathLimits: state.pathLimits }),
      ...(state.signal === undefined ? {} : { signal: state.signal }),
    });
    if (!read.ok) return read;

    state.artifactBytesRead += read.value.byteLength;
    if (state.artifactBytesRead > state.limits.maxArtifactBytesRead) {
      return snapshotBudgetExceeded("maxArtifactBytesRead");
    }
    const bytes = Uint8Array.from(read.value.bytes);
    state.contents.set(logicalPath, bytes);
    state.files.push(
      Object.freeze({
        path: logicalPath,
        kind: entry.isSymbolicLink() ? "symlink-file" : "file",
        byteLength: bytes.byteLength,
        contentHash: hashBytes(bytes),
        ...(entry.isSymbolicLink()
          ? { symlinkTarget: read.value.path.artifactRelativePath ?? read.value.path.relativePath }
          : {}),
      }),
    );
  }

  return { ok: true };
}

async function normalizeContext(
  input: ConstructPackageSnapshotInput,
): Promise<
  { readonly ok: true; readonly value: NormalizedPackageSnapshotContext } | SnapshotFailureResult
> {
  if (
    !safeText(input.context.specifier, 512) ||
    input.context.conditions.length > 64 ||
    input.context.conditions.some((condition) => !safeText(condition, 256))
  ) {
    return invalidSnapshotContext();
  }

  const importer = await resolveContainedPath({
    path: input.context.importer,
    approvedRoots: input.approvedRoots,
    ...(input.pathLimits === undefined ? {} : { limits: input.pathLimits }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  if (!importer.ok) return importer;

  let tsconfigPath: string | undefined;
  if (input.context.tsconfigPath !== undefined) {
    const tsconfig = await resolveContainedPath({
      path: input.context.tsconfigPath,
      approvedRoots: input.approvedRoots,
      ...(input.pathLimits === undefined ? {} : { limits: input.pathLimits }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    if (!tsconfig.ok) return tsconfig;
    tsconfigPath = tsconfig.value.relativePath;
  }

  return {
    ok: true,
    value: Object.freeze({
      workspaceRoot: ".",
      importer: importer.value.relativePath,
      specifier: input.context.specifier,
      conditions: Object.freeze([...new Set(input.context.conditions)].sort(compare)),
      ...(tsconfigPath === undefined ? {} : { tsconfigPath }),
    }),
  };
}

function effectiveSnapshotLimits(overrides: Partial<PackageSnapshotLimits> | undefined) {
  return {
    maxManifestBytes: loweredLimit(
      overrides?.maxManifestBytes,
      firstSliceV1SnapshotLimits.maxManifestBytes,
    ),
    maxArtifactFileBytes: loweredLimit(
      overrides?.maxArtifactFileBytes,
      firstSliceV1SnapshotLimits.maxArtifactFileBytes,
    ),
    maxArtifactBytesRead: loweredLimit(
      overrides?.maxArtifactBytesRead,
      firstSliceV1SnapshotLimits.maxArtifactBytesRead,
    ),
    maxFilesVisited: loweredLimit(
      overrides?.maxFilesVisited,
      firstSliceV1SnapshotLimits.maxFilesVisited,
    ),
  };
}

function loweredLimit(candidate: number | undefined, policyDefault: number): number {
  if (candidate === undefined || !Number.isSafeInteger(candidate) || candidate < 1) {
    return policyDefault;
  }
  return Math.min(candidate, policyDefault);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch {
    return false;
  }
}

function safeText(value: string, maxBytes: number): boolean {
  return value !== "" && !value.includes("\0") && Buffer.byteLength(value) <= maxBytes;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function artifactContentHash(
  files: readonly PackageSnapshotFile[],
  directories: readonly string[],
  contents: ReadonlyMap<string, Uint8Array>,
): string {
  const hash = createHash("sha256");
  frame(hash, "package-spelunker-artifact-v1");
  for (const directory of directories) {
    frame(hash, "directory");
    frame(hash, directory);
  }
  for (const file of files) {
    frame(hash, file.path);
    frame(hash, file.kind);
    frame(hash, file.symlinkTarget ?? "");
    frame(hash, contents.get(file.path) ?? new Uint8Array());
  }
  return `sha256:${hash.digest("hex")}`;
}

function snapshotIdentityHash(
  contentHash: string,
  manifest: NormalizedPackageManifest,
  source: PackageSnapshotSource,
  context: NormalizedPackageSnapshotContext,
): string {
  const hash = createHash("sha256");
  frame(hash, "package-spelunker-snapshot-v1");
  frame(hash, contentHash);
  frame(hash, manifest.name);
  frame(hash, manifest.version);
  frame(hash, source);
  frame(hash, JSON.stringify(context));
  return `sha256:${hash.digest("hex")}`;
}

function hashBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function frame(hash: Hash, value: string | Uint8Array): void {
  const bytes = typeof value === "string" ? Buffer.from(value) : value;
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  hash.update(length);
  hash.update(bytes);
}

function invalidSnapshotContext(): SnapshotFailureResult {
  return {
    ok: false,
    failure: {
      code: "invalid_request",
      message: "Snapshot context is not valid normalized workspace input.",
    },
  };
}

function malformedSnapshot(): SnapshotFailureResult {
  return {
    ok: false,
    failure: {
      code: "malformed_artifact",
      message: "Package artifact cannot form a safe immutable snapshot.",
    },
  };
}

function snapshotBudgetExceeded(
  limit: "maxArtifactBytesRead" | "maxFilesVisited",
): SnapshotFailureResult {
  return {
    ok: false,
    failure: {
      code: "resource_limit_exceeded",
      message: "Package artifact exceeds the configured snapshot budget.",
      limit,
    },
  };
}

function cancelledSnapshot(): SnapshotFailureResult {
  return {
    ok: false,
    failure: {
      code: "cancelled",
      message: "Filesystem policy evaluation was cancelled.",
    },
  };
}
