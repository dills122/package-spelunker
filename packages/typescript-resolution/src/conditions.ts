export type TypeScriptLookupKind = "import" | "require";

export interface NormalizedTypeScriptConditions {
  readonly lookupKind: TypeScriptLookupKind;
  readonly conditions: readonly string[];
  readonly customConditions: readonly string[];
}

export interface InvalidTypeScriptConditionsFailure {
  readonly code: "invalid_request";
  readonly message: "TypeScript conditions must select one bounded lookup kind.";
}

export type TypeScriptConditionNormalizationResult =
  | { readonly ok: true; readonly value: NormalizedTypeScriptConditions }
  | { readonly ok: false; readonly failure: InvalidTypeScriptConditionsFailure };

const lookupKinds = new Set<string>(["import", "require"]);
const compilerOwnedConditions = new Set<string>(["types", "node", "import", "require", "default"]);

/** Normalizes one explicit lookup kind and bounded project/request custom conditions. */
export function normalizeTypeScriptConditions(
  requestConditions: readonly string[],
  projectConditions: readonly string[] = [],
): TypeScriptConditionNormalizationResult {
  if (!validConditionList(requestConditions) || !validConditionList(projectConditions)) {
    return invalidTypeScriptConditions();
  }

  const selectedKinds = [
    ...new Set(requestConditions.filter((condition) => lookupKinds.has(condition))),
  ];
  const lookupKind = selectedKinds[0];
  if (selectedKinds.length !== 1 || (lookupKind !== "import" && lookupKind !== "require")) {
    return invalidTypeScriptConditions();
  }

  const customConditions = Object.freeze(
    [...new Set([...projectConditions, ...requestConditions])]
      .filter((condition) => !compilerOwnedConditions.has(condition))
      .sort(compare),
  );
  const conditions = Object.freeze(
    [...customConditions, "types", "node", lookupKind, "default"].sort(compare),
  );
  if (conditions.length > 64) return invalidTypeScriptConditions();

  return {
    ok: true,
    value: Object.freeze({ lookupKind, conditions, customConditions }),
  };
}

function validConditionList(conditions: readonly string[]): boolean {
  return (
    conditions.length <= 64 &&
    conditions.every(
      (condition) =>
        typeof condition === "string" && condition.length > 0 && condition.length <= 256,
    )
  );
}

function invalidTypeScriptConditions(): TypeScriptConditionNormalizationResult {
  return {
    ok: false,
    failure: {
      code: "invalid_request",
      message: "TypeScript conditions must select one bounded lookup kind.",
    },
  };
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
