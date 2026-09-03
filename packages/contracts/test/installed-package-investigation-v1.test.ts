import { readFile } from "node:fs/promises";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type InstalledPackageInvestigationV1,
  installedPackageInvestigationV1Schema,
  type SourceLocationV1,
  validateInstalledPackageInvestigationV1,
} from "../src/index.js";

const exampleDirectory = new URL("../../../docs/contracts/v1/", import.meta.url);

async function readExample(name: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(name, exampleDirectory), "utf8"));
}

function detailedPublicApiData(omission: Record<string, unknown> | null = null) {
  return {
    entrypoint: ".",
    symbols: [
      {
        id: ".#example",
        name: "example",
        meanings: ["value"],
        declarationKinds: ["function"],
        display: "declare function example<T extends string>(value: T): T",
        aliasChain: [],
        locations: [{ authority: "package", path: "dist/index.d.ts", line: 1, column: 1 }],
        typeParameters: [{ name: "T", constraint: "string", default: null }],
        signatures: [
          {
            kind: "call",
            ordinal: 0,
            display: "<T extends string>(value: T): T",
            typeParameters: [{ name: "T", constraint: "string", default: null }],
            location: {
              authority: "package",
              path: "dist/index.d.ts",
              line: 1,
              column: 1,
            },
          },
        ],
        members: [],
        heritage: [],
        namespaceExports: [],
        documentation: "Returns the supplied value.",
        deprecation: null,
      },
    ],
    omission,
  };
}

async function partialPublicApiEnvelope(omission: Record<string, unknown>) {
  const value = structuredClone(
    (await readExample("installed-success.example.json")) as Record<string, unknown>,
  );
  const stages = value.stages as Record<string, Record<string, unknown>>;
  stages.publicApiModel = {
    status: "partial",
    data: detailedPublicApiData(omission),
    failureId: "failure-symbol-limit",
    evidenceRefs: ["ev-types-target"],
  };
  value.outcome = "partial";
  value.failures = [
    {
      id: "failure-symbol-limit",
      code: "resource_limit_exceeded",
      stage: "public_api_model",
      message: "Public-symbol budget exceeded.",
      isRetryable: true,
      limit: "maxPublicSymbols",
    },
  ];
  const limits = value.limits as Record<string, Record<string, unknown> | string[]>;
  const applied = limits.applied as Record<string, unknown>;
  const usage = limits.usage as Record<string, unknown>;
  applied.maxPublicSymbols = 1;
  usage.publicSymbols = 2;
  limits.exceeded = ["maxPublicSymbols"];
  return value;
}

describe("validateInstalledPackageInvestigationV1", () => {
  it("exports a portable Draft 2020-12 schema and derives its version type", () => {
    const serializedSchema = JSON.stringify(installedPackageInvestigationV1Schema);

    expect(JSON.parse(serializedSchema)).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "urn:package-spelunker:schema:installed-package-investigation:1",
    });
    expect(serializedSchema).not.toContain('"~kind"');
    expectTypeOf<InstalledPackageInvestigationV1["schemaVersion"]>().toEqualTypeOf<"1">();
    expectTypeOf<SourceLocationV1["authority"]>().toEqualTypeOf<"package" | "compiler-lib">();
  });

  it.each([
    "installed-success.example.json",
    "installed-partial.example.json",
    "installed-public-api-partial.example.json",
    "installed-failure.example.json",
  ])("accepts the %s golden envelope", async (name) => {
    const result = validateInstalledPackageInvestigationV1(await readExample(name));

    expect(result).toEqual({ valid: true, value: expect.any(Object) });
  });

  it("rejects an unknown top-level field", async () => {
    const value = {
      ...((await readExample("installed-success.example.json")) as Record<string, unknown>),
      unexpected: true,
    };

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [{ keyword: "additionalProperties", path: "" }],
    });
  });

  it("accepts an inferred TypeScript configuration", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const typescriptResolution = stages.typescriptResolution;
    if (typescriptResolution?.status !== "complete") {
      throw new Error("Expected a complete TypeScript resolution fixture stage.");
    }
    const data = typescriptResolution.data as Record<string, unknown>;
    data.tsconfigPath = null;

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toEqual({ valid: true, value });
  });

  it("requires TypeScript resolution mode, lookup kind, and conditions", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const typescriptResolution = stages.typescriptResolution;
    if (typescriptResolution?.status !== "complete") {
      throw new Error("Expected a complete TypeScript resolution fixture stage.");
    }
    const data = typescriptResolution.data as Record<string, unknown>;
    delete data.moduleResolution;

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          keyword: "required",
          path: "/stages/typescriptResolution/data",
        }),
      ]),
    });
  });

  it("accepts the detailed shallow public API model", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const publicApiModel = stages.publicApiModel;
    if (publicApiModel?.status !== "complete") {
      throw new Error("Expected a complete public API fixture stage.");
    }
    publicApiModel.data = detailedPublicApiData();

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toEqual({ valid: true, value });
  });

  it("validates recursive namespace symbol identity and paths", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const publicApiModel = stages.publicApiModel;
    if (publicApiModel?.status !== "complete") {
      throw new Error("Expected a complete public API fixture stage.");
    }
    const data = detailedPublicApiData();
    const root = data.symbols[0];
    if (root === undefined) throw new Error("Expected a public symbol fixture.");
    root.meanings = ["value", "namespace"];
    root.declarationKinds = ["function", "namespace"];
    const nested = { ...structuredClone(root), id: ".#example/N", name: "N" };
    nested.namespaceExports = [];
    root.namespaceExports = [nested];
    publicApiModel.data = data;
    const limits = value.limits as Record<string, Record<string, unknown>>;
    const usage = limits.usage;
    if (usage === undefined) throw new Error("Expected usage fixture.");
    usage.publicSymbols = 2;

    expect(validateInstalledPackageInvestigationV1(value)).toEqual({ valid: true, value });

    nested.id = ".#wrong";
    expect(validateInstalledPackageInvestigationV1(value)).toMatchObject({
      valid: false,
      errors: [
        {
          keyword: "contractIdentity",
          path: "/stages/publicApiModel/data/symbols/0/namespaceExports/0/id",
        },
      ],
    });
  });

  it("fails closed when a non-JSON cyclic value reaches recursive schema validation", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const publicApiModel = stages.publicApiModel;
    if (publicApiModel?.status !== "complete") {
      throw new Error("Expected a complete public API fixture stage.");
    }
    const data = detailedPublicApiData();
    const root = data.symbols[0];
    if (root === undefined) throw new Error("Expected a public symbol fixture.");
    root.meanings = ["value", "namespace"];
    root.declarationKinds = ["function", "namespace"];
    root.namespaceExports = [root];
    publicApiModel.data = data;

    expect(validateInstalledPackageInvestigationV1(value)).toMatchObject({
      valid: false,
      errors: [{ keyword: "schemaEvaluation", path: "" }],
    });
  });

  it("accepts an explicit partial public API stage with bounded data", async () => {
    const value = await partialPublicApiEnvelope({
      kind: "symbols",
      limit: "maxPublicSymbols",
      omittedCount: 3,
      subjectId: null,
    });

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toEqual({ valid: true, value });
  });

  it("rejects omission metadata that contradicts its referenced failure", async () => {
    const value = await partialPublicApiEnvelope({
      kind: "external-declaration",
      limit: "maxPublicSymbols",
      omittedCount: 1,
      subjectId: ".#external",
    });

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [
        {
          keyword: "contractOmission",
          path: "/stages/publicApiModel/data/omission",
        },
      ],
    });
  });

  it("rejects absolute declaration locations in the public API model", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const publicApiModel = stages.publicApiModel;
    if (publicApiModel?.status !== "complete") {
      throw new Error("Expected a complete public API fixture stage.");
    }
    const data = publicApiModel.data as Record<string, unknown>;
    const symbols = data.symbols as Array<Record<string, unknown>>;
    const symbol = symbols[0];
    if (symbol === undefined) throw new Error("Expected a public symbol fixture.");
    symbol.locations = [
      {
        authority: "package",
        path: "/Users/example/package/index.d.ts",
        line: 1,
        column: 1,
      },
    ];

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [
        {
          keyword: "contractPath",
          path: "/stages/publicApiModel/data/symbols/0/locations/0/path",
        },
      ],
    });
  });

  it("accepts pinned compiler-lib locations and rejects arbitrary compiler authority", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const publicApiModel = stages.publicApiModel;
    if (publicApiModel?.status !== "complete") {
      throw new Error("Expected a complete public API fixture stage.");
    }
    const data = publicApiModel.data as Record<string, unknown>;
    const symbols = data.symbols as Array<Record<string, unknown>>;
    const symbol = symbols[0];
    if (symbol === undefined) throw new Error("Expected a public symbol fixture.");
    symbol.locations = [{ authority: "compiler-lib", path: "lib.es2022.d.ts", line: 1, column: 1 }];

    expect(validateInstalledPackageInvestigationV1(value)).toEqual({ valid: true, value });

    symbol.locations = [{ authority: "compiler-lib", path: "evil.d.ts", line: 1, column: 1 }];
    expect(validateInstalledPackageInvestigationV1(value)).toMatchObject({
      valid: false,
      errors: [{ keyword: "contractPath" }],
    });
  });

  it("rejects impossible aggregate symbol usage and applied-limit claims", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const publicApiModel = stages.publicApiModel;
    if (publicApiModel?.status !== "complete") {
      throw new Error("Expected a complete public API fixture stage.");
    }
    const data = publicApiModel.data as Record<string, unknown>;
    const symbols = data.symbols as Array<Record<string, unknown>>;
    const first = symbols[0];
    if (first === undefined) throw new Error("Expected a public symbol fixture.");
    symbols.push({ ...structuredClone(first), id: ".#z", name: "z" });
    const limits = value.limits as Record<string, Record<string, unknown>>;
    const applied = limits.applied;
    const usage = limits.usage;
    if (applied === undefined || usage === undefined) throw new Error("Expected limit fixtures.");
    applied.maxPublicSymbols = 1;
    usage.publicSymbols = 0;

    expect(validateInstalledPackageInvestigationV1(value)).toMatchObject({
      valid: false,
      errors: [{ keyword: "contractLimit", path: "/stages/publicApiModel/data/symbols" }],
    });

    applied.maxPublicSymbols = 3;
    expect(validateInstalledPackageInvestigationV1(value)).toMatchObject({
      valid: false,
      errors: [{ keyword: "contractLimit", path: "/limits/usage/publicSymbols" }],
    });
  });

  it("enforces UTF-8 byte bounds after structural validation", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const publicApiModel = stages.publicApiModel;
    if (publicApiModel?.status !== "complete") {
      throw new Error("Expected a complete public API fixture stage.");
    }
    const data = publicApiModel.data as Record<string, unknown>;
    const symbols = data.symbols as Array<Record<string, unknown>>;
    const symbol = symbols[0];
    if (symbol === undefined) throw new Error("Expected a public symbol fixture.");
    symbol.display = "😀".repeat(1_025);

    expect(validateInstalledPackageInvestigationV1(value)).toMatchObject({
      valid: false,
      errors: [
        {
          keyword: "contractByteLength",
          path: "/stages/publicApiModel/data/symbols/0/display",
        },
      ],
    });
  });

  it("requires resource failures, exceeded limits, and measured usage to agree", async () => {
    const value = await partialPublicApiEnvelope({
      kind: "symbols",
      limit: "maxPublicSymbols",
      omittedCount: 1,
      subjectId: ".#overflow",
    });
    const limits = value.limits as Record<string, unknown>;
    limits.exceeded = [];

    expect(validateInstalledPackageInvestigationV1(value)).toMatchObject({
      valid: false,
      errors: [{ keyword: "contractLimit", path: "/limits/exceeded" }],
    });
  });

  it("rejects a public symbol ID that is not derived from its entrypoint and export name", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const publicApiModel = stages.publicApiModel;
    if (publicApiModel?.status !== "complete") {
      throw new Error("Expected a complete public API fixture stage.");
    }
    const data = publicApiModel.data as Record<string, unknown>;
    const symbols = data.symbols as Array<Record<string, unknown>>;
    const symbol = symbols[0];
    if (symbol === undefined) throw new Error("Expected a public symbol fixture.");
    symbol.id = ".#wrong";

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [
        {
          keyword: "contractIdentity",
          path: "/stages/publicApiModel/data/symbols/0/id",
        },
      ],
    });
  });

  it("rejects public symbols that are not ordered by export name", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const publicApiModel = stages.publicApiModel;
    if (publicApiModel?.status !== "complete") {
      throw new Error("Expected a complete public API fixture stage.");
    }
    const data = publicApiModel.data as Record<string, unknown>;
    const symbols = data.symbols as Array<Record<string, unknown>>;
    const first = symbols[0];
    if (first === undefined) throw new Error("Expected a public symbol fixture.");
    const earlier = structuredClone(first);
    earlier.name = "alpha";
    earlier.id = ".#alpha";
    symbols.push(earlier);

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [
        {
          keyword: "contractOrder",
          path: "/stages/publicApiModel/data/symbols/1/id",
        },
      ],
    });
  });

  it("rejects an unsupported schema version", async () => {
    const value = {
      ...((await readExample("installed-success.example.json")) as Record<string, unknown>),
      schemaVersion: "2",
    };

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [{ keyword: "const", path: "/schemaVersion" }],
    });
  });

  it("rejects a successful result without normalized context", async () => {
    const value = {
      ...((await readExample("installed-success.example.json")) as Record<string, unknown>),
      context: null,
    };

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [{ keyword: "type", path: "/context" }],
    });
  });

  it("rejects a partial result when every stage is complete", async () => {
    const success = (await readExample("installed-success.example.json")) as Record<
      string,
      unknown
    >;
    const partial = (await readExample("installed-partial.example.json")) as Record<
      string,
      unknown
    >;
    const value = {
      ...structuredClone(success),
      outcome: "partial",
      failures: structuredClone(partial.failures),
    };

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [{ keyword: "contractOutcome", path: "/stages" }],
    });
  });

  it("rejects a stage that references an unknown failure", async () => {
    const value = structuredClone(
      (await readExample("installed-partial.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    stages.typescriptResolution = {
      status: "failed",
      failureId: "missing-failure",
    };

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [
        {
          keyword: "contractReference",
          path: "/stages/typescriptResolution/failureId",
        },
      ],
    });
  });

  it("rejects a stage that references unknown evidence", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const runtimeResolution = stages.runtimeResolution;
    if (runtimeResolution === undefined)
      throw new Error("Missing runtimeResolution fixture stage.");
    runtimeResolution.evidenceRefs = ["missing-evidence"];

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [
        {
          keyword: "contractReference",
          path: "/stages/runtimeResolution/evidenceRefs/0",
        },
      ],
    });
  });

  it("rejects duplicate evidence IDs", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const evidence = value.evidence as Array<Record<string, unknown>>;
    const firstEvidence = evidence[0];
    const secondEvidence = evidence[1];
    if (firstEvidence === undefined || secondEvidence === undefined) {
      throw new Error("Expected at least two evidence fixtures.");
    }
    secondEvidence.id = firstEvidence.id;

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [{ keyword: "contractReference", path: "/evidence/1/id" }],
    });
  });

  it("rejects a raw stack in a normalized failure", async () => {
    const value = structuredClone(
      (await readExample("installed-failure.example.json")) as Record<string, unknown>,
    );
    const failures = value.failures as Array<Record<string, unknown>>;
    failures[0] = { ...failures[0], stack: "sensitive stack" };

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          keyword: "additionalProperties",
          path: "/failures/0",
        }),
      ]),
    });
  });

  it("accepts the normalized unsupported-context failure vocabulary", async () => {
    const value = structuredClone(
      (await readExample("installed-failure.example.json")) as Record<string, unknown>,
    );
    const failures = value.failures as Array<Record<string, unknown>>;
    const failure = failures[0];
    if (failure === undefined) throw new Error("Expected a failure fixture.");
    failure.code = "unsupported_context";
    failure.message = "The selected resolver mode is outside first-slice support.";

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toEqual({ valid: true, value });
  });
});
