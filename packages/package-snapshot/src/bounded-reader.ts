import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import type { PathPolicyFailure, PathPolicyLimits, PathResolution } from "./path-policy.js";
import { resolveContainedPath } from "./path-policy.js";

export type FileByteLimitName = "maxManifestBytes" | "maxArtifactFileBytes";

export interface ReadContainedFileInput {
  readonly path: string;
  readonly approvedRoots: readonly string[];
  readonly artifactRoot?: string;
  readonly maxBytes: number;
  readonly limit: FileByteLimitName;
  readonly pathLimits?: Partial<PathPolicyLimits>;
  readonly signal?: AbortSignal;
}

export type BoundedReadFailure =
  | PathPolicyFailure
  | {
      readonly code: "malformed_artifact";
      readonly message: "Selected artifact entry is not a readable regular file.";
    }
  | {
      readonly code: "resource_limit_exceeded";
      readonly message: "Selected artifact file exceeds the configured byte limit.";
      readonly limit: FileByteLimitName;
    };

export interface BoundedFile {
  readonly bytes: Uint8Array;
  readonly byteLength: number;
  readonly path: PathResolution;
}

export type BoundedReadResult =
  | { readonly ok: true; readonly value: BoundedFile }
  | { readonly ok: false; readonly failure: BoundedReadFailure };

export async function readContainedFile(input: ReadContainedFileInput): Promise<BoundedReadResult> {
  const maxBytes = effectiveFileLimit(input.maxBytes, input.limit);
  const resolution = await resolveContainedPath({
    path: input.path,
    approvedRoots: input.approvedRoots,
    ...(input.artifactRoot === undefined ? {} : { artifactRoot: input.artifactRoot }),
    ...(input.pathLimits === undefined ? {} : { limits: input.pathLimits }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  if (!resolution.ok) return resolution;
  if (input.signal?.aborted) return cancelledRead();

  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(resolution.value.canonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const [descriptorMetadata, pathMetadata] = await Promise.all([
      handle.stat(),
      lstat(resolution.value.canonicalPath),
    ]);
    if (
      !descriptorMetadata.isFile() ||
      pathMetadata.isSymbolicLink() ||
      descriptorMetadata.dev !== pathMetadata.dev ||
      descriptorMetadata.ino !== pathMetadata.ino
    ) {
      return unreadableRegularFile();
    }
    if (descriptorMetadata.size > maxBytes) return fileByteLimitExceeded(input.limit);

    const chunks: Buffer[] = [];
    let byteLength = 0;
    while (byteLength <= maxBytes) {
      if (input.signal?.aborted) return cancelledRead();
      const remaining = maxBytes + 1 - byteLength;
      if (remaining === 0) break;
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1_024, remaining));
      const read = await handle.read(buffer, 0, buffer.byteLength, null);
      if (read.bytesRead === 0) break;
      chunks.push(buffer.subarray(0, read.bytesRead));
      byteLength += read.bytesRead;
    }

    if (byteLength > maxBytes) return fileByteLimitExceeded(input.limit);
    return {
      ok: true,
      value: {
        bytes: Buffer.concat(chunks, byteLength),
        byteLength,
        path: resolution.value,
      },
    };
  } catch {
    return unreadableRegularFile();
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

const firstSliceV1FileDefaults: Readonly<Record<FileByteLimitName, number>> = Object.freeze({
  maxManifestBytes: 1_048_576,
  maxArtifactFileBytes: 8_388_608,
});

function effectiveFileLimit(candidate: number, limit: FileByteLimitName): number {
  const policyDefault = firstSliceV1FileDefaults[limit];
  if (!Number.isSafeInteger(candidate) || candidate < 1) return policyDefault;
  return Math.min(candidate, policyDefault);
}

function unreadableRegularFile(): Extract<BoundedReadResult, { readonly ok: false }> {
  return {
    ok: false,
    failure: {
      code: "malformed_artifact",
      message: "Selected artifact entry is not a readable regular file.",
    },
  };
}

function fileByteLimitExceeded(
  limit: FileByteLimitName,
): Extract<BoundedReadResult, { readonly ok: false }> {
  return {
    ok: false,
    failure: {
      code: "resource_limit_exceeded",
      message: "Selected artifact file exceeds the configured byte limit.",
      limit,
    },
  };
}

function cancelledRead(): Extract<BoundedReadResult, { readonly ok: false }> {
  return {
    ok: false,
    failure: {
      code: "cancelled",
      message: "Filesystem policy evaluation was cancelled.",
    },
  };
}
