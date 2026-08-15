import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import type {
  TypeScriptResolution,
  TypeScriptResolutionFailure,
  TypeScriptResolutionTraceStep,
} from "@package-spelunker/typescript-resolution";

import { encodeFrame, FrameDecoder } from "./frame.js";
import {
  isTypeScriptBrokerRequestV1,
  isTypeScriptBrokerResponseV1,
  isTypeScriptWorkerRequestV1,
  type TypeScriptBrokerRequestV1,
  type TypeScriptBrokerResponseV1,
  type TypeScriptWorkerRequestV1,
} from "./protocol.js";

export interface TypeScriptWorkerFileBroker {
  fileExists(path: string): boolean | Promise<boolean>;
  readFile(path: string): string | undefined | Promise<string | undefined>;
  directoryExists(path: string): boolean | Promise<boolean>;
  getDirectories(path: string): readonly string[] | Promise<readonly string[]>;
  realpath(path: string): string | Promise<string>;
}

export interface TypeScriptWorkerLimits {
  readonly maxWallTimeMs: number;
  readonly maxCompilerMemoryBytes: number;
  readonly maxCancellationGraceMs: number;
  readonly maxOutputBytes: number;
}

export interface RunTypeScriptResolutionWorkerInput {
  readonly request: TypeScriptWorkerRequestV1;
  readonly broker: TypeScriptWorkerFileBroker;
  readonly limits?: Partial<TypeScriptWorkerLimits>;
  readonly signal?: AbortSignal;
  /** Test/internal hook. Production uses the compiled child in this package. */
  readonly workerPath?: URL | string;
}

export type IsolatedTypeScriptResolutionFailure =
  | TypeScriptResolutionFailure
  | {
      readonly code: "resource_limit_exceeded";
      readonly message:
        | "Isolated TypeScript analysis exceeded its wall-time budget."
        | "Isolated TypeScript analysis exceeded its output budget.";
      readonly limit: "maxWallTimeMs" | "maxOutputBytes";
    }
  | {
      readonly code: "cancelled";
      readonly message: "Isolated TypeScript analysis was cancelled.";
    }
  | {
      readonly code: "analysis_failed";
      readonly message: "Isolated TypeScript analysis could not complete safely.";
    };

export type IsolatedTypeScriptResolutionResult =
  | { readonly ok: true; readonly value: TypeScriptResolution }
  | { readonly ok: false; readonly failure: IsolatedTypeScriptResolutionFailure };

const defaultLimits: TypeScriptWorkerLimits = Object.freeze({
  maxWallTimeMs: 60_000,
  maxCompilerMemoryBytes: 805_306_368,
  maxCancellationGraceMs: 2_000,
  maxOutputBytes: 8_388_608,
});

/** Runs declaration resolution in a terminable child with brokered virtual filesystem access. */
export async function runTypeScriptResolutionWorker(
  input: RunTypeScriptResolutionWorkerInput,
): Promise<IsolatedTypeScriptResolutionResult> {
  if (input.signal?.aborted) return isolatedCancelled();
  if (!isTypeScriptWorkerRequestV1(input.request)) return isolatedAnalysisFailed();
  const limits = effectiveLimits(input.limits);
  const workerPath = resolveWorkerPath(input.workerPath);
  const memoryMiB = Math.max(16, Math.floor(limits.maxCompilerMemoryBytes / 1_048_576));
  const child = spawn(process.execPath, [`--max-old-space-size=${memoryMiB}`, workerPath], {
    cwd: "/",
    env: {},
    stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"],
  });
  const brokerReadable = child.stdio[3] as Readable | null;
  const brokerWritable = child.stdio[4] as Writable | null;
  if (brokerReadable === null || brokerWritable === null) {
    child.kill("SIGKILL");
    return isolatedAnalysisFailed();
  }

  return await new Promise<IsolatedTypeScriptResolutionResult>((resolve) => {
    let settled = false;
    let termination: "timeout" | "cancelled" | "output" | "protocol" | undefined;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    const output: Buffer[] = [];
    let outputBytes = 0;
    const decoder = new FrameDecoder();
    let brokerQueue = Promise.resolve();

    const terminate = (reason: NonNullable<typeof termination>): void => {
      if (termination !== undefined) return;
      termination = reason;
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => child.kill("SIGKILL"), limits.maxCancellationGraceMs);
    };
    const wallTimer = setTimeout(() => terminate("timeout"), limits.maxWallTimeMs);
    const onAbort = (): void => terminate("cancelled");
    input.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > limits.maxOutputBytes) {
        terminate("output");
        return;
      }
      output.push(Buffer.from(chunk));
    });
    child.stderr.resume();

    brokerReadable.on("data", (chunk: Buffer) => {
      try {
        for (const value of decoder.push(Buffer.from(chunk))) {
          brokerQueue = brokerQueue
            .then(() => serviceBrokerRequest(value, input.request, input.broker, brokerWritable))
            .catch(() => terminate("protocol"));
        }
      } catch {
        terminate("protocol");
      }
    });
    brokerReadable.on("error", () => terminate("protocol"));
    brokerWritable.on("error", () => terminate("protocol"));

    child.once("error", () => terminate("protocol"));
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(wallTimer);
      if (forceTimer !== undefined) clearTimeout(forceTimer);
      input.signal?.removeEventListener("abort", onAbort);

      if (termination === "timeout") return resolve(wallTimeExceeded());
      if (termination === "cancelled") return resolve(isolatedCancelled());
      if (termination === "output") return resolve(outputExceeded());
      if (termination === "protocol" || code !== 0 || signal !== null) {
        return resolve(isolatedAnalysisFailed());
      }
      try {
        const parsed = JSON.parse(Buffer.concat(output, outputBytes).toString("utf8")) as unknown;
        return resolve(normalizeWorkerResult(parsed, input.request));
      } catch {
        return resolve(isolatedAnalysisFailed());
      }
    });

    child.stdin.end(JSON.stringify(input.request));
  });
}

async function serviceBrokerRequest(
  value: unknown,
  request: TypeScriptWorkerRequestV1,
  broker: TypeScriptWorkerFileBroker,
  writable: Writable,
): Promise<void> {
  if (!isTypeScriptBrokerRequestV1(value) || value.operationId !== request.operationId) {
    throw new Error("Invalid broker request.");
  }
  let response: TypeScriptBrokerResponseV1;
  try {
    response = await brokerResponse(value, broker);
  } catch {
    response = failureBrokerResponse(value);
  }
  if (!isTypeScriptBrokerResponseV1(response)) throw new Error("Invalid broker response.");
  writable.write(encodeFrame(response));
}

async function brokerResponse(
  request: TypeScriptBrokerRequestV1,
  broker: TypeScriptWorkerFileBroker,
): Promise<TypeScriptBrokerResponseV1> {
  const common = {
    protocolVersion: "1" as const,
    operationId: request.operationId,
    requestId: request.requestId,
    ok: true as const,
  };
  switch (request.operation) {
    case "file-exists":
      return {
        ...common,
        value: { kind: "exists", exists: await broker.fileExists(request.path) },
      };
    case "read-file":
      return {
        ...common,
        value: { kind: "file", contents: (await broker.readFile(request.path)) ?? null },
      };
    case "directory-exists":
      return {
        ...common,
        value: { kind: "exists", exists: await broker.directoryExists(request.path) },
      };
    case "get-directories":
      return {
        ...common,
        value: {
          kind: "directories",
          directories: [...(await broker.getDirectories(request.path))],
        },
      };
    case "realpath":
      return { ...common, value: { kind: "realpath", path: await broker.realpath(request.path) } };
  }
}

function failureBrokerResponse(request: TypeScriptBrokerRequestV1): TypeScriptBrokerResponseV1 {
  return {
    protocolVersion: "1",
    operationId: request.operationId,
    requestId: request.requestId,
    ok: false,
    code: "broker_failure",
  };
}

function normalizeWorkerResult(
  value: unknown,
  request: TypeScriptWorkerRequestV1,
): IsolatedTypeScriptResolutionResult {
  if (!isRecord(value) || !exactKeys(value, ["ok", value.ok === true ? "value" : "failure"])) {
    return isolatedAnalysisFailed();
  }
  if (value.ok === false) return normalizeWorkerFailure(value.failure);
  if (value.ok !== true || !validResolution(value.value, request)) return isolatedAnalysisFailed();
  return { ok: true, value: freezeResolution(value.value) };
}

function validResolution(
  value: unknown,
  request: TypeScriptWorkerRequestV1,
): value is TypeScriptResolution {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "target",
      "compilerVersion",
      "tsconfigPath",
      "moduleResolution",
      "lookupKind",
      "conditions",
      "snapshotId",
      "trace",
      "usage",
    ]) ||
    !validRelativePath(value.target) ||
    !/\.d\.(?:ts|mts|cts)$/.test(value.target) ||
    value.compilerVersion !== "6.0.3" ||
    (value.tsconfigPath !== null && !validRelativePath(value.tsconfigPath)) ||
    value.tsconfigPath !== request.tsconfigPath ||
    value.moduleResolution !== request.projectOptions.moduleResolution ||
    value.lookupKind !== request.conditions.lookupKind ||
    value.snapshotId !== request.snapshotId ||
    !stringArray(value.conditions, 64) ||
    !arraysEqual(value.conditions, request.conditions.conditions) ||
    !Array.isArray(value.trace) ||
    value.trace.length > request.limits.maxResolverTraceSteps ||
    !value.trace.every(validTraceStep) ||
    !isRecord(value.usage) ||
    !exactKeys(value.usage, ["resolverTraceSteps"]) ||
    value.usage.resolverTraceSteps !== value.trace.length
  ) {
    return false;
  }
  return true;
}

function validTraceStep(value: unknown): value is TypeScriptResolutionTraceStep {
  if (!isRecord(value)) return false;
  const keys = value.path === undefined ? ["kind", "outcome"] : ["kind", "path", "outcome"];
  return (
    exactKeys(value, keys) &&
    [
      "resolution-start",
      "file-probe",
      "file-read",
      "directory-probe",
      "directory-list",
      "realpath",
      "resolution-selected",
    ].includes(String(value.kind)) &&
    ["start", "found", "missing", "selected"].includes(String(value.outcome)) &&
    (value.path === undefined || validRelativePath(value.path))
  );
}

function normalizeWorkerFailure(value: unknown): IsolatedTypeScriptResolutionResult {
  if (!isRecord(value) || !boundedString(value.code, 64)) return isolatedAnalysisFailed();
  switch (value.code) {
    case "invalid_request":
      return fixedResolverFailure(
        "invalid_request",
        "TypeScript resolution input is not valid bounded workspace context.",
      );
    case "resolution_failed":
      return fixedResolverFailure(
        "resolution_failed",
        "TypeScript did not resolve a declaration for the selected package.",
      );
    case "unsupported_context":
      return fixedResolverFailure(
        "unsupported_context",
        "TypeScript resolved outside the selected package snapshot.",
      );
    case "malformed_artifact":
      return fixedResolverFailure(
        "malformed_artifact",
        "TypeScript selected a declaration missing from the admitted snapshot.",
      );
    case "resource_limit_exceeded":
      return value.limit === "maxResolverTraceSteps"
        ? {
            ok: false,
            failure: {
              code: "resource_limit_exceeded",
              message: "TypeScript resolution exceeded its configured trace budget.",
              limit: "maxResolverTraceSteps",
            },
          }
        : isolatedAnalysisFailed();
    case "cancelled":
      return fixedResolverFailure("cancelled", "TypeScript declaration resolution was cancelled.");
    case "analysis_failed":
      return isolatedAnalysisFailed();
    default:
      return isolatedAnalysisFailed();
  }
}

function fixedResolverFailure(
  code:
    | "invalid_request"
    | "resolution_failed"
    | "unsupported_context"
    | "malformed_artifact"
    | "cancelled",
  message: TypeScriptResolutionFailure["message"],
): IsolatedTypeScriptResolutionResult {
  return { ok: false, failure: { code, message } as TypeScriptResolutionFailure };
}

function freezeResolution(value: TypeScriptResolution): TypeScriptResolution {
  const trace = Object.freeze(value.trace.map((step) => Object.freeze({ ...step })));
  return Object.freeze({
    ...value,
    conditions: Object.freeze([...value.conditions]),
    trace,
    usage: Object.freeze({ ...value.usage }),
  });
}

function effectiveLimits(
  overrides: Partial<TypeScriptWorkerLimits> | undefined,
): TypeScriptWorkerLimits {
  return {
    maxWallTimeMs: lowered(overrides?.maxWallTimeMs, defaultLimits.maxWallTimeMs),
    maxCompilerMemoryBytes: lowered(
      overrides?.maxCompilerMemoryBytes,
      defaultLimits.maxCompilerMemoryBytes,
    ),
    maxCancellationGraceMs: lowered(
      overrides?.maxCancellationGraceMs,
      defaultLimits.maxCancellationGraceMs,
    ),
    maxOutputBytes: lowered(overrides?.maxOutputBytes, defaultLimits.maxOutputBytes),
  };
}

function lowered(candidate: number | undefined, fallback: number): number {
  return candidate === undefined || !Number.isSafeInteger(candidate) || candidate < 1
    ? fallback
    : Math.min(candidate, fallback);
}

function resolveWorkerPath(path: URL | string | undefined): string {
  if (path instanceof URL) return fileURLToPath(path);
  if (typeof path === "string") return path;
  return fileURLToPath(
    import.meta.url.includes("/src/")
      ? new URL("../dist/child.js", import.meta.url)
      : new URL("./child.js", import.meta.url),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    [...expected].sort().every((key, index) => key === keys[index])
  );
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function stringArray(value: unknown, maxItems: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => boundedString(item, 256))
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validRelativePath(value: unknown): value is string {
  return (
    boundedString(value, 4096) &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !value.split("/").includes("..")
  );
}

function isolatedCancelled(): IsolatedTypeScriptResolutionResult {
  return {
    ok: false,
    failure: { code: "cancelled", message: "Isolated TypeScript analysis was cancelled." },
  };
}

function isolatedAnalysisFailed(): IsolatedTypeScriptResolutionResult {
  return {
    ok: false,
    failure: {
      code: "analysis_failed",
      message: "Isolated TypeScript analysis could not complete safely.",
    },
  };
}

function wallTimeExceeded(): IsolatedTypeScriptResolutionResult {
  return {
    ok: false,
    failure: {
      code: "resource_limit_exceeded",
      message: "Isolated TypeScript analysis exceeded its wall-time budget.",
      limit: "maxWallTimeMs",
    },
  };
}

function outputExceeded(): IsolatedTypeScriptResolutionResult {
  return {
    ok: false,
    failure: {
      code: "resource_limit_exceeded",
      message: "Isolated TypeScript analysis exceeded its output budget.",
      limit: "maxOutputBytes",
    },
  };
}
