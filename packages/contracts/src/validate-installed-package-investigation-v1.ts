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
    if (stage.status === "failed" && !failureIds.has(stage.failureId)) {
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
    if (stage.status === "complete") {
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
