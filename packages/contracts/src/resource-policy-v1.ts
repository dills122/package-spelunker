import Type, { type Static } from "typebox";

const closed = { additionalProperties: false } as const;

export const firstSliceV1LimitNameSchema = Type.Union([
  Type.Literal("maxManifestBytes"),
  Type.Literal("maxLockfileBytes"),
  Type.Literal("maxArtifactFileBytes"),
  Type.Literal("maxArtifactBytesRead"),
  Type.Literal("maxRelativePathBytes"),
  Type.Literal("maxPathSegments"),
  Type.Literal("maxSymlinkHops"),
  Type.Literal("maxFilesVisited"),
  Type.Literal("maxExportMapNodes"),
  Type.Literal("maxResolverTraceSteps"),
  Type.Literal("maxDeclarationFiles"),
  Type.Literal("maxGraphDepth"),
  Type.Literal("maxPublicSymbols"),
  Type.Literal("maxSignaturesPerSymbol"),
  Type.Literal("maxEvidenceEntries"),
  Type.Literal("maxEvidenceDescriptionBytes"),
  Type.Literal("maxEvidenceBytes"),
  Type.Literal("maxOutputBytes"),
  Type.Literal("maxWallTimeMs"),
  Type.Literal("maxCompilerMemoryBytes"),
  Type.Literal("maxCancellationGraceMs"),
  Type.Literal("maxConcurrentFileReads"),
]);

const callerLimitSchemas = {
  maxArtifactBytesRead: Type.Integer({ minimum: 1, maximum: 536870912 }),
  maxFilesVisited: Type.Integer({ minimum: 1, maximum: 50000 }),
  maxDeclarationFiles: Type.Integer({ minimum: 1, maximum: 16384 }),
  maxPublicSymbols: Type.Integer({ minimum: 1, maximum: 200000 }),
  maxEvidenceEntries: Type.Integer({ minimum: 1, maximum: 10000 }),
  maxOutputBytes: Type.Integer({ minimum: 65536, maximum: 33554432 }),
  maxWallTimeMs: Type.Integer({ minimum: 1, maximum: 300000 }),
} as const;

export const firstSliceV1AppliedLimitsSchema = Type.Object(callerLimitSchemas, closed);

export const firstSliceV1LimitOverridesSchema = Type.Partial(
  Type.Object(callerLimitSchemas, closed),
  closed,
);

export type FirstSliceV1LimitName = Static<typeof firstSliceV1LimitNameSchema>;
export type FirstSliceV1AppliedLimits = Static<typeof firstSliceV1AppliedLimitsSchema>;
export type FirstSliceV1LimitOverrides = Static<typeof firstSliceV1LimitOverridesSchema>;
