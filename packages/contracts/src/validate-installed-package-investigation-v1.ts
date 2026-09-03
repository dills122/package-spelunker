import Schema from "typebox/schema";

import {
  type ContractValidationError,
  type ContractValidationResult,
  normalizeSchemaErrors,
} from "./contract-validation.js";
import {
  type InstalledPackageInvestigationV1,
  installedPackageInvestigationV1Schema,
  installedPackageInvestigationV1VariantSchemas,
  type PublicSymbolV1,
} from "./installed-package-investigation-v1.js";

const validator = Schema.Compile(installedPackageInvestigationV1Schema);
const successValidator = Schema.Compile(installedPackageInvestigationV1VariantSchemas.success);
const partialValidator = Schema.Compile(installedPackageInvestigationV1VariantSchemas.partial);
const failureValidator = Schema.Compile(installedPackageInvestigationV1VariantSchemas.failure);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaErrors(value: unknown): ContractValidationError[] {
  try {
    const [, errors] =
      isRecord(value) && value.outcome === "success"
        ? successValidator.Errors(value)
        : isRecord(value) && value.outcome === "partial"
          ? partialValidator.Errors(value)
          : isRecord(value) && value.outcome === "failure"
            ? failureValidator.Errors(value)
            : validator.Errors(value);
    return normalizeSchemaErrors(errors);
  } catch {
    return [
      {
        keyword: "schemaEvaluation",
        path: "",
        message: "Value could not be evaluated safely against the contract schema.",
      },
    ];
  }
}

function duplicateIdError(
  values: readonly { readonly id: string }[],
  path: string,
): ContractValidationError[] {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value.id)) {
      return [
        {
          keyword: "contractReference",
          path: `${path}/${index}/id`,
          message: "Contract IDs must be unique within an envelope.",
        },
      ];
    }
    seen.add(value.id);
  }
  return [];
}

function isPortableRelativePath(path: string): boolean {
  if (
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    path.includes("\\") ||
    path.includes("\0")
  ) {
    return false;
  }

  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function publicApiPathErrors(
  stage: Extract<
    InstalledPackageInvestigationV1["stages"]["publicApiModel"],
    { status: "complete" | "partial" }
  >,
): ContractValidationError[] {
  const checkLocation = (
    location: { readonly authority: "package" | "compiler-lib"; readonly path: string } | null,
    path: string,
  ): ContractValidationError[] => {
    if (location === null) return [];
    const compilerPathValid =
      location.authority === "package" ||
      /^lib(?:\.[a-z0-9]+)*\.d\.ts$/i.test(location.path.split("/").at(-1) ?? "");
    if (isPortableRelativePath(location.path) && compilerPathValid) return [];
    return [
      {
        keyword: "contractPath",
        path: `${path}/path`,
        message:
          "Public API source locations must use portable authority-relative paths and pinned compiler-lib names.",
      },
    ];
  };
  const stack = [...stage.data.symbols]
    .map((symbol, index) => ({
      symbol,
      symbolPath: `/stages/publicApiModel/data/symbols/${index}`,
    }))
    .reverse();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const { symbol, symbolPath } = current;
    for (const [locationIndex, location] of symbol.locations.entries()) {
      const errors = checkLocation(location, `${symbolPath}/locations/${locationIndex}`);
      if (errors.length > 0) return errors;
    }
    for (const [hopIndex, hop] of symbol.aliasChain.entries()) {
      const errors = checkLocation(hop.location, `${symbolPath}/aliasChain/${hopIndex}/location`);
      if (errors.length > 0) return errors;
    }
    for (const [signatureIndex, signature] of symbol.signatures.entries()) {
      const errors = checkLocation(
        signature.location,
        `${symbolPath}/signatures/${signatureIndex}/location`,
      );
      if (errors.length > 0) return errors;
    }
    for (const [memberIndex, member] of symbol.members.entries()) {
      const memberPath = `${symbolPath}/members/${memberIndex}`;
      for (const [locationIndex, location] of member.locations.entries()) {
        const errors = checkLocation(location, `${memberPath}/locations/${locationIndex}`);
        if (errors.length > 0) return errors;
      }
      for (const [signatureIndex, signature] of member.signatures.entries()) {
        const errors = checkLocation(
          signature.location,
          `${memberPath}/signatures/${signatureIndex}/location`,
        );
        if (errors.length > 0) return errors;
      }
    }
    for (const [heritageIndex, relation] of symbol.heritage.entries()) {
      const errors = checkLocation(
        relation.location,
        `${symbolPath}/heritage/${heritageIndex}/location`,
      );
      if (errors.length > 0) return errors;
    }
    for (let index = symbol.namespaceExports.length - 1; index >= 0; index -= 1) {
      const nested = symbol.namespaceExports[index];
      if (nested === undefined) continue;
      stack.push({ symbol: nested, symbolPath: `${symbolPath}/namespaceExports/${index}` });
    }
  }

  return [];
}

function compareCodePointStrings(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return leftPoints.length - rightPoints.length;
}

const publicMeaningOrder = ["type", "value", "namespace"] as const;
const publicDeclarationKindOrder = [
  "class",
  "interface",
  "function",
  "variable",
  "enum",
  "type-alias",
  "namespace",
] as const;
const memberDeclarationKindOrder = [
  "property",
  "method",
  "getter",
  "setter",
  "constructor",
  "index",
  "call",
  "construct",
] as const;

type PublicMember = PublicSymbolV1["members"][number];
type PublicSignature = PublicSymbolV1["signatures"][number];
type PublicLocation = PublicSymbolV1["locations"][number];

function canonicalSubsetError(
  values: readonly string[],
  order: readonly string[],
  path: string,
  description: string,
): ContractValidationError[] {
  const canonical = order.filter((value) => values.includes(value));
  if (
    canonical.length === values.length &&
    canonical.every((value, index) => value === values[index])
  ) {
    return [];
  }
  return [
    {
      keyword: "contractOrder",
      path,
      message: `${description} must use canonical contract order.`,
    },
  ];
}

function comparePublicLocations(left: PublicLocation, right: PublicLocation): number {
  return (
    compareCodePointStrings(left.authority, right.authority) ||
    compareCodePointStrings(left.path, right.path) ||
    left.line - right.line ||
    left.column - right.column
  );
}

function compareOptionalPublicLocations(
  left: PublicLocation | undefined,
  right: PublicLocation | undefined,
): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  return comparePublicLocations(left, right);
}

function locationOrderErrors(
  locations: readonly PublicLocation[],
  path: string,
): ContractValidationError[] {
  for (let index = 1; index < locations.length; index += 1) {
    const previous = locations[index - 1];
    const current = locations[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      comparePublicLocations(previous, current) >= 0
    ) {
      return [
        {
          keyword: "contractOrder",
          path: `${path}/${index}`,
          message: "Public API locations must be unique and canonically ordered.",
        },
      ];
    }
  }
  return [];
}

function signatureOrdinalErrors(
  signatures: readonly PublicSignature[],
  path: string,
): ContractValidationError[] {
  let callOrdinal = 0;
  let constructOrdinal = 0;
  for (const [index, signature] of signatures.entries()) {
    const expected = signature.kind === "call" ? callOrdinal++ : constructOrdinal++;
    if (signature.ordinal !== expected) {
      return [
        {
          keyword: "contractOrder",
          path: `${path}/${index}/ordinal`,
          message: "Public API signature ordinals must be contiguous within each signature kind.",
        },
      ];
    }
  }
  return [];
}

function comparePublicMembers(left: PublicMember, right: PublicMember): number {
  const scope = (left.scope === "static" ? 0 : 1) - (right.scope === "static" ? 0 : 1);
  if (scope !== 0) return scope;
  const name = compareCodePointStrings(left.name, right.name);
  if (name !== 0) return name;
  return (
    memberDeclarationKindOrder.indexOf(left.declarationKinds[0] ?? "property") -
      memberDeclarationKindOrder.indexOf(right.declarationKinds[0] ?? "property") ||
    compareOptionalPublicLocations(left.locations[0], right.locations[0])
  );
}

function publicApiSymbolOrderErrors(
  symbol: PublicSymbolV1,
  path: string,
): ContractValidationError[] {
  const directChecks = [
    canonicalSubsetError(
      symbol.meanings,
      publicMeaningOrder,
      `${path}/meanings`,
      "Symbol meanings",
    ),
    canonicalSubsetError(
      symbol.declarationKinds,
      publicDeclarationKindOrder,
      `${path}/declarationKinds`,
      "Symbol declaration kinds",
    ),
    locationOrderErrors(symbol.locations, `${path}/locations`),
    signatureOrdinalErrors(symbol.signatures, `${path}/signatures`),
  ].find((errors) => errors.length > 0);
  if (directChecks !== undefined) return directChecks;

  for (const [index, member] of symbol.members.entries()) {
    const memberPath = `${path}/members/${index}`;
    const memberChecks = [
      canonicalSubsetError(
        member.meanings,
        publicMeaningOrder,
        `${memberPath}/meanings`,
        "Member meanings",
      ),
      canonicalSubsetError(
        member.declarationKinds,
        memberDeclarationKindOrder,
        `${memberPath}/declarationKinds`,
        "Member declaration kinds",
      ),
      locationOrderErrors(member.locations, `${memberPath}/locations`),
      signatureOrdinalErrors(member.signatures, `${memberPath}/signatures`),
    ].find((errors) => errors.length > 0);
    if (memberChecks !== undefined) return memberChecks;
    const previous = symbol.members[index - 1];
    if (previous !== undefined && comparePublicMembers(previous, member) >= 0) {
      return [
        {
          keyword: "contractOrder",
          path: memberPath,
          message: "Public API members must be unique and canonically ordered.",
        },
      ];
    }
  }
  return [];
}

function publicApiIdentityErrors(
  stage: Extract<
    InstalledPackageInvestigationV1["stages"]["publicApiModel"],
    { status: "complete" | "partial" }
  >,
): ContractValidationError[] {
  const seenIds = new Set<string>();
  interface Frame {
    readonly symbols: readonly PublicSymbolV1[];
    readonly parentId: string | null;
    readonly basePath: string;
    index: number;
    previousName: string | undefined;
  }
  const stack: Frame[] = [
    {
      symbols: stage.data.symbols,
      parentId: null,
      basePath: "/stages/publicApiModel/data/symbols",
      index: 0,
      previousName: undefined,
    },
  ];
  while (stack.length > 0) {
    const frame = stack.at(-1);
    if (frame === undefined) break;
    if (frame.index >= frame.symbols.length) {
      stack.pop();
      continue;
    }
    const symbolIndex = frame.index;
    frame.index += 1;
    const symbol = frame.symbols[symbolIndex];
    if (symbol === undefined) continue;
    const path = `${frame.basePath}/${symbolIndex}/id`;
    let expectedId: string;
    try {
      expectedId =
        frame.parentId === null
          ? `${stage.data.entrypoint}#${encodeURIComponent(symbol.name)}`
          : `${frame.parentId}/${encodeURIComponent(symbol.name)}`;
    } catch {
      return [
        {
          keyword: "contractIdentity",
          path,
          message: "Public export names must be valid Unicode strings.",
        },
      ];
    }

    if (symbol.id !== expectedId || seenIds.has(symbol.id)) {
      return [
        {
          keyword: "contractIdentity",
          path,
          message: "Public symbol IDs must uniquely derive from the entrypoint and export name.",
        },
      ];
    }
    if (
      frame.previousName !== undefined &&
      compareCodePointStrings(frame.previousName, symbol.name) >= 0
    ) {
      return [
        {
          keyword: "contractOrder",
          path,
          message: "Public symbols must be ordered by export name using Unicode code points.",
        },
      ];
    }

    const orderErrors = publicApiSymbolOrderErrors(symbol, `${frame.basePath}/${symbolIndex}`);
    if (orderErrors.length > 0) return orderErrors;

    if (symbol.namespaceExports.length > 0 && !symbol.declarationKinds.includes("namespace")) {
      return [
        {
          keyword: "contractNamespace",
          path: `${frame.basePath}/${symbolIndex}/namespaceExports`,
          message: "Only namespace-bearing symbols may contain namespace exports.",
        },
      ];
    }
    frame.previousName = symbol.name;
    seenIds.add(symbol.id);
    if (symbol.namespaceExports.length > 0) {
      stack.push({
        symbols: symbol.namespaceExports,
        parentId: symbol.id,
        basePath: `${frame.basePath}/${symbolIndex}/namespaceExports`,
        index: 0,
        previousName: undefined,
      });
    }
  }
  return [];
}

const maximumPublicApiDisplayBytes = 4_096;
const maximumPublicApiDocumentationBytes = 1_024;
const firstSliceRelativePathBytes = 1_024;
const firstSliceGraphDepth = 128;
const firstSliceSignaturesPerSymbol = 256;

function byteBoundError(
  value: string | null,
  maximumBytes: number,
  path: string,
  description: string,
): ContractValidationError[] {
  if (value === null || utf8ByteLength(value) <= maximumBytes) return [];
  return [
    {
      keyword: "contractByteLength",
      path,
      message: `${description} must fit within ${maximumBytes} UTF-8 bytes.`,
    },
  ];
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function typeParameterByteErrors(
  parameters: readonly { readonly constraint: string | null; readonly default: string | null }[],
  basePath: string,
): ContractValidationError[] {
  for (const [index, parameter] of parameters.entries()) {
    const parameterPath = `${basePath}/${index}`;
    const errors = [
      byteBoundError(
        parameter.constraint,
        maximumPublicApiDisplayBytes,
        `${parameterPath}/constraint`,
        "Type-parameter constraint",
      ),
      byteBoundError(
        parameter.default,
        maximumPublicApiDisplayBytes,
        `${parameterPath}/default`,
        "Type-parameter default",
      ),
    ].find((candidate) => candidate.length > 0);
    if (errors !== undefined) return errors;
  }
  return [];
}

function publicApiBoundErrors(
  stage: Extract<
    InstalledPackageInvestigationV1["stages"]["publicApiModel"],
    { status: "complete" | "partial" }
  >,
): { readonly count: number; readonly errors: ContractValidationError[] } {
  interface Frame {
    readonly symbol: PublicSymbolV1;
    readonly path: string;
    readonly depth: number;
  }
  const stack: Frame[] = stage.data.symbols
    .map((symbol, index) => ({
      symbol,
      path: `/stages/publicApiModel/data/symbols/${index}`,
      depth: 0,
    }))
    .reverse();
  let count = 0;
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    const { symbol, path, depth } = frame;
    count += 1 + symbol.members.length;
    if (depth > firstSliceGraphDepth) {
      return {
        count,
        errors: [
          {
            keyword: "contractLimit",
            path,
            message: "Public API namespace depth exceeds first-slice graph policy.",
          },
        ],
      };
    }
    if (
      symbol.aliasChain.length > firstSliceGraphDepth ||
      symbol.heritage.length > firstSliceGraphDepth ||
      depth + symbol.aliasChain.length + (symbol.heritage.length > 0 ? 1 : 0) > firstSliceGraphDepth
    ) {
      return {
        count,
        errors: [
          {
            keyword: "contractLimit",
            path,
            message: "Public API graph fields exceed first-slice graph policy.",
          },
        ],
      };
    }
    if (
      symbol.signatures.length > firstSliceSignaturesPerSymbol ||
      symbol.typeParameters.length > firstSliceSignaturesPerSymbol
    ) {
      return {
        count,
        errors: [
          {
            keyword: "contractLimit",
            path,
            message: "Public API symbol exceeds first-slice per-symbol signature policy.",
          },
        ],
      };
    }

    const symbolTextChecks = [
      byteBoundError(
        symbol.display,
        maximumPublicApiDisplayBytes,
        `${path}/display`,
        "Public API display",
      ),
      byteBoundError(
        symbol.documentation,
        maximumPublicApiDocumentationBytes,
        `${path}/documentation`,
        "Public API documentation",
      ),
      byteBoundError(
        symbol.deprecation?.message ?? null,
        maximumPublicApiDocumentationBytes,
        `${path}/deprecation/message`,
        "Public API deprecation message",
      ),
    ].find((errors) => errors.length > 0);
    if (symbolTextChecks !== undefined) return { count, errors: symbolTextChecks };

    const symbolTypeParameterErrors = typeParameterByteErrors(
      symbol.typeParameters,
      `${path}/typeParameters`,
    );
    if (symbolTypeParameterErrors.length > 0) {
      return { count, errors: symbolTypeParameterErrors };
    }
    for (const [locationIndex, location] of symbol.locations.entries()) {
      const errors = byteBoundError(
        location.path,
        firstSliceRelativePathBytes,
        `${path}/locations/${locationIndex}/path`,
        "Public API source path",
      );
      if (errors.length > 0) return { count, errors };
    }
    for (const [hopIndex, hop] of symbol.aliasChain.entries()) {
      const errors = byteBoundError(
        hop.location.path,
        firstSliceRelativePathBytes,
        `${path}/aliasChain/${hopIndex}/location/path`,
        "Public API alias path",
      );
      if (errors.length > 0) return { count, errors };
    }
    for (const [signatureIndex, signature] of symbol.signatures.entries()) {
      const signaturePath = `${path}/signatures/${signatureIndex}`;
      if (signature.typeParameters.length > firstSliceSignaturesPerSymbol) {
        return {
          count,
          errors: [
            {
              keyword: "contractLimit",
              path: `${signaturePath}/typeParameters`,
              message: "Public API signature exceeds first-slice type-parameter policy.",
            },
          ],
        };
      }
      const displayErrors = byteBoundError(
        signature.display,
        maximumPublicApiDisplayBytes,
        `${signaturePath}/display`,
        "Public API signature display",
      );
      if (displayErrors.length > 0) return { count, errors: displayErrors };
      const typeParameterErrors = typeParameterByteErrors(
        signature.typeParameters,
        `${signaturePath}/typeParameters`,
      );
      if (typeParameterErrors.length > 0) return { count, errors: typeParameterErrors };
      if (signature.location !== null) {
        const locationErrors = byteBoundError(
          signature.location.path,
          firstSliceRelativePathBytes,
          `${signaturePath}/location/path`,
          "Public API signature path",
        );
        if (locationErrors.length > 0) return { count, errors: locationErrors };
      }
    }
    for (const [memberIndex, member] of symbol.members.entries()) {
      const memberPath = `${path}/members/${memberIndex}`;
      if (member.signatures.length > firstSliceSignaturesPerSymbol) {
        return {
          count,
          errors: [
            {
              keyword: "contractLimit",
              path: `${memberPath}/signatures`,
              message: "Public API member exceeds first-slice per-symbol signature policy.",
            },
          ],
        };
      }
      const memberTextChecks = [
        byteBoundError(
          member.display,
          maximumPublicApiDisplayBytes,
          `${memberPath}/display`,
          "Public API member display",
        ),
        byteBoundError(
          member.documentation,
          maximumPublicApiDocumentationBytes,
          `${memberPath}/documentation`,
          "Public API member documentation",
        ),
        byteBoundError(
          member.deprecation?.message ?? null,
          maximumPublicApiDocumentationBytes,
          `${memberPath}/deprecation/message`,
          "Public API member deprecation message",
        ),
      ].find((errors) => errors.length > 0);
      if (memberTextChecks !== undefined) return { count, errors: memberTextChecks };
      for (const [locationIndex, location] of member.locations.entries()) {
        const errors = byteBoundError(
          location.path,
          firstSliceRelativePathBytes,
          `${memberPath}/locations/${locationIndex}/path`,
          "Public API member path",
        );
        if (errors.length > 0) return { count, errors };
      }
      for (const [signatureIndex, signature] of member.signatures.entries()) {
        const signaturePath = `${memberPath}/signatures/${signatureIndex}`;
        if (signature.typeParameters.length > firstSliceSignaturesPerSymbol) {
          return {
            count,
            errors: [
              {
                keyword: "contractLimit",
                path: `${signaturePath}/typeParameters`,
                message: "Public API member signature exceeds first-slice type-parameter policy.",
              },
            ],
          };
        }
        const displayErrors = byteBoundError(
          signature.display,
          maximumPublicApiDisplayBytes,
          `${signaturePath}/display`,
          "Public API member signature display",
        );
        if (displayErrors.length > 0) return { count, errors: displayErrors };
        const typeParameterErrors = typeParameterByteErrors(
          signature.typeParameters,
          `${signaturePath}/typeParameters`,
        );
        if (typeParameterErrors.length > 0) return { count, errors: typeParameterErrors };
        if (signature.location !== null) {
          const locationErrors = byteBoundError(
            signature.location.path,
            firstSliceRelativePathBytes,
            `${signaturePath}/location/path`,
            "Public API member signature path",
          );
          if (locationErrors.length > 0) return { count, errors: locationErrors };
        }
      }
    }
    for (const [heritageIndex, relation] of symbol.heritage.entries()) {
      const heritagePath = `${path}/heritage/${heritageIndex}`;
      const displayErrors = byteBoundError(
        relation.display,
        maximumPublicApiDisplayBytes,
        `${heritagePath}/display`,
        "Public API heritage display",
      );
      if (displayErrors.length > 0) return { count, errors: displayErrors };
      if (relation.location !== null) {
        const locationErrors = byteBoundError(
          relation.location.path,
          firstSliceRelativePathBytes,
          `${heritagePath}/location/path`,
          "Public API heritage path",
        );
        if (locationErrors.length > 0) return { count, errors: locationErrors };
      }
    }
    for (let index = symbol.namespaceExports.length - 1; index >= 0; index -= 1) {
      const nested = symbol.namespaceExports[index];
      if (nested === undefined) continue;
      stack.push({ symbol: nested, path: `${path}/namespaceExports/${index}`, depth: depth + 1 });
    }
  }
  return { count, errors: [] };
}

function resourcePolicyErrors(value: InstalledPackageInvestigationV1): ContractValidationError[] {
  const failureLimits = new Set(
    value.failures.flatMap((failure) =>
      failure.code === "resource_limit_exceeded" ? [failure.limit] : [],
    ),
  );
  for (const limit of value.limits.exceeded) {
    if (!failureLimits.has(limit)) {
      return [
        {
          keyword: "contractLimit",
          path: "/limits/exceeded",
          message: "Each exceeded limit must have a matching resource-limit failure.",
        },
      ];
    }
  }
  for (const limit of failureLimits) {
    if (!value.limits.exceeded.includes(limit)) {
      return [
        {
          keyword: "contractLimit",
          path: "/limits/exceeded",
          message: "Each resource-limit failure must appear in limits.exceeded.",
        },
      ];
    }
  }

  const measuredLimits = [
    ["artifactBytesRead", "maxArtifactBytesRead"],
    ["filesVisited", "maxFilesVisited"],
    ["declarationFiles", "maxDeclarationFiles"],
    ["publicSymbols", "maxPublicSymbols"],
    ["evidenceEntries", "maxEvidenceEntries"],
    ["wallTimeMs", "maxWallTimeMs"],
  ] as const;
  for (const [usageName, limitName] of measuredLimits) {
    const exceeded = value.limits.usage[usageName] > value.limits.applied[limitName];
    if (exceeded !== value.limits.exceeded.includes(limitName)) {
      return [
        {
          keyword: "contractLimit",
          path: `/limits/usage/${usageName}`,
          message: "Measured usage and limits.exceeded must agree with applied limits.",
        },
      ];
    }
  }
  if (
    value.limits.usage.evidenceEntries < value.evidence.length ||
    (!value.limits.exceeded.includes("maxEvidenceEntries") &&
      value.limits.usage.evidenceEntries !== value.evidence.length)
  ) {
    return [
      {
        keyword: "contractLimit",
        path: "/limits/usage/evidenceEntries",
        message:
          "Evidence usage must cover serialized evidence and equal it when no evidence limit was exceeded.",
      },
    ];
  }
  for (const [index, item] of value.evidence.entries()) {
    const descriptionErrors = byteBoundError(
      item.description,
      1_024,
      `/evidence/${index}/description`,
      "Evidence description",
    );
    if (descriptionErrors.length > 0) return descriptionErrors;
    if (item.path !== undefined) {
      const pathErrors = byteBoundError(
        item.path,
        firstSliceRelativePathBytes,
        `/evidence/${index}/path`,
        "Evidence path",
      );
      if (pathErrors.length > 0) return pathErrors;
    }
  }

  const stage = value.stages.publicApiModel;
  if (stage.status !== "complete" && stage.status !== "partial") return [];
  const bounded = publicApiBoundErrors(stage);
  if (bounded.errors.length > 0) return bounded.errors;
  if (bounded.count > value.limits.applied.maxPublicSymbols) {
    return [
      {
        keyword: "contractLimit",
        path: "/stages/publicApiModel/data/symbols",
        message: "Serialized public symbols exceed the applied aggregate symbol limit.",
      },
    ];
  }
  if (value.limits.usage.publicSymbols < bounded.count) {
    return [
      {
        keyword: "contractLimit",
        path: "/limits/usage/publicSymbols",
        message: "Public-symbol usage cannot be lower than serialized aggregate symbol count.",
      },
    ];
  }
  if (stage.status === "complete" && value.limits.usage.publicSymbols !== bounded.count) {
    return [
      {
        keyword: "contractLimit",
        path: "/limits/usage/publicSymbols",
        message: "Complete public API usage must equal its serialized aggregate symbol count.",
      },
    ];
  }
  return [];
}

function publicApiOmissionErrors(
  value: InstalledPackageInvestigationV1,
): ContractValidationError[] {
  if (value.outcome !== "partial" || value.stages.publicApiModel.status !== "partial") return [];

  const stage = value.stages.publicApiModel;
  const omission = stage.data.omission;
  const failure = value.failures.find(({ id }) => id === stage.failureId);
  if (failure === undefined) return [];

  const expectedLimit = {
    symbols: "maxPublicSymbols",
    signatures: "maxSignaturesPerSymbol",
    graph: "maxGraphDepth",
    "external-declaration": null,
  }[omission.kind];
  const resourceOmissionMatches =
    expectedLimit !== null &&
    failure.code === "resource_limit_exceeded" &&
    failure.limit === expectedLimit &&
    omission.limit === expectedLimit;
  const externalOmissionMatches =
    expectedLimit === null && failure.code === "unsupported_context" && omission.limit === null;

  if (
    failure.stage === "public_api_model" &&
    (resourceOmissionMatches || externalOmissionMatches)
  ) {
    return [];
  }

  return [
    {
      keyword: "contractOmission",
      path: "/stages/publicApiModel/data/omission",
      message: "Public API omission metadata must agree with its referenced failure.",
    },
  ];
}

function referenceErrors(value: InstalledPackageInvestigationV1): ContractValidationError[] {
  if (
    value.outcome === "partial" &&
    Object.values(value.stages).every((stage) => stage.status === "complete")
  ) {
    return [
      {
        keyword: "contractOutcome",
        path: "/stages",
        message: "A partial result must contain at least one failed or skipped stage.",
      },
    ];
  }

  const duplicateFailures = duplicateIdError(value.failures, "/failures");
  if (duplicateFailures.length > 0) return duplicateFailures;

  const duplicateEvidence = duplicateIdError(value.evidence, "/evidence");
  if (duplicateEvidence.length > 0) return duplicateEvidence;

  const failureIds = new Set(value.failures.map((failure) => failure.id));
  const evidenceIds = new Set(value.evidence.map((item) => item.id));

  for (const [stageName, stage] of Object.entries(value.stages)) {
    if (
      (stage.status === "failed" || stage.status === "partial") &&
      !failureIds.has(stage.failureId)
    ) {
      return [
        {
          keyword: "contractReference",
          path: `/stages/${stageName}/failureId`,
          message: "Stage failureId must reference a declared failure.",
        },
      ];
    }
    if (stage.status === "skipped" && !failureIds.has(stage.becauseFailureId)) {
      return [
        {
          keyword: "contractReference",
          path: `/stages/${stageName}/becauseFailureId`,
          message: "Skipped stage must reference the failure that caused it.",
        },
      ];
    }
    if (stage.status === "complete" || stage.status === "partial") {
      for (const [index, evidenceRef] of stage.evidenceRefs.entries()) {
        if (!evidenceIds.has(evidenceRef)) {
          return [
            {
              keyword: "contractReference",
              path: `/stages/${stageName}/evidenceRefs/${index}`,
              message: "Stage evidenceRefs must reference declared evidence.",
            },
          ];
        }
      }
    }
  }

  const publicApiStage = value.stages.publicApiModel;
  if (publicApiStage.status === "complete" || publicApiStage.status === "partial") {
    const identityErrors = publicApiIdentityErrors(publicApiStage);
    if (identityErrors.length > 0) return identityErrors;

    const pathErrors = publicApiPathErrors(publicApiStage);
    if (pathErrors.length > 0) return pathErrors;
  }

  const omissionErrors = publicApiOmissionErrors(value);
  if (omissionErrors.length > 0) return omissionErrors;

  const limitErrors = resourcePolicyErrors(value);
  if (limitErrors.length > 0) return limitErrors;

  for (const [warningIndex, warning] of value.warnings.entries()) {
    for (const [referenceIndex, evidenceRef] of warning.evidenceRefs.entries()) {
      if (!evidenceIds.has(evidenceRef)) {
        return [
          {
            keyword: "contractReference",
            path: `/warnings/${warningIndex}/evidenceRefs/${referenceIndex}`,
            message: "Warning evidenceRefs must reference declared evidence.",
          },
        ];
      }
    }
  }

  return [];
}

export function validateInstalledPackageInvestigationV1(
  value: unknown,
): ContractValidationResult<InstalledPackageInvestigationV1> {
  const errors = schemaErrors(value);
  if (errors.length > 0) return { valid: false, errors };

  const validValue = value as InstalledPackageInvestigationV1;
  const referenceValidationErrors = referenceErrors(validValue);
  return referenceValidationErrors.length > 0
    ? { valid: false, errors: referenceValidationErrors }
    : { valid: true, value: validValue };
}

export function isInstalledPackageInvestigationV1(
  value: unknown,
): value is InstalledPackageInvestigationV1 {
  return validateInstalledPackageInvestigationV1(value).valid;
}
