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
} from "./installed-package-investigation-v1.js";

const validator = Schema.Compile(installedPackageInvestigationV1Schema);
const successValidator = Schema.Compile(installedPackageInvestigationV1VariantSchemas.success);
const partialValidator = Schema.Compile(installedPackageInvestigationV1VariantSchemas.partial);
const failureValidator = Schema.Compile(installedPackageInvestigationV1VariantSchemas.failure);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaErrors(value: unknown): ContractValidationError[] {
  const [, errors] =
    isRecord(value) && value.outcome === "success"
      ? successValidator.Errors(value)
      : isRecord(value) && value.outcome === "partial"
        ? partialValidator.Errors(value)
        : isRecord(value) && value.outcome === "failure"
          ? failureValidator.Errors(value)
          : validator.Errors(value);
  return normalizeSchemaErrors(errors);
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
    location: { readonly path: string } | null,
    path: string,
  ): ContractValidationError[] => {
    if (location === null || isPortableRelativePath(location.path)) return [];
    return [
      {
        keyword: "contractPath",
        path: `${path}/path`,
        message: "Public API source locations must use portable package-relative paths.",
      },
    ];
  };

  for (const [symbolIndex, symbol] of stage.data.symbols.entries()) {
    const symbolPath = `/stages/publicApiModel/data/symbols/${symbolIndex}`;

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

function publicApiIdentityErrors(
  stage: Extract<
    InstalledPackageInvestigationV1["stages"]["publicApiModel"],
    { status: "complete" | "partial" }
  >,
): ContractValidationError[] {
  let previousName: string | undefined;
  const seenIds = new Set<string>();

  for (const [symbolIndex, symbol] of stage.data.symbols.entries()) {
    const path = `/stages/publicApiModel/data/symbols/${symbolIndex}/id`;
    let expectedId: string;
    try {
      expectedId = `${stage.data.entrypoint}#${encodeURIComponent(symbol.name)}`;
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
    if (previousName !== undefined && compareCodePointStrings(previousName, symbol.name) >= 0) {
      return [
        {
          keyword: "contractOrder",
          path,
          message: "Public symbols must be ordered by export name using Unicode code points.",
        },
      ];
    }

    previousName = symbol.name;
    seenIds.add(symbol.id);
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
