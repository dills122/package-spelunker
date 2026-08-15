import { lstat, opendir } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import { readContainedFile, resolveContainedPath } from "@package-spelunker/package-snapshot";
import { normalizeTypeScriptConditions } from "@package-spelunker/typescript-resolution";

import type { TypeScriptWorkerFileBroker } from "./coordinator.js";
import { isTypeScriptWorkerRequestV1, type TypeScriptWorkerRequestV1 } from "./protocol.js";

export interface TypeScriptResolutionSnapshot {
  readonly identity: {
    readonly snapshotId: string;
    readonly name: string;
    readonly version: string;
  };
  readonly files: readonly {
    readonly path: string;
    readonly byteLength: number;
  }[];
  readonly directories: readonly string[];
  readFile(path: string): Uint8Array | undefined;
}

export interface TypeScriptWorkspaceBrokerLimits {
  readonly maxWorkspaceFileBytes: number;
  readonly maxWorkspaceBytesRead: number;
  readonly maxWorkspaceEntriesObserved: number;
}

export interface PrepareTypeScriptResolutionWorkerInput {
  readonly operationId: string;
  readonly workspaceRoot: string;
  readonly importer: string;
  readonly packageEntryPath: string;
  readonly packageRelativeRoot: string;
  readonly tsconfigPath: string | null;
  readonly specifier: string;
  readonly typescriptConditions: readonly string[];
  readonly snapshot: TypeScriptResolutionSnapshot;
  readonly maxResolverTraceSteps?: number;
  readonly brokerLimits?: Partial<TypeScriptWorkspaceBrokerLimits>;
  readonly signal?: AbortSignal;
}

export interface PreparedTypeScriptResolutionWorker {
  readonly request: TypeScriptWorkerRequestV1;
  readonly broker: TypeScriptWorkerFileBroker;
  readonly signal?: AbortSignal;
}

export type PrepareTypeScriptResolutionWorkerResult =
  | { readonly ok: true; readonly value: PreparedTypeScriptResolutionWorker }
  | {
      readonly ok: false;
      readonly failure: {
        readonly code: "invalid_request";
        readonly message: "TypeScript worker context is not valid bounded snapshot input.";
      };
    };

const virtualWorkspaceRoot = "/workspace";
const packageSpecifierPattern =
  /^(?:@[A-Za-z0-9][A-Za-z0-9._~-]*\/[A-Za-z0-9][A-Za-z0-9._~-]*|[A-Za-z0-9][A-Za-z0-9._~-]*)(?:\/[A-Za-z0-9][A-Za-z0-9._~-]*)*$/;
const defaultBrokerLimits: TypeScriptWorkspaceBrokerLimits = Object.freeze({
  maxWorkspaceFileBytes: 1_048_576,
  maxWorkspaceBytesRead: 16_777_216,
  maxWorkspaceEntriesObserved: 10_000,
});

/** Builds the isolated-worker request and immutable snapshot/workspace filesystem broker. */
export function prepareTypeScriptResolutionWorker(
  input: PrepareTypeScriptResolutionWorkerInput,
): PrepareTypeScriptResolutionWorkerResult {
  const conditions = normalizeTypeScriptConditions(input.typescriptConditions);
  const maxResolverTraceSteps = lowered(input.maxResolverTraceSteps, 10_000);
  if (
    !conditions.ok ||
    !validIdentifier(input.operationId) ||
    !isAbsolute(input.workspaceRoot) ||
    input.workspaceRoot.includes("\0") ||
    !validRelativePath(input.importer) ||
    !validRelativePath(input.packageEntryPath) ||
    !validRelativePath(input.packageRelativeRoot) ||
    (input.tsconfigPath !== null && !validRelativePath(input.tsconfigPath)) ||
    !validText(input.specifier, 512) ||
    !validText(input.snapshot.identity.snapshotId, 256) ||
    !validText(input.snapshot.identity.name, 256) ||
    !validText(input.snapshot.identity.version, 256) ||
    input.snapshot.identity.name !== packageNameFromSpecifier(input.specifier) ||
    !validSnapshot(input.snapshot)
  ) {
    return invalidWorkerContext();
  }

  const request: TypeScriptWorkerRequestV1 = {
    protocolVersion: "1",
    operation: "resolve-declaration",
    operationId: input.operationId,
    snapshotId: input.snapshot.identity.snapshotId,
    specifier: input.specifier,
    importer: virtualPath(input.importer),
    packageRoot: virtualPath(input.packageRelativeRoot),
    tsconfigPath: input.tsconfigPath,
    projectOptions: {
      moduleResolution: "nodenext",
      resolvePackageJsonExports: true,
    },
    conditions: {
      lookupKind: conditions.value.lookupKind,
      conditions: [...conditions.value.conditions],
      customConditions: [...conditions.value.customConditions],
    },
    limits: { maxResolverTraceSteps },
  };
  if (!isTypeScriptWorkerRequestV1(request)) return invalidWorkerContext();

  const broker = createWorkspaceBroker(input);
  return {
    ok: true,
    value: Object.freeze({
      request,
      broker,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    }),
  };
}

interface FileObservation {
  readonly exists: boolean;
  readonly contents?: string;
}

interface DirectoryObservation {
  readonly exists: boolean;
  readonly directories: readonly string[];
}

function createWorkspaceBroker(
  input: PrepareTypeScriptResolutionWorkerInput,
): TypeScriptWorkerFileBroker {
  const limits = effectiveBrokerLimits(input.brokerLimits);
  const packageRoots = [
    virtualPath(input.packageEntryPath),
    virtualPath(input.packageRelativeRoot),
  ].sort((left, right) => right.length - left.length);
  const physicalPackageRoot = virtualPath(input.packageRelativeRoot);
  const snapshotFiles = new Map(input.snapshot.files.map((file) => [file.path, file.byteLength]));
  const snapshotDirectories = new Set(["", ...input.snapshot.directories]);
  const topology = packageTopology(packageRoots, input.snapshot.directories);
  const fileObservations = new Map<string, Promise<FileObservation>>();
  const directoryObservations = new Map<string, Promise<DirectoryObservation>>();
  const realpathObservations = new Map<string, Promise<string>>();
  let workspaceBytesRead = 0;
  let workspaceEntriesObserved = 0;

  const countObservation = (): void => {
    workspaceEntriesObserved += 1;
    if (workspaceEntriesObserved > limits.maxWorkspaceEntriesObserved) {
      throw new Error("Workspace broker observation budget exceeded.");
    }
  };

  const observeFile = (path: string): Promise<FileObservation> => {
    let pending = fileObservations.get(path);
    if (pending !== undefined) return pending;
    pending = (async () => {
      const packagePath = mapPackagePath(path, packageRoots);
      if (packagePath !== undefined) {
        const expectedByteLength = snapshotFiles.get(packagePath);
        if (expectedByteLength === undefined) return { exists: false };
        const bytes = input.snapshot.readFile(packagePath);
        if (bytes === undefined || bytes.byteLength !== expectedByteLength) {
          throw new Error("Snapshot bytes are missing or inconsistent.");
        }
        return { exists: true, contents: Buffer.from(bytes).toString("utf8") };
      }

      countObservation();
      const absolute = workspaceAbsolute(path, input.workspaceRoot);
      if (absolute === undefined) return { exists: false };
      try {
        const metadata = await lstat(absolute);
        if (!metadata.isFile() && !metadata.isSymbolicLink()) return { exists: false };
      } catch {
        return { exists: false };
      }
      const resolved = await resolveContainedPath({
        path: absolute,
        approvedRoots: [input.workspaceRoot],
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      if (!resolved.ok || withinSelectedPackage(resolved.value.relativePath, input)) {
        return { exists: false };
      }
      if (!workspaceReadAllowed(path, input.importer)) return { exists: true };

      const read = await readContainedFile({
        path: resolved.value.canonicalPath,
        approvedRoots: [input.workspaceRoot],
        maxBytes: limits.maxWorkspaceFileBytes,
        limit: "maxArtifactFileBytes",
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      if (!read.ok) throw new Error("Workspace metadata read failed.");
      workspaceBytesRead += read.value.byteLength;
      if (workspaceBytesRead > limits.maxWorkspaceBytesRead) {
        throw new Error("Workspace broker byte budget exceeded.");
      }
      return { exists: true, contents: Buffer.from(read.value.bytes).toString("utf8") };
    })();
    fileObservations.set(path, pending);
    return pending;
  };

  const observeDirectory = (path: string): Promise<DirectoryObservation> => {
    let pending = directoryObservations.get(path);
    if (pending !== undefined) return pending;
    pending = (async () => {
      const packagePath = mapPackagePath(path, packageRoots);
      if (packagePath !== undefined) {
        return {
          exists: snapshotDirectories.has(packagePath),
          directories: snapshotChildDirectories(packagePath, snapshotDirectories),
        };
      }

      const synthetic = topology.get(path);
      countObservation();
      const absolute = workspaceAbsolute(path, input.workspaceRoot);
      if (absolute === undefined) {
        return { exists: synthetic !== undefined, directories: frozenSorted(synthetic ?? []) };
      }
      let liveDirectories: string[] = [];
      let liveExists = false;
      const resolved = await resolveContainedPath({
        path: absolute,
        approvedRoots: [input.workspaceRoot],
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      if (resolved.ok && !withinSelectedPackage(resolved.value.relativePath, input)) {
        try {
          const handle = await opendir(resolved.value.canonicalPath);
          for await (const entry of handle) {
            if (entry.isDirectory() || entry.isSymbolicLink()) liveDirectories.push(entry.name);
            if (liveDirectories.length > limits.maxWorkspaceEntriesObserved) {
              throw new Error("Workspace directory result is too large.");
            }
          }
          liveExists = true;
        } catch (error) {
          if (liveDirectories.length > limits.maxWorkspaceEntriesObserved) throw error;
          liveDirectories = [];
        }
      }
      const directories = frozenSorted([...(synthetic ?? []), ...liveDirectories]);
      return { exists: synthetic !== undefined || liveExists, directories };
    })();
    directoryObservations.set(path, pending);
    return pending;
  };

  const observeRealpath = (path: string): Promise<string> => {
    let pending = realpathObservations.get(path);
    if (pending !== undefined) return pending;
    pending = (async () => {
      const packagePath = mapPackagePath(path, packageRoots);
      if (packagePath !== undefined) {
        return packagePath === "" ? physicalPackageRoot : `${physicalPackageRoot}/${packagePath}`;
      }
      countObservation();
      const absolute = workspaceAbsolute(path, input.workspaceRoot);
      if (absolute === undefined) return path;
      const resolved = await resolveContainedPath({
        path: absolute,
        approvedRoots: [input.workspaceRoot],
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      return resolved.ok ? virtualPath(resolved.value.relativePath) : path;
    })();
    realpathObservations.set(path, pending);
    return pending;
  };

  return Object.freeze({
    async fileExists(path: string) {
      return (await observeFile(path)).exists;
    },
    async readFile(path: string) {
      return (await observeFile(path)).contents;
    },
    async directoryExists(path: string) {
      return (await observeDirectory(path)).exists;
    },
    async getDirectories(path: string) {
      return (await observeDirectory(path)).directories;
    },
    realpath: observeRealpath,
  });
}

function validSnapshot(snapshot: TypeScriptResolutionSnapshot): boolean {
  const filePaths = snapshot.files.map((file) => file.path);
  return (
    snapshot.files.length <= 10_000 &&
    snapshot.directories.length <= 10_000 &&
    new Set(filePaths).size === filePaths.length &&
    filePaths.every(validRelativePath) &&
    snapshot.files.every(
      (file) =>
        Number.isSafeInteger(file.byteLength) &&
        file.byteLength >= 0 &&
        file.byteLength <= 8_388_608,
    ) &&
    snapshot.directories.every(validRelativePath) &&
    new Set(snapshot.directories).size === snapshot.directories.length
  );
}

function packageTopology(
  roots: readonly string[],
  snapshotDirectories: readonly string[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const topology = new Map<string, Set<string>>();
  const add = (parent: string, child: string): void => {
    const entries = topology.get(parent) ?? new Set<string>();
    entries.add(child);
    topology.set(parent, entries);
  };
  for (const root of roots) {
    let parent = virtualWorkspaceRoot;
    for (const segment of root.slice(`${virtualWorkspaceRoot}/`.length).split("/")) {
      add(parent, segment);
      parent = `${parent}/${segment}`;
    }
    for (const directory of snapshotDirectories) {
      const segments = directory.split("/");
      let current = root;
      for (const segment of segments) {
        add(current, segment);
        current = `${current}/${segment}`;
      }
    }
  }
  return topology;
}

function snapshotChildDirectories(
  parent: string,
  directories: ReadonlySet<string>,
): readonly string[] {
  const prefix = parent === "" ? "" : `${parent}/`;
  return frozenSorted(
    [...directories]
      .filter((candidate) => candidate.startsWith(prefix) && candidate !== parent)
      .map((candidate) => candidate.slice(prefix.length))
      .filter((candidate) => candidate !== "" && !candidate.includes("/")),
  );
}

function mapPackagePath(path: string, roots: readonly string[]): string | undefined {
  for (const root of roots) {
    if (path === root) return "";
    if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
  }
  return undefined;
}

function workspaceAbsolute(path: string, workspaceRoot: string): string | undefined {
  if (path !== virtualWorkspaceRoot && !path.startsWith(`${virtualWorkspaceRoot}/`)) {
    return undefined;
  }
  const workspacePath =
    path === virtualWorkspaceRoot ? "" : path.slice(virtualWorkspaceRoot.length + 1);
  if (workspacePath.split("/").some((segment) => segment === "..")) return undefined;
  return join(workspaceRoot, ...workspacePath.split("/"));
}

function workspaceReadAllowed(path: string, importer: string): boolean {
  return path === virtualPath(importer) || path.endsWith(".json");
}

function packageNameFromSpecifier(specifier: string): string | undefined {
  if (!packageSpecifierPattern.test(specifier)) return undefined;
  const segments = specifier.split("/");
  const packageSegments = specifier.startsWith("@") ? segments.slice(0, 2) : segments.slice(0, 1);
  return packageSegments.length === 0 || packageSegments.some((segment) => segment === "")
    ? undefined
    : packageSegments.join("/");
}

function withinSelectedPackage(
  workspaceRelativePath: string,
  input: PrepareTypeScriptResolutionWorkerInput,
): boolean {
  return [input.packageEntryPath, input.packageRelativeRoot].some(
    (root) => workspaceRelativePath === root || workspaceRelativePath.startsWith(`${root}/`),
  );
}

function virtualPath(path: string): string {
  if (path === "." || path === "") return virtualWorkspaceRoot;
  return `${virtualWorkspaceRoot}/${path.split(sep).join("/")}`;
}

function validRelativePath(path: string): boolean {
  return (
    validText(path, 4096) &&
    !isAbsolute(path) &&
    !path.includes("\\") &&
    !path.split("/").includes("..") &&
    path !== "." &&
    relative(".", path).split(sep).join("/") === path
  );
}

function validIdentifier(value: string): boolean {
  return validText(value, 256);
}

function validText(value: string, maxBytes: number): boolean {
  return value.length > 0 && !value.includes("\0") && Buffer.byteLength(value, "utf8") <= maxBytes;
}

function effectiveBrokerLimits(
  overrides: Partial<TypeScriptWorkspaceBrokerLimits> | undefined,
): TypeScriptWorkspaceBrokerLimits {
  return {
    maxWorkspaceFileBytes: lowered(
      overrides?.maxWorkspaceFileBytes,
      defaultBrokerLimits.maxWorkspaceFileBytes,
    ),
    maxWorkspaceBytesRead: lowered(
      overrides?.maxWorkspaceBytesRead,
      defaultBrokerLimits.maxWorkspaceBytesRead,
    ),
    maxWorkspaceEntriesObserved: lowered(
      overrides?.maxWorkspaceEntriesObserved,
      defaultBrokerLimits.maxWorkspaceEntriesObserved,
    ),
  };
}

function lowered(candidate: number | undefined, fallback: number): number {
  return candidate === undefined || !Number.isSafeInteger(candidate) || candidate < 1
    ? fallback
    : Math.min(candidate, fallback);
}

function frozenSorted(values: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compare));
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalidWorkerContext(): PrepareTypeScriptResolutionWorkerResult {
  return {
    ok: false,
    failure: Object.freeze({
      code: "invalid_request" as const,
      message: "TypeScript worker context is not valid bounded snapshot input." as const,
    }),
  };
}
