export interface ContractValidationError {
  readonly keyword: string;
  readonly path: string;
  readonly message: string;
}

export type ContractValidationResult<Value> =
  | { readonly valid: true; readonly value: Value }
  | { readonly valid: false; readonly errors: readonly ContractValidationError[] };

interface SchemaValidationError {
  readonly keyword: string;
  readonly instancePath: string;
}

export function normalizeSchemaErrors(
  errors: readonly SchemaValidationError[],
): ContractValidationError[] {
  const normalized = errors.map((error) => ({
    keyword: error.keyword,
    path: error.instancePath,
    message: `Value does not satisfy ${error.keyword}.`,
  }));
  return normalized.filter(
    (error, index) =>
      normalized.findIndex(
        (candidate) => candidate.keyword === error.keyword && candidate.path === error.path,
      ) === index,
  );
}
