import { posix } from "node:path";

import ts from "@typescript/typescript6";

import type {
  SupportedTypeScriptModuleResolution,
  TypeScriptProjectResolutionOptions,
  TypeScriptResolutionFileHost,
} from "./resolver.js";

export interface ParseTypeScriptProjectConfigInput {
  readonly tsconfigPath: string | null;
  readonly host: TypeScriptResolutionFileHost;
}

export interface ParsedTypeScriptProjectConfig {
  readonly tsconfigPath: string | null;
  readonly projectOptions: TypeScriptProjectResolutionOptions;
  readonly customConditions: readonly string[];
}

export type TypeScriptProjectConfigFailure =
  | {
      readonly code: "unsupported_context";
      readonly message: "TypeScript project module resolution is outside first-slice support.";
    }
  | {
      readonly code: "malformed_artifact";
      readonly message: "TypeScript project configuration is not valid bounded metadata.";
    };

export type TypeScriptProjectConfigResult =
  | { readonly ok: true; readonly value: ParsedTypeScriptProjectConfig }
  | { readonly ok: false; readonly failure: TypeScriptProjectConfigFailure };

const maximumCustomConditions = 64;
const maximumConditionLength = 256;
const ignoredNoInputDiagnosticCodes = new Set([18002, 18003]);

/** Parses a project configuration without granting TypeScript ambient filesystem access. */
export function parseTypeScriptProjectConfig(
  input: ParseTypeScriptProjectConfigInput,
): TypeScriptProjectConfigResult {
  if (input.tsconfigPath === null) return inferredProjectConfig();

  const currentDirectory = normalizeAbsolute(input.host.currentDirectory);
  const configPath = normalizeContained(input.tsconfigPath, currentDirectory);
  if (currentDirectory === undefined || configPath === undefined) return malformedProjectConfig();

  let unrecoverable = false;
  const parseHost: ts.ParseConfigFileHost = {
    useCaseSensitiveFileNames: true,
    getCurrentDirectory: () => currentDirectory,
    fileExists: (path) => containedCall(path, currentDirectory, input.host.fileExists, false),
    readFile: (path) => containedCall(path, currentDirectory, input.host.readFile, undefined),
    readDirectory: () => [],
    directoryExists: (path) =>
      containedCall(path, currentDirectory, input.host.directoryExists, false),
    getDirectories: (path) =>
      containedCall(path, currentDirectory, input.host.getDirectories, []).filter(
        (directory) => normalizeContained(directory, currentDirectory) !== undefined,
      ),
    realpath: (path) => {
      const normalized = normalizeContained(path, currentDirectory);
      if (normalized === undefined) return path;
      return normalizeContained(input.host.realpath(normalized), currentDirectory) ?? normalized;
    },
    onUnRecoverableConfigFileDiagnostic: () => {
      unrecoverable = true;
    },
  };

  try {
    const configFile = ts.readConfigFile(configPath, parseHost.readFile);
    if (configFile.error !== undefined) return malformedProjectConfig();
    const parsed = ts.getParsedCommandLineOfConfigFile(
      configPath,
      defaultCompilerOptions(),
      parseHost,
    );
    if (unrecoverable || parsed === undefined) return malformedProjectConfig();
    if (
      parsed.errors.some(
        (diagnostic) =>
          diagnostic.category === ts.DiagnosticCategory.Error &&
          !ignoredNoInputDiagnosticCodes.has(diagnostic.code),
      )
    ) {
      return malformedProjectConfig();
    }

    const moduleResolution = supportedModuleResolution(
      parsed.options.moduleResolution,
      parsed.options.module,
    );
    if (moduleResolution === undefined) return unsupportedProjectConfig();
    const customConditions = normalizeCustomConditions(parsed.options.customConditions);
    if (customConditions === undefined) return malformedProjectConfig();
    const projectOptions = projectResolutionOptions(parsed.options, moduleResolution);
    if (projectOptions === undefined) return malformedProjectConfig();

    return {
      ok: true,
      value: Object.freeze({
        tsconfigPath: posix.relative(currentDirectory, configPath),
        projectOptions,
        customConditions,
      }),
    };
  } catch {
    return malformedProjectConfig();
  }
}

function defaultCompilerOptions(): ts.CompilerOptions {
  return {
    allowJs: true,
    noEmit: true,
  };
}

function projectResolutionOptions(
  options: ts.CompilerOptions,
  moduleResolution: SupportedTypeScriptModuleResolution,
): TypeScriptProjectResolutionOptions | undefined {
  const baseUrl = optionalContainedPath(options.baseUrl);
  if (options.baseUrl !== undefined && baseUrl === undefined) return undefined;
  const paths = normalizePaths(options.paths);
  if (options.paths !== undefined && paths === undefined) return undefined;
  const moduleSuffixes = normalizeStringList(options.moduleSuffixes);
  if (options.moduleSuffixes !== undefined && moduleSuffixes === undefined) return undefined;

  return Object.freeze({
    moduleResolution,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(paths === undefined ? {} : { paths }),
    ...(moduleSuffixes === undefined ? {} : { moduleSuffixes }),
    resolvePackageJsonExports: options.resolvePackageJsonExports ?? true,
    ...(options.preserveSymlinks === undefined
      ? {}
      : { preserveSymlinks: options.preserveSymlinks }),
  });
}

function supportedModuleResolution(
  resolution: ts.ModuleResolutionKind | undefined,
  module: ts.ModuleKind | undefined,
): SupportedTypeScriptModuleResolution | undefined {
  if (resolution === ts.ModuleResolutionKind.Node16) return "node16";
  if (resolution === ts.ModuleResolutionKind.NodeNext) return "nodenext";
  if (resolution !== undefined) return undefined;
  if (module === ts.ModuleKind.Node16) return "node16";
  if (module === ts.ModuleKind.NodeNext || module === undefined) return "nodenext";
  return undefined;
}

function normalizeCustomConditions(
  conditions: readonly string[] | undefined,
): readonly string[] | undefined {
  if (conditions === undefined) return Object.freeze([]);
  if (conditions.length > maximumCustomConditions) return undefined;
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const condition of conditions) {
    if (
      condition.length === 0 ||
      condition.length > maximumConditionLength ||
      condition.includes("\0")
    ) {
      return undefined;
    }
    if (!seen.has(condition)) {
      seen.add(condition);
      normalized.push(condition);
    }
  }
  return Object.freeze(normalized);
}

function normalizePaths(
  paths: ts.MapLike<string[]> | undefined,
): Readonly<Record<string, readonly string[]>> | undefined {
  if (paths === undefined) return undefined;
  const normalized: Record<string, readonly string[]> = {};
  for (const [key, values] of Object.entries(paths)) {
    if (key.length === 0 || !Array.isArray(values)) return undefined;
    const entries = normalizeStringList(values);
    if (entries === undefined) return undefined;
    normalized[key] = entries;
  }
  return Object.freeze(normalized);
}

function normalizeStringList(values: readonly string[] | undefined): readonly string[] | undefined {
  if (values === undefined) return undefined;
  if (values.length > maximumCustomConditions) return undefined;
  const normalized: string[] = [];
  for (const value of values) {
    if (
      typeof value !== "string" ||
      value.length > maximumConditionLength ||
      value.includes("\0")
    ) {
      return undefined;
    }
    normalized.push(value);
  }
  return Object.freeze(normalized);
}

function optionalContainedPath(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  return normalizeContained(path, "/workspace");
}

function normalizeAbsolute(path: string): string | undefined {
  if (!posix.isAbsolute(path) || path.includes("\0")) return undefined;
  return posix.normalize(path);
}

function normalizeContained(
  path: string,
  currentDirectory: string | undefined,
): string | undefined {
  if (currentDirectory === undefined || path.includes("\0")) return undefined;
  const absolute = posix.isAbsolute(path)
    ? posix.normalize(path)
    : posix.resolve(currentDirectory, path);
  const relative = posix.relative(currentDirectory, absolute);
  if (relative === "" || (!relative.startsWith("../") && relative !== "..")) return absolute;
  return undefined;
}

function containedCall<T>(
  path: string,
  currentDirectory: string,
  operation: (path: string) => T,
  fallback: T,
): T {
  const normalized = normalizeContained(path, currentDirectory);
  return normalized === undefined ? fallback : operation(normalized);
}

function inferredProjectConfig(): TypeScriptProjectConfigResult {
  return {
    ok: true,
    value: Object.freeze({
      tsconfigPath: null,
      projectOptions: Object.freeze({
        moduleResolution: "nodenext" as const,
        resolvePackageJsonExports: true,
      }),
      customConditions: Object.freeze([]),
    }),
  };
}

function unsupportedProjectConfig(): TypeScriptProjectConfigResult {
  return {
    ok: false,
    failure: Object.freeze({
      code: "unsupported_context" as const,
      message: "TypeScript project module resolution is outside first-slice support." as const,
    }),
  };
}

function malformedProjectConfig(): TypeScriptProjectConfigResult {
  return {
    ok: false,
    failure: Object.freeze({
      code: "malformed_artifact" as const,
      message: "TypeScript project configuration is not valid bounded metadata." as const,
    }),
  };
}
