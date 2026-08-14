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
}

export type ManifestFailure =
  | BoundedReadFailure
  | {
      readonly code: "malformed_artifact";
      readonly message: "Package manifest is not valid first-slice metadata.";
    };

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
  });
  if (!read.ok) return read;

  const manifest = normalizeManifest(read.value.bytes);
  if (manifest === undefined) return malformedManifest();

  return {
    ok: true,
    value: {
      manifest,
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

function normalizeManifest(bytes: Uint8Array): NormalizedPackageManifest | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;

  const name = requiredIdentifier(parsed.name);
  const version = requiredIdentifier(parsed.version);
  const type = packageType(parsed.type);
  if (name === undefined || version === undefined || type === undefined) return undefined;

  const main = optionalString(parsed.main);
  const module = optionalString(parsed.module);
  const types = optionalString(parsed.types);
  const typings = optionalString(parsed.typings);
  if (main === INVALID || module === INVALID || types === INVALID || typings === INVALID) {
    return undefined;
  }

  const exports = normalizeOptionalValue(parsed.exports);
  const typesVersions = normalizeOptionalValue(parsed.typesVersions);
  if (exports === INVALID || typesVersions === INVALID) return undefined;

  return Object.freeze({
    name,
    version,
    type,
    ...(main === undefined ? {} : { main }),
    ...(module === undefined ? {} : { module }),
    ...(types === undefined ? {} : { types }),
    ...(typings === undefined ? {} : { typings }),
    ...(exports === undefined ? {} : { exports }),
    ...(typesVersions === undefined ? {} : { typesVersions }),
  });
}

const INVALID = Symbol("invalid manifest value");

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
): NormalizedManifestValue | undefined | typeof INVALID {
  if (value === undefined) return undefined;
  return normalizeValue(value);
}

function normalizeValue(value: unknown): NormalizedManifestValue | typeof INVALID {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const normalized = value.map(normalizeValue);
    if (normalized.includes(INVALID)) return INVALID;
    return Object.freeze(normalized) as readonly NormalizedManifestValue[];
  }
  if (!isRecord(value)) return INVALID;

  const entries: [string, NormalizedManifestValue][] = [];
  for (const key of Object.keys(value).sort()) {
    const normalized = normalizeValue(value[key]);
    if (normalized === INVALID) return INVALID;
    entries.push([key, normalized]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function malformedManifest(): Extract<PackageManifestResult, { readonly ok: false }> {
  return {
    ok: false,
    failure: {
      code: "malformed_artifact",
      message: "Package manifest is not valid first-slice metadata.",
    },
  };
}
