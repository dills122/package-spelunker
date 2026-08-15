import { posix } from "node:path";

import ts from "@typescript/typescript6";

import type { NormalizedTypeScriptConditions, TypeScriptLookupKind } from "./conditions.js";

export type SupportedTypeScriptModuleResolution = "node16" | "nodenext";

export interface TypeScriptProjectResolutionOptions {
  readonly moduleResolution: SupportedTypeScriptModuleResolution;
  readonly baseUrl?: string;
  readonly paths?: Readonly<Record<string, readonly string[]>>;
  readonly moduleSuffixes?: readonly string[];
  readonly resolvePackageJsonExports?: boolean;
  readonly preserveSymlinks?: boolean;
}

export interface TypeScriptResolutionFileHost {
  readonly currentDirectory: string;
  fileExists(path: string): boolean;
  readFile(path: string): string | undefined;
  directoryExists(path: string): boolean;
  getDirectories(path: string): readonly string[];
  realpath(path: string): string;
}

export interface TypeScriptResolutionLimits {
  readonly maxResolverTraceSteps: number;
}

export interface ResolveTypeScriptDeclarationInput {
  readonly snapshotId: string;
  readonly specifier: string;
  readonly importer: string;
  readonly packageRoot: string;
  readonly tsconfigPath: string | null;
  readonly projectOptions: TypeScriptProjectResolutionOptions;
  readonly conditions: NormalizedTypeScriptConditions;
  readonly host: TypeScriptResolutionFileHost;
  readonly limits?: Partial<TypeScriptResolutionLimits>;
  readonly signal?: AbortSignal;
}

export type TypeScriptResolutionTraceKind =
  | "resolution-start"
  | "file-probe"
  | "file-read"
  | "directory-probe"
  | "directory-list"
  | "realpath"
  | "resolution-selected";

export interface TypeScriptResolutionTraceStep {
  readonly kind: TypeScriptResolutionTraceKind;
  readonly path?: string;
  readonly outcome: "start" | "found" | "missing" | "selected";
}

export interface TypeScriptResolution {
  readonly target: string;
  readonly compilerVersion: string;
  readonly tsconfigPath: string | null;
  readonly moduleResolution: SupportedTypeScriptModuleResolution;
  readonly lookupKind: TypeScriptLookupKind;
  readonly conditions: readonly string[];
  readonly snapshotId: string;
  readonly trace: readonly TypeScriptResolutionTraceStep[];
  readonly usage: {
    readonly resolverTraceSteps: number;
  };
}

export type TypeScriptResolutionFailure =
  | {
      readonly code: "invalid_request";
      readonly message: "TypeScript resolution input is not valid bounded workspace context.";
    }
  | {
      readonly code: "resolution_failed";
      readonly message: "TypeScript did not resolve a declaration for the selected package.";
    }
  | {
      readonly code: "unsupported_context";
      readonly message:
        | "TypeScript resolved outside the selected package snapshot."
        | "TypeScript project module resolution is outside first-slice support.";
    }
  | {
      readonly code: "malformed_artifact";
      readonly message:
        | "TypeScript selected a declaration missing from the admitted snapshot."
        | "TypeScript project configuration is not valid bounded metadata.";
    }
  | {
      readonly code: "resource_limit_exceeded";
      readonly message: "TypeScript resolution exceeded its configured trace budget.";
      readonly limit: "maxResolverTraceSteps";
    }
  | {
      readonly code: "cancelled";
      readonly message: "TypeScript declaration resolution was cancelled.";
    }
  | {
      readonly code: "analysis_failed";
      readonly message: "TypeScript declaration resolution could not complete safely.";
    };

export type TypeScriptResolutionResult =
  | { readonly ok: true; readonly value: TypeScriptResolution }
  | { readonly ok: false; readonly failure: TypeScriptResolutionFailure };

const firstSliceResolverTraceSteps = 10_000;
const packageSpecifierPattern =
  /^(?:@[A-Za-z0-9][A-Za-z0-9._~-]*\/[A-Za-z0-9][A-Za-z0-9._~-]*|[A-Za-z0-9][A-Za-z0-9._~-]*)(?:\/[A-Za-z0-9][A-Za-z0-9._~-]*)*$/;
const declarationExtensionPattern = /\.d\.(?:ts|mts|cts)$/;

/** Resolves one declaration with TypeScript 6 through an explicitly supplied file host. */
export function resolveTypeScriptDeclaration(
  input: ResolveTypeScriptDeclarationInput,
): TypeScriptResolutionResult {
  if (input.signal?.aborted) return cancelledResolution();
  const normalized = normalizeInput(input);
  if (normalized === undefined) return invalidResolutionInput();

  const trace: TypeScriptResolutionTraceStep[] = [];
  const maxTraceSteps = loweredTraceLimit(input.limits?.maxResolverTraceSteps);
  const retain = (step: TypeScriptResolutionTraceStep): void => {
    if (input.signal?.aborted) throw new CancelledResolutionError();
    if (trace.length >= maxTraceSteps) throw new TraceLimitError();
    trace.push(Object.freeze(step));
  };

  try {
    retain({
      kind: "resolution-start",
      path: evidencePath(normalized.importer, normalized.currentDirectory),
      outcome: "start",
    });
    const host = createCompilerHost(input.host, normalized.currentDirectory, retain);
    const compilerOptions = createCompilerOptions(input.projectOptions, input.conditions);
    const resolution = ts.resolveModuleName(
      input.specifier,
      normalized.importer,
      compilerOptions,
      host,
      undefined,
      undefined,
      input.conditions.lookupKind === "import" ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS,
    );
    const selected = resolution.resolvedModule?.resolvedFileName;
    if (selected === undefined) return unresolvedDeclaration();

    const normalizedSelected = normalizeVirtualPath(selected, normalized.currentDirectory);
    if (normalizedSelected === undefined) return unsupportedRedirect();
    const target = packageRelativeTarget(normalized.packageRoot, normalizedSelected);
    if (target === undefined) return unsupportedRedirect();
    if (!declarationExtensionPattern.test(target)) return unresolvedDeclaration();
    if (!input.host.fileExists(normalizedSelected)) return missingSelectedDeclaration();

    retain({
      kind: "resolution-selected",
      path: evidencePath(normalizedSelected, normalized.currentDirectory),
      outcome: "selected",
    });
    const frozenTrace = Object.freeze([...trace]);
    return {
      ok: true,
      value: Object.freeze({
        target,
        compilerVersion: ts.version,
        tsconfigPath: input.tsconfigPath,
        moduleResolution: input.projectOptions.moduleResolution,
        lookupKind: input.conditions.lookupKind,
        conditions: Object.freeze([...input.conditions.conditions]),
        snapshotId: input.snapshotId,
        trace: frozenTrace,
        usage: Object.freeze({ resolverTraceSteps: frozenTrace.length }),
      }),
    };
  } catch (error) {
    if (error instanceof TraceLimitError) return traceLimitExceeded();
    if (error instanceof CancelledResolutionError) return cancelledResolution();
    return analysisFailed();
  }
}

interface NormalizedResolverInput {
  readonly importer: string;
  readonly packageRoot: string;
  readonly currentDirectory: string;
}

function normalizeInput(
  input: ResolveTypeScriptDeclarationInput,
): NormalizedResolverInput | undefined {
  if (
    input.snapshotId.length === 0 ||
    input.snapshotId.length > 256 ||
    input.specifier.length === 0 ||
    input.specifier.length > 512 ||
    !packageSpecifierPattern.test(input.specifier) ||
    (input.tsconfigPath !== null &&
      (input.tsconfigPath.length === 0 ||
        input.tsconfigPath.length > 4096 ||
        posix.isAbsolute(input.tsconfigPath) ||
        input.tsconfigPath.includes("\0") ||
        input.tsconfigPath.includes("\\") ||
        input.tsconfigPath.split("/").includes("..")))
  ) {
    return undefined;
  }
  const currentDirectory = normalizeAbsolutePath(input.host.currentDirectory);
  if (currentDirectory === undefined) return undefined;
  const importer = normalizeContainedPath(input.importer, currentDirectory);
  const packageRoot = normalizeContainedPath(input.packageRoot, currentDirectory);
  if (importer === undefined || packageRoot === undefined) return undefined;
  return { importer, packageRoot, currentDirectory };
}

function createCompilerOptions(
  options: TypeScriptProjectResolutionOptions,
  conditions: NormalizedTypeScriptConditions,
): ts.CompilerOptions {
  return {
    module: options.moduleResolution === "node16" ? ts.ModuleKind.Node16 : ts.ModuleKind.NodeNext,
    moduleResolution:
      options.moduleResolution === "node16"
        ? ts.ModuleResolutionKind.Node16
        : ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    allowJs: true,
    resolvePackageJsonExports: options.resolvePackageJsonExports ?? true,
    customConditions: [...conditions.customConditions],
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.paths === undefined
      ? {}
      : {
          paths: Object.fromEntries(
            Object.entries(options.paths).map(([pattern, targets]) => [pattern, [...targets]]),
          ),
        }),
    ...(options.moduleSuffixes === undefined
      ? {}
      : { moduleSuffixes: [...options.moduleSuffixes] }),
    ...(options.preserveSymlinks === undefined
      ? {}
      : { preserveSymlinks: options.preserveSymlinks }),
  };
}

function createCompilerHost(
  source: TypeScriptResolutionFileHost,
  currentDirectory: string,
  retain: (step: TypeScriptResolutionTraceStep) => void,
): ts.ModuleResolutionHost {
  const pathForHost = (path: string): string =>
    normalizeContainedPath(path, currentDirectory) ?? posix.join(currentDirectory, "__rejected__");
  return {
    useCaseSensitiveFileNames: true,
    getCurrentDirectory: () => currentDirectory,
    fileExists(path) {
      const normalized = pathForHost(path);
      const found = source.fileExists(normalized);
      retain({
        kind: "file-probe",
        path: evidencePath(normalized, currentDirectory),
        outcome: found ? "found" : "missing",
      });
      return found;
    },
    readFile(path) {
      const normalized = pathForHost(path);
      const contents = source.readFile(normalized);
      retain({
        kind: "file-read",
        path: evidencePath(normalized, currentDirectory),
        outcome: contents === undefined ? "missing" : "found",
      });
      return contents;
    },
    directoryExists(path) {
      const normalized = pathForHost(path);
      const found = source.directoryExists(normalized);
      retain({
        kind: "directory-probe",
        path: evidencePath(normalized, currentDirectory),
        outcome: found ? "found" : "missing",
      });
      return found;
    },
    getDirectories(path) {
      const normalized = pathForHost(path);
      const directories = [...source.getDirectories(normalized)];
      retain({
        kind: "directory-list",
        path: evidencePath(normalized, currentDirectory),
        outcome: directories.length === 0 ? "missing" : "found",
      });
      return directories;
    },
    realpath(path) {
      const normalized = pathForHost(path);
      const resolved = pathForHost(source.realpath(normalized));
      retain({
        kind: "realpath",
        path: evidencePath(resolved, currentDirectory),
        outcome: "found",
      });
      return resolved;
    },
  };
}

function normalizeAbsolutePath(path: string): string | undefined {
  if (!posix.isAbsolute(path) || path.includes("\0") || path.includes("\\")) return undefined;
  return posix.normalize(path);
}

function normalizeContainedPath(path: string, root: string): string | undefined {
  const normalized = normalizeVirtualPath(path, root);
  if (normalized === undefined) return undefined;
  const relative = posix.relative(root, normalized);
  return relative === ".." || relative.startsWith("../") ? undefined : normalized;
}

function normalizeVirtualPath(path: string, currentDirectory: string): string | undefined {
  if (path.length === 0 || path.length > 4096 || path.includes("\0") || path.includes("\\")) {
    return undefined;
  }
  return posix.normalize(posix.isAbsolute(path) ? path : posix.resolve(currentDirectory, path));
}

function packageRelativeTarget(packageRoot: string, selected: string): string | undefined {
  const relative = posix.relative(packageRoot, selected);
  if (
    relative.length === 0 ||
    relative === ".." ||
    relative.startsWith("../") ||
    posix.isAbsolute(relative)
  ) {
    return undefined;
  }
  return relative;
}

function evidencePath(path: string, currentDirectory: string): string {
  const relative = posix.relative(currentDirectory, path);
  return relative.length === 0 ? "." : relative;
}

function loweredTraceLimit(candidate: number | undefined): number {
  if (candidate === undefined || !Number.isSafeInteger(candidate) || candidate < 1) {
    return firstSliceResolverTraceSteps;
  }
  return Math.min(candidate, firstSliceResolverTraceSteps);
}

class TraceLimitError extends Error {}
class CancelledResolutionError extends Error {}

function invalidResolutionInput(): TypeScriptResolutionResult {
  return {
    ok: false,
    failure: {
      code: "invalid_request",
      message: "TypeScript resolution input is not valid bounded workspace context.",
    },
  };
}

function unresolvedDeclaration(): TypeScriptResolutionResult {
  return {
    ok: false,
    failure: {
      code: "resolution_failed",
      message: "TypeScript did not resolve a declaration for the selected package.",
    },
  };
}

function unsupportedRedirect(): TypeScriptResolutionResult {
  return {
    ok: false,
    failure: {
      code: "unsupported_context",
      message: "TypeScript resolved outside the selected package snapshot.",
    },
  };
}

function missingSelectedDeclaration(): TypeScriptResolutionResult {
  return {
    ok: false,
    failure: {
      code: "malformed_artifact",
      message: "TypeScript selected a declaration missing from the admitted snapshot.",
    },
  };
}

function traceLimitExceeded(): TypeScriptResolutionResult {
  return {
    ok: false,
    failure: {
      code: "resource_limit_exceeded",
      message: "TypeScript resolution exceeded its configured trace budget.",
      limit: "maxResolverTraceSteps",
    },
  };
}

function cancelledResolution(): TypeScriptResolutionResult {
  return {
    ok: false,
    failure: {
      code: "cancelled",
      message: "TypeScript declaration resolution was cancelled.",
    },
  };
}

function analysisFailed(): TypeScriptResolutionResult {
  return {
    ok: false,
    failure: {
      code: "analysis_failed",
      message: "TypeScript declaration resolution could not complete safely.",
    },
  };
}
