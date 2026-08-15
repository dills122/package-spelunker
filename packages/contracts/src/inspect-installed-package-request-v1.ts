import Type, { type Static } from "typebox";
import Schema from "typebox/schema";

import { type ContractValidationResult, normalizeSchemaErrors } from "./contract-validation.js";
import { firstSliceV1LimitOverridesSchema } from "./resource-policy-v1.js";

const closed = { additionalProperties: false } as const;
const relativePath = Type.String({ minLength: 1, maxLength: 4096 });
const condition = Type.String({ minLength: 1, maxLength: 256 });
const runtimeLookupCondition = Type.Union([Type.Literal("import"), Type.Literal("require")]);

// Package names and optional subpaths only. URLs, protocols, absolute paths, and
// relative paths are intentionally excluded from this installed-package workflow.
const packageSpecifierPattern =
  "^(?:@[A-Za-z0-9][A-Za-z0-9._~-]*/[A-Za-z0-9][A-Za-z0-9._~-]*|[A-Za-z0-9][A-Za-z0-9._~-]*)(?:/[A-Za-z0-9][A-Za-z0-9._~-]*)*$";

export const inspectInstalledPackageRequestV1Schema = Type.Object(
  {
    schemaVersion: Type.Literal("1"),
    kind: Type.Literal("inspect-installed-package"),
    workspaceRoot: Type.String({ minLength: 1, maxLength: 4096 }),
    importer: relativePath,
    specifier: Type.String({ minLength: 1, maxLength: 512, pattern: packageSpecifierPattern }),
    runtimeConditions: Type.Array(condition, {
      maxItems: 64,
      uniqueItems: true,
      contains: runtimeLookupCondition,
      minContains: 1,
      maxContains: 1,
    }),
    typescriptConditions: Type.Array(condition, {
      maxItems: 64,
      uniqueItems: true,
      contains: runtimeLookupCondition,
      minContains: 1,
      maxContains: 1,
    }),
    tsconfigPath: Type.Optional(relativePath),
    limits: Type.Optional(firstSliceV1LimitOverridesSchema),
  },
  {
    ...closed,
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "urn:package-spelunker:schema:inspect-installed-package-request:1",
    title: "Package Spelunker installed-package request v1",
  },
);

export type InspectInstalledPackageRequestV1 = Static<
  typeof inspectInstalledPackageRequestV1Schema
>;

const validator = Schema.Compile(inspectInstalledPackageRequestV1Schema);

export function validateInspectInstalledPackageRequestV1(
  value: unknown,
): ContractValidationResult<InspectInstalledPackageRequestV1> {
  if (validator.Check(value)) {
    return { valid: true, value };
  }

  const [, errors] = validator.Errors(value);
  return { valid: false, errors: normalizeSchemaErrors(errors) };
}

export function isInspectInstalledPackageRequestV1(
  value: unknown,
): value is InspectInstalledPackageRequestV1 {
  return validator.Check(value);
}
