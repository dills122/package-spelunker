import Type, { type Static, type TSchema } from "typebox";

import {
  firstSliceV1AppliedLimitsSchema,
  firstSliceV1LimitNameSchema,
} from "./resource-policy-v1.js";

const closed = { additionalProperties: false } as const;
const identifier = Type.String({ minLength: 1, maxLength: 256 });
const relativePath = Type.String({ minLength: 1, maxLength: 4096 });
const nonNegativeInteger = Type.Integer({ minimum: 0 });
const publicSymbolId = Type.String({ minLength: 3, maxLength: 4096 });
const displayString = Type.String({ minLength: 1, maxLength: 4096 });
const documentationString = Type.String({ minLength: 1, maxLength: 1024 });

const stageName = Type.Union([
  Type.Literal("request"),
  Type.Literal("context_discovery"),
  Type.Literal("snapshot_construction"),
  Type.Literal("runtime_resolution"),
  Type.Literal("typescript_resolution"),
  Type.Literal("public_api_model"),
  Type.Literal("report_serialization"),
]);

const normalizedContext = Type.Object(
  {
    workspaceRoot: Type.Literal("."),
    importer: relativePath,
    specifier: Type.String({ minLength: 1, maxLength: 512 }),
    conditions: Type.Array(identifier, { maxItems: 64 }),
  },
  closed,
);

const evidence = Type.Object(
  {
    id: identifier,
    authority: Type.Union([
      Type.Literal("authoritative"),
      Type.Literal("diagnostic"),
      Type.Literal("enrichment"),
      Type.Literal("heuristic"),
    ]),
    kind: Type.Union([
      Type.Literal("file"),
      Type.Literal("resolver-trace"),
      Type.Literal("compiler"),
      Type.Literal("policy"),
    ]),
    path: Type.Optional(relativePath),
    description: Type.String({ minLength: 1, maxLength: 1024 }),
  },
  closed,
);

const warning = Type.Object(
  {
    code: Type.Union([
      Type.Literal("evidence_truncated"),
      Type.Literal("trace_truncated"),
      Type.Literal("api_model_incomplete"),
      Type.Literal("path_redacted"),
      Type.Literal("configuration_ambiguous"),
    ]),
    stage: stageName,
    message: Type.String({ minLength: 1, maxLength: 1024 }),
    evidenceRefs: Type.Array(identifier, { maxItems: 64 }),
  },
  closed,
);

const generalFailure = Type.Object(
  {
    id: identifier,
    code: Type.Union([
      Type.Literal("invalid_request"),
      Type.Literal("outside_approved_root"),
      Type.Literal("package_not_found"),
      Type.Literal("unsupported_context"),
      Type.Literal("malformed_artifact"),
      Type.Literal("resolution_failed"),
      Type.Literal("analysis_failed"),
      Type.Literal("cancelled"),
      Type.Literal("internal_error"),
    ]),
    stage: stageName,
    message: Type.String({ minLength: 1, maxLength: 1024 }),
    isRetryable: Type.Boolean(),
  },
  closed,
);

const resourceLimitFailure = Type.Object(
  {
    id: identifier,
    code: Type.Literal("resource_limit_exceeded"),
    stage: stageName,
    message: Type.String({ minLength: 1, maxLength: 1024 }),
    isRetryable: Type.Boolean(),
    limit: firstSliceV1LimitNameSchema,
  },
  closed,
);

const failure = Type.Union([generalFailure, resourceLimitFailure]);

const limits = Type.Object(
  {
    policyVersion: Type.Literal("first-slice-v1"),
    applied: firstSliceV1AppliedLimitsSchema,
    usage: Type.Object(
      {
        artifactBytesRead: nonNegativeInteger,
        filesVisited: nonNegativeInteger,
        declarationFiles: nonNegativeInteger,
        publicSymbols: nonNegativeInteger,
        evidenceEntries: nonNegativeInteger,
        wallTimeMs: nonNegativeInteger,
      },
      closed,
    ),
    exceeded: Type.Array(firstSliceV1LimitNameSchema, { maxItems: 22, uniqueItems: true }),
  },
  closed,
);

const metadata = Type.Object(
  {
    toolVersion: Type.String({ minLength: 1, maxLength: 128 }),
    generatedAt: Type.String({ format: "date-time" }),
  },
  closed,
);

const contextData = Type.Object(
  {
    packageManager: Type.Union([
      Type.Literal("npm"),
      Type.Literal("pnpm"),
      Type.Literal("yarn"),
      Type.Literal("bun"),
      Type.Literal("unknown"),
    ]),
    workspacePackage: Type.Union([identifier, Type.Null()]),
  },
  closed,
);

const snapshotData = Type.Object(
  {
    snapshotId: identifier,
    name: identifier,
    version: Type.String({ minLength: 1, maxLength: 256 }),
    source: Type.Union([Type.Literal("installed"), Type.Literal("workspace")]),
    contentHash: identifier,
  },
  closed,
);

const runtimeResolutionData = Type.Object(
  {
    target: relativePath,
    moduleMode: Type.Union([Type.Literal("esm"), Type.Literal("commonjs")]),
    conditions: Type.Array(identifier, { maxItems: 64 }),
  },
  closed,
);

const typescriptResolutionData = Type.Object(
  {
    target: relativePath,
    compilerVersion: Type.String({ minLength: 1, maxLength: 128 }),
    tsconfigPath: Type.Union([relativePath, Type.Null()]),
    moduleResolution: Type.Union([Type.Literal("node16"), Type.Literal("nodenext")]),
    lookupKind: Type.Union([Type.Literal("import"), Type.Literal("require")]),
    conditions: Type.Array(identifier, { maxItems: 64 }),
  },
  closed,
);

const sourceLocation = Type.Object(
  {
    path: relativePath,
    line: Type.Integer({ minimum: 1 }),
    column: Type.Integer({ minimum: 1 }),
  },
  closed,
);

const typeParameter = Type.Object(
  {
    name: identifier,
    constraint: Type.Union([displayString, Type.Null()]),
    default: Type.Union([displayString, Type.Null()]),
  },
  closed,
);

const signature = Type.Object(
  {
    kind: Type.Union([Type.Literal("call"), Type.Literal("construct")]),
    ordinal: nonNegativeInteger,
    display: displayString,
    typeParameters: Type.Array(typeParameter, { maxItems: 1024 }),
    location: Type.Union([sourceLocation, Type.Null()]),
  },
  closed,
);

const deprecation = Type.Object(
  {
    message: Type.Union([documentationString, Type.Null()]),
  },
  closed,
);

const symbolMeaning = Type.Union([
  Type.Literal("type"),
  Type.Literal("value"),
  Type.Literal("namespace"),
]);

const member = Type.Object(
  {
    name: identifier,
    meanings: Type.Array(symbolMeaning, { minItems: 1, maxItems: 3, uniqueItems: true }),
    declarationKinds: Type.Array(
      Type.Union([
        Type.Literal("property"),
        Type.Literal("method"),
        Type.Literal("getter"),
        Type.Literal("setter"),
        Type.Literal("constructor"),
        Type.Literal("index"),
        Type.Literal("call"),
        Type.Literal("construct"),
      ]),
      { minItems: 1, maxItems: 8, uniqueItems: true },
    ),
    scope: Type.Union([Type.Literal("static"), Type.Literal("instance")]),
    visibility: Type.Union([
      Type.Literal("public"),
      Type.Literal("protected"),
      Type.Literal("private"),
      Type.Literal("unknown"),
    ]),
    optional: Type.Boolean(),
    readonly: Type.Boolean(),
    display: Type.Union([displayString, Type.Null()]),
    signatures: Type.Array(signature, { maxItems: 1024 }),
    locations: Type.Array(sourceLocation, { minItems: 1, maxItems: 16384 }),
    documentation: Type.Union([documentationString, Type.Null()]),
    deprecation: Type.Union([deprecation, Type.Null()]),
  },
  closed,
);

const aliasHop = Type.Object(
  {
    targetName: identifier,
    sourceModule: Type.Union([Type.String({ minLength: 1, maxLength: 512 }), Type.Null()]),
    location: sourceLocation,
  },
  closed,
);

const heritage = Type.Object(
  {
    kind: Type.Union([Type.Literal("extends"), Type.Literal("implements")]),
    display: displayString,
    location: Type.Union([sourceLocation, Type.Null()]),
  },
  closed,
);

const publicSymbol = Type.Object(
  {
    id: publicSymbolId,
    name: identifier,
    meanings: Type.Array(symbolMeaning, { minItems: 1, maxItems: 3, uniqueItems: true }),
    declarationKinds: Type.Array(
      Type.Union([
        Type.Literal("class"),
        Type.Literal("interface"),
        Type.Literal("function"),
        Type.Literal("variable"),
        Type.Literal("enum"),
        Type.Literal("type-alias"),
        Type.Literal("namespace"),
      ]),
      { minItems: 1, maxItems: 7, uniqueItems: true },
    ),
    display: Type.Union([displayString, Type.Null()]),
    aliasChain: Type.Array(aliasHop, { maxItems: 512 }),
    locations: Type.Array(sourceLocation, { minItems: 1, maxItems: 16384 }),
    typeParameters: Type.Array(typeParameter, { maxItems: 1024 }),
    signatures: Type.Array(signature, { maxItems: 1024 }),
    members: Type.Array(member, { maxItems: 200000 }),
    heritage: Type.Array(heritage, { maxItems: 512 }),
    documentation: Type.Union([documentationString, Type.Null()]),
    deprecation: Type.Union([deprecation, Type.Null()]),
  },
  closed,
);

const publicApiOmission = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("symbols"),
      Type.Literal("signatures"),
      Type.Literal("graph"),
      Type.Literal("external-declaration"),
    ]),
    limit: Type.Union([
      Type.Literal("maxPublicSymbols"),
      Type.Literal("maxSignaturesPerSymbol"),
      Type.Literal("maxGraphDepth"),
      Type.Null(),
    ]),
    omittedCount: Type.Integer({ minimum: 1 }),
    subjectId: Type.Union([publicSymbolId, Type.Null()]),
  },
  closed,
);

const publicApiDataProperties = {
  entrypoint: Type.String({ minLength: 1, maxLength: 512 }),
  symbols: Type.Array(publicSymbol, { maxItems: 50000 }),
} as const;

const completePublicApiData = Type.Object(
  { ...publicApiDataProperties, omission: Type.Null() },
  closed,
);

const partialPublicApiData = Type.Object(
  { ...publicApiDataProperties, omission: publicApiOmission },
  closed,
);

function completeStage<const Data extends TSchema>(data: Data) {
  return Type.Object(
    {
      status: Type.Literal("complete"),
      data,
      evidenceRefs: Type.Array(identifier, { maxItems: 64 }),
    },
    closed,
  );
}

function partialStage<const Data extends TSchema>(data: Data) {
  return Type.Object(
    {
      status: Type.Literal("partial"),
      data,
      failureId: identifier,
      evidenceRefs: Type.Array(identifier, { maxItems: 64 }),
    },
    closed,
  );
}

const failedStage = Type.Object(
  {
    status: Type.Literal("failed"),
    failureId: identifier,
  },
  closed,
);

const skippedStage = Type.Object(
  {
    status: Type.Literal("skipped"),
    becauseFailureId: identifier,
  },
  closed,
);

function laterStage<const Data extends TSchema>(data: Data) {
  return Type.Union([completeStage(data), failedStage, skippedStage]);
}

const successStages = Type.Object(
  {
    contextDiscovery: completeStage(contextData),
    snapshotConstruction: completeStage(snapshotData),
    runtimeResolution: completeStage(runtimeResolutionData),
    typescriptResolution: completeStage(typescriptResolutionData),
    publicApiModel: completeStage(completePublicApiData),
  },
  closed,
);

const partialStages = Type.Object(
  {
    contextDiscovery: completeStage(contextData),
    snapshotConstruction: completeStage(snapshotData),
    runtimeResolution: laterStage(runtimeResolutionData),
    typescriptResolution: laterStage(typescriptResolutionData),
    publicApiModel: Type.Union([
      completeStage(completePublicApiData),
      partialStage(partialPublicApiData),
      failedStage,
      skippedStage,
    ]),
  },
  closed,
);

const failureStages = Type.Object(
  {
    contextDiscovery: Type.Union([completeStage(contextData), failedStage]),
    snapshotConstruction: Type.Union([failedStage, skippedStage]),
    runtimeResolution: Type.Union([failedStage, skippedStage]),
    typescriptResolution: Type.Union([failedStage, skippedStage]),
    publicApiModel: Type.Union([failedStage, skippedStage]),
  },
  closed,
);

const commonProperties = {
  schemaVersion: Type.Literal("1"),
  kind: Type.Literal("installed-package-investigation"),
  warnings: Type.Array(warning, { maxItems: 256 }),
  evidence: Type.Array(evidence, { maxItems: 2000 }),
  limits,
  metadata,
};

const successEnvelope = Type.Object(
  {
    ...commonProperties,
    context: normalizedContext,
    outcome: Type.Literal("success"),
    stages: successStages,
    failures: Type.Array(failure, { maxItems: 0 }),
  },
  closed,
);

const partialEnvelope = Type.Object(
  {
    ...commonProperties,
    context: normalizedContext,
    outcome: Type.Literal("partial"),
    stages: partialStages,
    failures: Type.Array(failure, { minItems: 1, maxItems: 32 }),
  },
  closed,
);

const failureEnvelope = Type.Object(
  {
    ...commonProperties,
    context: Type.Union([normalizedContext, Type.Null()]),
    outcome: Type.Literal("failure"),
    stages: failureStages,
    failures: Type.Array(failure, { minItems: 1, maxItems: 32 }),
  },
  closed,
);

/** @internal Individual variants keep runtime validation errors outcome-specific. */
export const installedPackageInvestigationV1VariantSchemas = {
  success: successEnvelope,
  partial: partialEnvelope,
  failure: failureEnvelope,
} as const;

export const installedPackageInvestigationV1Schema = Type.Union(
  [successEnvelope, partialEnvelope, failureEnvelope],
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "urn:package-spelunker:schema:installed-package-investigation:1",
    title: "Package Spelunker installed-package investigation v1",
  },
);

export type InstalledPackageInvestigationV1 = Static<typeof installedPackageInvestigationV1Schema>;
