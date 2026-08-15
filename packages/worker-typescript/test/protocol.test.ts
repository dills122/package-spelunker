import { describe, expect, it } from "vitest";

import {
  isTypeScriptBrokerRequestV1,
  isTypeScriptBrokerResponseV1,
  isTypeScriptWorkerRequestV1,
} from "../src/index.js";

const workerRequest = {
  protocolVersion: "1",
  operation: "resolve-declaration",
  operationId: "operation-fixture",
  snapshotId: "sha256:fixture",
  specifier: "fixture-pkg",
  importer: "/workspace/packages/app/src/index.ts",
  packageRoot: "/workspace/node_modules/fixture-pkg",
  tsconfigPath: null,
  projectOptions: {
    moduleResolution: "nodenext",
    resolvePackageJsonExports: true,
  },
  conditions: {
    lookupKind: "import",
    conditions: ["default", "import", "node", "types"],
    customConditions: [],
  },
  limits: {
    maxResolverTraceSteps: 10000,
  },
};

describe("TypeScript worker protocol v1", () => {
  it("accepts a closed bounded declaration request", () => {
    expect(isTypeScriptWorkerRequestV1(workerRequest)).toBe(true);
  });

  it.each([
    { label: "unknown field", value: { ...workerRequest, arbitrary: true } },
    { label: "unknown operation", value: { ...workerRequest, operation: "execute-package" } },
    { label: "relative importer", value: { ...workerRequest, importer: "src/index.ts" } },
    {
      label: "oversized operation ID",
      value: { ...workerRequest, operationId: "x".repeat(257) },
    },
  ])("rejects a request with $label", ({ value }) => {
    expect(isTypeScriptWorkerRequestV1(value)).toBe(false);
  });

  it("accepts only closed broker requests", () => {
    const request = {
      protocolVersion: "1",
      operationId: "operation-fixture",
      requestId: 1,
      operation: "read-file",
      path: "/workspace/package.json",
    };

    expect(isTypeScriptBrokerRequestV1(request)).toBe(true);
    expect(isTypeScriptBrokerRequestV1({ ...request, path: "../outside" })).toBe(false);
    expect(isTypeScriptBrokerRequestV1({ ...request, path: "/etc/passwd" })).toBe(false);
    expect(isTypeScriptBrokerRequestV1({ ...request, stack: "raw stack" })).toBe(false);
  });

  it("accepts typed broker values and rejects malformed responses", () => {
    const response = {
      protocolVersion: "1",
      operationId: "operation-fixture",
      requestId: 1,
      ok: true,
      value: { kind: "file", contents: "{}" },
    };

    expect(isTypeScriptBrokerResponseV1(response)).toBe(true);
    expect(
      isTypeScriptBrokerResponseV1({
        ...response,
        value: { kind: "file", contents: "x".repeat(8_388_609) },
      }),
    ).toBe(false);
    expect(
      isTypeScriptBrokerResponseV1({
        ...response,
        value: { kind: "file", contents: "😀".repeat(2_100_000) },
      }),
    ).toBe(false);
    expect(isTypeScriptBrokerResponseV1({ ...response, value: { arbitrary: true } })).toBe(false);
    expect(
      isTypeScriptBrokerResponseV1({
        ...response,
        value: { kind: "directories", directories: ["safe", "../outside"] },
      }),
    ).toBe(false);
  });
});
