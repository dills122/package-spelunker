export interface PathPolicyLimits {
  readonly maxRelativePathBytes: number;
  readonly maxPathSegments: number;
  readonly maxSymlinkHops: number;
}

export const firstSliceV1PathPolicyLimits: PathPolicyLimits = Object.freeze({
  maxRelativePathBytes: 1_024,
  maxPathSegments: 64,
  maxSymlinkHops: 16,
});

export interface ResolveContainedPathInput {
  readonly path: string;
  readonly approvedRoots: readonly string[];
  readonly artifactRoot?: string;
  /** Test and internal-policy hook. Values may lower, but never raise, first-slice safeguards. */
  readonly limits?: Partial<PathPolicyLimits>;
  readonly signal?: AbortSignal;
}

export interface PathResolution {
  readonly canonicalPath: string;
  readonly approvedRoot: string;
  readonly relativePath: string;
  readonly artifactRelativePath?: string;
  readonly symlinkHops: number;
}

export type PathPolicyFailure =
  | {
      readonly code: "outside_approved_root";
      readonly message: "Selected path is outside the approved filesystem roots.";
    }
  | {
      readonly code: "malformed_artifact";
      readonly message: "Selected path could not be canonicalized safely.";
    }
  | {
      readonly code: "resource_limit_exceeded";
      readonly message: "Selected path exceeds the configured filesystem policy.";
      readonly limit: keyof PathPolicyLimits;
    }
  | {
      readonly code: "cancelled";
      readonly message: "Filesystem policy evaluation was cancelled.";
    };

export type PathResolutionResult =
  | { readonly ok: true; readonly value: PathResolution }
  | { readonly ok: false; readonly failure: PathPolicyFailure };

type PathResolutionFailureResult = Extract<PathResolutionResult, { readonly ok: false }>;

/** Resolves one selected path without permitting traversal beyond its approved/artifact roots. */
export async function resolveContainedPath(
  input: ResolveContainedPathInput,
): Promise<PathResolutionResult> {
  if (input.signal?.aborted) return cancelledPathPolicy();
  const limits = effectivePathPolicyLimits(input.limits);
  const roots = await canonicalizeRoots(input.approvedRoots, input.signal);
  if (!roots.ok) return roots;

  const artifact =
    input.artifactRoot === undefined
      ? undefined
      : await canonicalizePath(input.artifactRoot, roots.value, limits, input.signal);
  if (artifact !== undefined && !artifact.ok) return artifact;

  const selected = await canonicalizePath(input.path, roots.value, limits, input.signal);
  if (!selected.ok) return selected;

  let artifactRelativePath: string | undefined;
  if (artifact?.ok) {
    if (!isContained(artifact.value.canonicalPath, selected.value.canonicalPath)) {
      return outsideApprovedRoot();
    }
    artifactRelativePath = normalizedRelative(
      artifact.value.canonicalPath,
      selected.value.canonicalPath,
    );
    const limitFailure = checkRelativePathLimits(artifactRelativePath, limits);
    if (limitFailure !== undefined) return limitFailure;
  }

  return {
    ok: true,
    value: {
      ...selected.value,
      ...(artifactRelativePath === undefined ? {} : { artifactRelativePath }),
    },
  };
}

function effectivePathPolicyLimits(
  overrides: Partial<PathPolicyLimits> | undefined,
): PathPolicyLimits {
  return {
    maxRelativePathBytes: loweredLimit(
      overrides?.maxRelativePathBytes,
      firstSliceV1PathPolicyLimits.maxRelativePathBytes,
    ),
    maxPathSegments: loweredLimit(
      overrides?.maxPathSegments,
      firstSliceV1PathPolicyLimits.maxPathSegments,
    ),
    maxSymlinkHops: loweredLimit(
      overrides?.maxSymlinkHops,
      firstSliceV1PathPolicyLimits.maxSymlinkHops,
    ),
  };
}

function loweredLimit(candidate: number | undefined, policyDefault: number): number {
  if (candidate === undefined || !Number.isSafeInteger(candidate) || candidate < 1) {
    return policyDefault;
  }
  return Math.min(candidate, policyDefault);
}

interface CanonicalRoot {
  readonly inputRoot: string;
  readonly canonicalRoot: string;
  readonly device: number;
  readonly inode: number;
}

type CanonicalRootsResult =
  | { readonly ok: true; readonly value: readonly CanonicalRoot[] }
  | { readonly ok: false; readonly failure: PathPolicyFailure };

async function canonicalizeRoots(
  approvedRoots: readonly string[],
  signal: AbortSignal | undefined,
): Promise<CanonicalRootsResult> {
  if (signal?.aborted) return cancelledPathPolicy();
  if (approvedRoots.length === 0) return outsideApprovedRoot();

  try {
    const roots = await Promise.all(
      approvedRoots.map(async (root) => {
        const canonicalRoot = await realpath(root);
        const metadata = await lstat(canonicalRoot);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
          throw new Error("Approved root is not a directory.");
        }
        return {
          inputRoot: resolve(root),
          canonicalRoot,
          device: metadata.dev,
          inode: metadata.ino,
        };
      }),
    );
    if (signal?.aborted) return cancelledPathPolicy();
    roots.sort((left, right) => right.inputRoot.length - left.inputRoot.length);
    return { ok: true, value: roots };
  } catch {
    return malformedArtifact();
  }
}

async function canonicalizePath(
  path: string,
  roots: readonly CanonicalRoot[],
  limits: PathPolicyLimits,
  signal: AbortSignal | undefined,
): Promise<PathResolutionResult> {
  if (signal?.aborted) return cancelledPathPolicy();
  const initial = mapInputPathToCanonicalRoot(path, roots);
  if (initial === undefined) return outsideApprovedRoot();
  if (!(await rootRemainsStable(initial.root))) return malformedArtifact();

  const initialRelativePath = normalizedRelative(initial.root.canonicalRoot, initial.path);
  const initialLimitFailure = checkRelativePathLimits(initialRelativePath, limits);
  if (initialLimitFailure !== undefined) return initialLimitFailure;

  let currentRoot = initial.root;
  let current = currentRoot.canonicalRoot;
  let pending = pathSegments(initialRelativePath);
  let symlinkHops = 0;
  const visitedLinks = new Set<string>();

  while (pending.length > 0) {
    if (signal?.aborted) return cancelledPathPolicy();
    if (!(await rootRemainsStable(currentRoot))) return malformedArtifact();
    const [segment, ...remaining] = pending;
    if (segment === undefined) break;
    const candidate = resolve(current, segment);
    const containingRoot = findCanonicalRoot(candidate, roots);
    if (containingRoot === undefined) return outsideApprovedRoot();

    const relativePath = normalizedRelative(containingRoot.canonicalRoot, candidate);
    const limitFailure = checkRelativePathLimits(relativePath, limits);
    if (limitFailure !== undefined) return limitFailure;

    let metadata: Awaited<ReturnType<typeof lstat>>;
    try {
      metadata = await lstat(candidate);
    } catch {
      return malformedArtifact();
    }

    if (!metadata.isSymbolicLink()) {
      currentRoot = containingRoot;
      current = candidate;
      pending = remaining;
      continue;
    }

    symlinkHops += 1;
    if (symlinkHops > limits.maxSymlinkHops) {
      return resourceLimitExceeded("maxSymlinkHops");
    }
    if (visitedLinks.has(candidate)) return malformedArtifact();
    visitedLinks.add(candidate);

    let target: string;
    try {
      target = await readlink(candidate);
    } catch {
      return malformedArtifact();
    }

    const targetPath = isAbsolute(target) ? resolve(target) : resolve(dirname(candidate), target);
    const targetRoot = findCanonicalRoot(targetPath, roots);
    if (targetRoot === undefined) return outsideApprovedRoot();

    const targetRelativePath = normalizedRelative(targetRoot.canonicalRoot, targetPath);
    const targetLimitFailure = checkRelativePathLimits(targetRelativePath, limits);
    if (targetLimitFailure !== undefined) return targetLimitFailure;

    currentRoot = targetRoot;
    current = targetRoot.canonicalRoot;
    pending = [...pathSegments(targetRelativePath), ...remaining];
  }

  return {
    ok: true,
    value: {
      canonicalPath: current,
      approvedRoot: currentRoot.canonicalRoot,
      relativePath: normalizedRelative(currentRoot.canonicalRoot, current),
      symlinkHops,
    },
  };
}

async function rootRemainsStable(root: CanonicalRoot): Promise<boolean> {
  try {
    const metadata = await lstat(root.canonicalRoot);
    return (
      metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      metadata.dev === root.device &&
      metadata.ino === root.inode
    );
  } catch {
    return false;
  }
}

function mapInputPathToCanonicalRoot(
  path: string,
  roots: readonly CanonicalRoot[],
): { readonly root: CanonicalRoot; readonly path: string } | undefined {
  const absolutePath = resolve(path);
  for (const root of roots) {
    if (isContained(root.inputRoot, absolutePath)) {
      return {
        root,
        path: resolve(root.canonicalRoot, relative(root.inputRoot, absolutePath)),
      };
    }
    if (isContained(root.canonicalRoot, absolutePath)) return { root, path: absolutePath };
  }
  return undefined;
}

function findCanonicalRoot(
  path: string,
  roots: readonly CanonicalRoot[],
): CanonicalRoot | undefined {
  return roots
    .filter((root) => isContained(root.canonicalRoot, path))
    .sort((left, right) => right.canonicalRoot.length - left.canonicalRoot.length)[0];
}

function isContained(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference === "" ||
    (!difference.startsWith(`..${sep}`) && difference !== ".." && !isAbsolute(difference))
  );
}

function normalizedRelative(root: string, candidate: string): string {
  return relative(root, candidate).split(sep).join("/");
}

function pathSegments(path: string): string[] {
  return path === "" ? [] : path.split("/");
}

function checkRelativePathLimits(
  path: string,
  limits: PathPolicyLimits,
): PathResolutionResult | undefined {
  if (Buffer.byteLength(path) > limits.maxRelativePathBytes) {
    return resourceLimitExceeded("maxRelativePathBytes");
  }
  if (pathSegments(path).length > limits.maxPathSegments) {
    return resourceLimitExceeded("maxPathSegments");
  }
  return undefined;
}

function outsideApprovedRoot(): PathResolutionFailureResult {
  return {
    ok: false,
    failure: {
      code: "outside_approved_root",
      message: "Selected path is outside the approved filesystem roots.",
    },
  };
}

function malformedArtifact(): PathResolutionFailureResult {
  return {
    ok: false,
    failure: {
      code: "malformed_artifact",
      message: "Selected path could not be canonicalized safely.",
    },
  };
}

function resourceLimitExceeded(limit: keyof PathPolicyLimits): PathResolutionFailureResult {
  return {
    ok: false,
    failure: {
      code: "resource_limit_exceeded",
      message: "Selected path exceeds the configured filesystem policy.",
      limit,
    },
  };
}

function cancelledPathPolicy(): PathResolutionFailureResult {
  return {
    ok: false,
    failure: {
      code: "cancelled",
      message: "Filesystem policy evaluation was cancelled.",
    },
  };
}

import { lstat, readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
