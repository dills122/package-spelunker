import { join } from "node:path";
import type { BoundedReadFailure } from "./bounded-reader.js";
import { readContainedFile } from "./bounded-reader.js";
import type { PathPolicyLimits, PathResolution } from "./path-policy.js";

export type NormalizedManifestValue =
  | null
  | boolean
  | number
  | string
  | readonly NormalizedManifestValue[]
  | NormalizedManifestObject;

export interface NormalizedManifestObject {
  readonly [key: string]: NormalizedManifestValue;
}

export interface NormalizedPackageManifest {
  readonly name: string;
  readonly version: string;
  readonly type: "module" | "commonjs";
  readonly main?: string;
  readonly module?: string;
  readonly types?: string;
  readonly typings?: string;
  readonly exports?: NormalizedManifestValue;
  readonly typesVersions?: NormalizedManifestValue;
}

export interface ReadPackageManifestInput {
  readonly packageRoot: string;
  readonly approvedRoots: readonly string[];
  readonly maxManifestBytes?: number;
  readonly pathLimits?: Partial<PathPolicyLimits>;
  readonly signal?: AbortSignal;
}

export interface ManifestNormalizationLimits {
  readonly maxExportMapNodes: number;
  readonly maxGraphDepth: number;
}

export type ManifestNormalizationFailure =
  | {
      readonly code: "malformed_artifact";
      readonly message: "Package manifest is not valid first-slice metadata.";
    }
  | {
      readonly code: "resource_limit_exceeded";
      readonly message: "Package manifest metadata exceeds the configured traversal policy.";
      readonly limit: keyof ManifestNormalizationLimits;
    };

export type ManifestFailure = BoundedReadFailure | ManifestNormalizationFailure;

export interface PackageManifestRecord {
  readonly manifest: NormalizedPackageManifest;
  readonly byteLength: number;
  readonly path: PathResolution;
  readonly evidence: {
    readonly kind: "file";
    readonly path: "package.json";
    readonly description: "Normalized package identity and resolution metadata.";
  };
}

export type PackageManifestResult =
  | { readonly ok: true; readonly value: PackageManifestRecord }
  | { readonly ok: false; readonly failure: ManifestFailure };

export type PackageManifestNormalizationResult =
  | { readonly ok: true; readonly value: NormalizedPackageManifest }
  | { readonly ok: false; readonly failure: ManifestNormalizationFailure };

/** Reads and normalizes the root package manifest while preserving safe source evidence. */
export async function readPackageManifest(
  input: ReadPackageManifestInput,
): Promise<PackageManifestResult> {
  const read = await readContainedFile({
    path: join(input.packageRoot, "package.json"),
    approvedRoots: input.approvedRoots,
    artifactRoot: input.packageRoot,
    maxBytes: input.maxManifestBytes ?? 1_048_576,
    limit: "maxManifestBytes",
    ...(input.pathLimits === undefined ? {} : { pathLimits: input.pathLimits }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  if (!read.ok) return read;

  const normalized = normalizePackageManifest(read.value.bytes);
  if (!normalized.ok) return normalized;

  return {
    ok: true,
    value: {
      manifest: normalized.value,
      byteLength: read.value.byteLength,
      path: read.value.path,
      evidence: {
        kind: "file",
        path: "package.json",
        description: "Normalized package identity and resolution metadata.",
      },
    },
  };
}

/** Converts bounded UTF-8 JSON bytes into frozen first-slice package metadata. */
export function normalizePackageManifest(
  bytes: Uint8Array,
  limits?: Partial<ManifestNormalizationLimits>,
): PackageManifestNormalizationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return malformedManifest();
  }
  if (!isRecord(parsed)) return malformedManifest();

  const name = requiredIdentifier(parsed.name);
  const version = requiredIdentifier(parsed.version);
  const type = packageType(parsed.type);
  if (name === undefined || version === undefined || type === undefined) return malformedManifest();

  const main = optionalString(parsed.main);
  const module = optionalString(parsed.module);
  const types = optionalString(parsed.types);
  const typings = optionalString(parsed.typings);
  if (main === INVALID || module === INVALID || types === INVALID || typings === INVALID) {
    return malformedManifest();
  }

  const effectiveLimits = effectiveNormalizationLimits(limits);
  const exports = normalizeOptionalValue(parsed.exports, effectiveLimits);
  const typesVersions = normalizeOptionalValue(parsed.typesVersions, effectiveLimits);
  if (exports === MAX_NODES || typesVersions === MAX_NODES) {
    return normalizationLimitExceeded("maxExportMapNodes");
  }
  if (exports === MAX_DEPTH || typesVersions === MAX_DEPTH) {
    return normalizationLimitExceeded("maxGraphDepth");
  }
  if (exports === INVALID || typesVersions === INVALID) return malformedManifest();

  return {
    ok: true,
    value: Object.freeze({
      name,
      version,
      type,
      ...(main === undefined ? {} : { main }),
      ...(module === undefined ? {} : { module }),
      ...(types === undefined ? {} : { types }),
      ...(typings === undefined ? {} : { typings }),
      ...(exports === undefined ? {} : { exports }),
      ...(typesVersions === undefined ? {} : { typesVersions }),
    }),
  };
}

const INVALID = Symbol("invalid manifest value");
const MAX_NODES = Symbol("maximum manifest metadata nodes exceeded");
const MAX_DEPTH = Symbol("maximum manifest metadata depth exceeded");

const firstSliceV1NormalizationLimits: ManifestNormalizationLimits = Object.freeze({
  maxExportMapNodes: 4_096,
  maxGraphDepth: 128,
});

type NormalizationSentinel = typeof INVALID | typeof MAX_NODES | typeof MAX_DEPTH;

interface NormalizationState {
  readonly limits: ManifestNormalizationLimits;
  nodes: number;
}

function requiredIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "" || Buffer.byteLength(value) > 256) {
    return undefined;
  }
  return value;
}

function packageType(value: unknown): "module" | "commonjs" | undefined {
  if (value === undefined || value === "commonjs") return "commonjs";
  if (value === "module") return "module";
  return undefined;
}

function optionalString(value: unknown): string | undefined | typeof INVALID {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value === "" || Buffer.byteLength(value) > 4_096) return INVALID;
  return value;
}

function normalizeOptionalValue(
  value: unknown,
  limits: ManifestNormalizationLimits,
): NormalizedManifestValue | undefined | NormalizationSentinel {
  if (value === undefined) return undefined;
  return normalizeValue(value, { limits, nodes: 0 }, 0);
}

function normalizeValue(
  value: unknown,
  state: NormalizationState,
  depth: number,
): NormalizedManifestValue | NormalizationSentinel {
  if (depth > state.limits.maxGraphDepth) return MAX_DEPTH;
  state.nodes += 1;
  if (state.nodes > state.limits.maxExportMapNodes) return MAX_NODES;
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const normalized: NormalizedManifestValue[] = [];
    for (const entry of value) {
      const normalizedEntry = normalizeValue(entry, state, depth + 1);
      if (isNormalizationSentinel(normalizedEntry)) return normalizedEntry;
      normalized.push(normalizedEntry);
    }
    return Object.freeze(normalized);
  }
  if (!isRecord(value)) return INVALID;

  const entries: [string, NormalizedManifestValue][] = [];
  for (const key of Object.keys(value).sort()) {
    const normalized = normalizeValue(value[key], state, depth + 1);
    if (isNormalizationSentinel(normalized)) return normalized;
    entries.push([key, normalized]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

function effectiveNormalizationLimits(
  overrides: Partial<ManifestNormalizationLimits> | undefined,
): ManifestNormalizationLimits {
  return {
    maxExportMapNodes: loweredLimit(
      overrides?.maxExportMapNodes,
      firstSliceV1NormalizationLimits.maxExportMapNodes,
    ),
    maxGraphDepth: loweredLimit(
      overrides?.maxGraphDepth,
      firstSliceV1NormalizationLimits.maxGraphDepth,
    ),
  };
}

function loweredLimit(candidate: number | undefined, policyDefault: number): number {
  if (candidate === undefined || !Number.isSafeInteger(candidate) || candidate < 1) {
    return policyDefault;
  }
  return Math.min(candidate, policyDefault);
}

function isNormalizationSentinel(value: unknown): value is NormalizationSentinel {
  return value === INVALID || value === MAX_NODES || value === MAX_DEPTH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function malformedManifest(): Extract<PackageManifestNormalizationResult, { readonly ok: false }> {
  return {
    ok: false,
    failure: {
      code: "malformed_artifact",
      message: "Package manifest is not valid first-slice metadata.",
    },
  };
}

function normalizationLimitExceeded(
  limit: keyof ManifestNormalizationLimits,
): Extract<PackageManifestNormalizationResult, { readonly ok: false }> {
  return {
    ok: false,
    failure: {
      code: "resource_limit_exceeded",
      message: "Package manifest metadata exceeds the configured traversal policy.",
      limit,
    },
  };
}
