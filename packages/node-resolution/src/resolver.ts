import type { PackageSnapshot } from "@package-spelunker/package-snapshot";

import { normalizeRuntimeConditions, type RuntimeLookupKind } from "./conditions.js";

export interface RuntimeResolutionLimits {
  readonly maxExportMapNodes: number;
  readonly maxGraphDepth: number;
  readonly maxResolverTraceSteps: number;
}

export interface ResolveNodeRuntimeInput {
  readonly snapshot: PackageSnapshot;
  readonly packageSubpath: string;
  readonly lookupKind: RuntimeLookupKind;
  readonly conditions: readonly string[];
  readonly limits?: Partial<RuntimeResolutionLimits>;
  readonly signal?: AbortSignal;
}

export type RuntimeResolutionTraceStep =
  | {
      readonly kind: "request";
      readonly packageSubpath: string;
      readonly lookupKind: RuntimeLookupKind;
    }
  | {
      readonly kind: "subpath";
      readonly key: string;
      readonly outcome: "matched" | "unexported";
    }
  | {
      readonly kind: "condition";
      readonly condition: string;
      readonly outcome: "matched" | "skipped";
    }
  | {
      readonly kind: "target";
      readonly target: string;
      readonly outcome: "selected" | "missing" | "rejected" | "unsupported";
    };

export interface RuntimeResolution {
  readonly target: string;
  readonly lookupKind: RuntimeLookupKind;
  readonly moduleMode: "esm" | "commonjs";
  readonly conditions: readonly string[];
  readonly trace: readonly RuntimeResolutionTraceStep[];
  readonly usage: {
    readonly resolverTraceSteps: number;
    readonly exportMapNodes: number;
    readonly graphDepth: number;
  };
}

export type RuntimeResolutionFailure =
  | {
      readonly code: "invalid_request";
      readonly message: "Runtime resolution input is not valid bounded package input.";
    }
  | {
      readonly code: "resolution_failed";
      readonly message: "Package runtime target is not exported or does not exist in the snapshot.";
    }
  | {
      readonly code: "unsupported_context";
      readonly message: "Package runtime target format is outside the JavaScript first slice.";
    }
  | {
      readonly code: "malformed_artifact";
      readonly message: "Package manifest does not contain valid Node runtime resolution metadata.";
    }
  | {
      readonly code: "resource_limit_exceeded";
      readonly message: "Package runtime resolution exceeds the configured traversal policy.";
      readonly limit: keyof RuntimeResolutionLimits;
    }
  | {
      readonly code: "cancelled";
      readonly message: "Package runtime resolution was cancelled.";
    };

export type RuntimeResolutionResult =
  | { readonly ok: true; readonly value: RuntimeResolution }
  | { readonly ok: false; readonly failure: RuntimeResolutionFailure };

const policyLimits: RuntimeResolutionLimits = Object.freeze({
  maxExportMapNodes: 4_096,
  maxGraphDepth: 128,
  maxResolverTraceSteps: 10_000,
});

interface ResolutionState {
  readonly snapshot: PackageSnapshot;
  readonly activeConditions: ReadonlySet<string>;
  readonly limits: RuntimeResolutionLimits;
  readonly signal: AbortSignal | undefined;
  readonly trace: RuntimeResolutionTraceStep[];
  exportMapNodes: number;
  graphDepth: number;
}

type TargetSelection =
  | { readonly kind: "selected"; readonly target: string }
  | { readonly kind: "no-match" }
  | { readonly kind: "failed"; readonly result: RuntimeResolutionResult };

/** Resolves one Node runtime target using only bytes and files retained by a package snapshot. */
export function resolveNodeRuntime(input: ResolveNodeRuntimeInput): RuntimeResolutionResult {
  if (!validPackageSubpath(input.packageSubpath)) return invalidRequest();
  const normalized = normalizeRuntimeConditions([...input.conditions, input.lookupKind]);
  if (!normalized.ok || normalized.value.lookupKind !== input.lookupKind) return invalidRequest();
  const limits = effectiveLimits(input.limits);
  if (limits === undefined) return invalidRequest();
  if (input.signal?.aborted) return cancelled();

  const rawManifest = readRawManifest(input.snapshot);
  if (rawManifest === undefined) return malformedArtifact();

  const state: ResolutionState = {
    snapshot: input.snapshot,
    activeConditions: new Set(normalized.value.conditions),
    limits,
    signal: input.signal,
    trace: [],
    exportMapNodes: 0,
    graphDepth: 0,
  };
  const requestTrace = retainTrace(state, {
    kind: "request",
    packageSubpath: input.packageSubpath,
    lookupKind: input.lookupKind,
  });
  if (requestTrace !== undefined) return requestTrace;

  if (!Object.hasOwn(rawManifest, "exports")) return resolutionFailed();
  const selection = resolveExports(rawManifest.exports, input.packageSubpath, state);
  if (selection.kind === "failed") return selection.result;
  if (selection.kind === "no-match") return resolutionFailed();

  const moduleMode = classifyModuleMode(selection.target, input.snapshot.manifest.type);
  if (moduleMode === undefined) {
    const traceFailure = retainTrace(state, {
      kind: "target",
      target: selection.target,
      outcome: "unsupported",
    });
    return traceFailure ?? unsupportedContext();
  }
  const bytes = input.snapshot.readFile(selection.target);
  if (bytes === undefined) {
    const traceFailure = retainTrace(state, {
      kind: "target",
      target: selection.target,
      outcome: "missing",
    });
    return traceFailure ?? resolutionFailed();
  }
  const traceFailure = retainTrace(state, {
    kind: "target",
    target: selection.target,
    outcome: "selected",
  });
  if (traceFailure !== undefined) return traceFailure;

  const trace = Object.freeze(state.trace.map((step) => Object.freeze(step)));
  return {
    ok: true,
    value: Object.freeze({
      target: selection.target,
      lookupKind: input.lookupKind,
      moduleMode,
      conditions: normalized.value.conditions,
      trace,
      usage: Object.freeze({
        resolverTraceSteps: trace.length,
        exportMapNodes: state.exportMapNodes,
        graphDepth: state.graphDepth,
      }),
    }),
  };
}

function resolveExports(
  exportsValue: unknown,
  packageSubpath: string,
  state: ResolutionState,
): TargetSelection {
  if (!isRecord(exportsValue)) {
    if (packageSubpath !== ".") return unexported(packageSubpath, state);
    return resolveTarget(exportsValue, state, 0);
  }

  const keys = Object.keys(exportsValue);
  const hasSubpaths = keys.some((key) => key.startsWith("."));
  if (hasSubpaths && keys.some((key) => !key.startsWith("."))) return failed(malformedArtifact());
  if (!hasSubpaths) {
    if (packageSubpath !== ".") return unexported(packageSubpath, state);
    return resolveTarget(exportsValue, state, 0);
  }

  if (!Object.hasOwn(exportsValue, packageSubpath)) return unexported(packageSubpath, state);
  const traceFailure = retainTrace(state, {
    kind: "subpath",
    key: packageSubpath,
    outcome: "matched",
  });
  if (traceFailure !== undefined) return failed(traceFailure);
  return resolveTarget(exportsValue[packageSubpath], state, 0);
}

function resolveTarget(value: unknown, state: ResolutionState, depth: number): TargetSelection {
  const budgetFailure = visitNode(state, depth);
  if (budgetFailure !== undefined) return failed(budgetFailure);
  if (typeof value === "string") {
    const target = validateTarget(value);
    if (target === undefined) {
      const traceFailure = retainTrace(state, {
        kind: "target",
        target: safeTarget(value),
        outcome: "rejected",
      });
      return failed(traceFailure ?? malformedArtifact());
    }
    return { kind: "selected", target };
  }
  if (value === null) return { kind: "no-match" };
  if (!isRecord(value)) return failed(malformedArtifact());

  if (Object.keys(value).some((key) => key.startsWith("."))) return failed(malformedArtifact());
  for (const [condition, target] of Object.entries(value)) {
    if (isIntegerKey(condition)) return failed(malformedArtifact());
    const matches = condition === "default" || state.activeConditions.has(condition);
    const traceFailure = retainTrace(state, {
      kind: "condition",
      condition,
      outcome: matches ? "matched" : "skipped",
    });
    if (traceFailure !== undefined) return failed(traceFailure);
    if (!matches) continue;
    const selected = resolveTarget(target, state, depth + 1);
    if (selected.kind !== "no-match") return selected;
  }
  return { kind: "no-match" };
}

function unexported(packageSubpath: string, state: ResolutionState): TargetSelection {
  const traceFailure = retainTrace(state, {
    kind: "subpath",
    key: packageSubpath,
    outcome: "unexported",
  });
  return traceFailure === undefined ? { kind: "no-match" } : failed(traceFailure);
}

function visitNode(state: ResolutionState, depth: number): RuntimeResolutionResult | undefined {
  if (state.signal?.aborted) return cancelled();
  if (depth > state.limits.maxGraphDepth) return limitExceeded("maxGraphDepth");
  state.graphDepth = Math.max(state.graphDepth, depth);
  state.exportMapNodes += 1;
  if (state.exportMapNodes > state.limits.maxExportMapNodes) {
    return limitExceeded("maxExportMapNodes");
  }
  return undefined;
}

function retainTrace(
  state: ResolutionState,
  step: RuntimeResolutionTraceStep,
): RuntimeResolutionResult | undefined {
  if (state.signal?.aborted) return cancelled();
  if (state.trace.length >= state.limits.maxResolverTraceSteps) {
    return limitExceeded("maxResolverTraceSteps");
  }
  state.trace.push(step);
  return undefined;
}

function readRawManifest(snapshot: PackageSnapshot): Record<string, unknown> | undefined {
  const bytes = snapshot.readFile("package.json");
  if (bytes === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function validateTarget(value: string): string | undefined {
  if (!value.startsWith("./") || value.includes("\\") || value.includes("\0")) return undefined;
  const relative = value.slice(2);
  if (relative === "" || /%2f|%5c/i.test(relative)) return undefined;
  const segments = relative.split("/");
  if (segments.some((segment) => invalidSegment(segment))) return undefined;
  return relative;
}

function invalidSegment(segment: string): boolean {
  if (segment === "" || segment === "." || segment === ".." || segment === "node_modules") {
    return true;
  }
  try {
    const decoded = decodeURIComponent(segment);
    return decoded === "." || decoded === ".." || decoded.toLowerCase() === "node_modules";
  } catch {
    return true;
  }
}

function validPackageSubpath(value: string): boolean {
  if (value === ".") return true;
  if (!value.startsWith("./") || value.includes("\\") || value.includes("\0")) return false;
  return value
    .slice(2)
    .split("/")
    .every((segment) => !invalidSegment(segment));
}

function classifyModuleMode(
  target: string,
  packageType: "module" | "commonjs",
): "esm" | "commonjs" | undefined {
  if (target.endsWith(".mjs")) return "esm";
  if (target.endsWith(".cjs")) return "commonjs";
  if (target.endsWith(".js")) return packageType === "module" ? "esm" : "commonjs";
  return undefined;
}

function effectiveLimits(
  overrides: Partial<RuntimeResolutionLimits> | undefined,
): RuntimeResolutionLimits | undefined {
  const values = {
    maxExportMapNodes: loweredLimit(overrides?.maxExportMapNodes, policyLimits.maxExportMapNodes),
    maxGraphDepth: loweredLimit(overrides?.maxGraphDepth, policyLimits.maxGraphDepth),
    maxResolverTraceSteps: loweredLimit(
      overrides?.maxResolverTraceSteps,
      policyLimits.maxResolverTraceSteps,
    ),
  };
  return Object.values(values).some((value) => value === undefined)
    ? undefined
    : (values as RuntimeResolutionLimits);
}

function loweredLimit(candidate: number | undefined, maximum: number): number | undefined {
  if (candidate === undefined) return maximum;
  if (!Number.isSafeInteger(candidate) || candidate < 1) return undefined;
  return Math.min(candidate, maximum);
}

function safeTarget(value: string): string {
  if (value.length > 512) return "<invalid-target>";
  return value.replaceAll("\0", "<NUL>");
}

function isIntegerKey(value: string): boolean {
  const number = Number(value);
  return Number.isInteger(number) && String(number) === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failed(result: RuntimeResolutionResult): TargetSelection {
  return { kind: "failed", result };
}

function invalidRequest(): RuntimeResolutionResult {
  return failure({
    code: "invalid_request",
    message: "Runtime resolution input is not valid bounded package input.",
  });
}

function resolutionFailed(): RuntimeResolutionResult {
  return failure({
    code: "resolution_failed",
    message: "Package runtime target is not exported or does not exist in the snapshot.",
  });
}

function unsupportedContext(): RuntimeResolutionResult {
  return failure({
    code: "unsupported_context",
    message: "Package runtime target format is outside the JavaScript first slice.",
  });
}

function malformedArtifact(): RuntimeResolutionResult {
  return failure({
    code: "malformed_artifact",
    message: "Package manifest does not contain valid Node runtime resolution metadata.",
  });
}

function limitExceeded(limit: keyof RuntimeResolutionLimits): RuntimeResolutionResult {
  return failure({
    code: "resource_limit_exceeded",
    message: "Package runtime resolution exceeds the configured traversal policy.",
    limit,
  });
}

function cancelled(): RuntimeResolutionResult {
  return failure({ code: "cancelled", message: "Package runtime resolution was cancelled." });
}

function failure(failureValue: RuntimeResolutionFailure): RuntimeResolutionResult {
  return Object.freeze({ ok: false, failure: Object.freeze(failureValue) });
}
