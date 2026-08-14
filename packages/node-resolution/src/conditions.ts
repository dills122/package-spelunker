export type RuntimeLookupKind = "import" | "require";

export interface NormalizedRuntimeConditions {
  readonly lookupKind: RuntimeLookupKind;
  readonly conditions: readonly string[];
}

export interface InvalidRuntimeConditionsFailure {
  readonly code: "invalid_request";
  readonly message: "Runtime conditions must select exactly one bounded Node lookup kind.";
}

export type RuntimeConditionNormalizationResult =
  | { readonly ok: true; readonly value: NormalizedRuntimeConditions }
  | { readonly ok: false; readonly failure: InvalidRuntimeConditionsFailure };

const lookupKinds = new Set<string>(["import", "require"]);

/** Derives one Node lookup kind and returns a canonical immutable active condition set. */
export function normalizeRuntimeConditions(
  conditions: readonly string[],
): RuntimeConditionNormalizationResult {
  if (
    conditions.length > 64 ||
    conditions.some(
      (condition) =>
        typeof condition !== "string" || condition.length === 0 || condition.length > 256,
    )
  ) {
    return invalidRuntimeConditions();
  }

  const selectedKinds = [...new Set(conditions.filter((condition) => lookupKinds.has(condition)))];
  const lookupKind = selectedKinds[0];
  if (selectedKinds.length !== 1 || (lookupKind !== "import" && lookupKind !== "require")) {
    return invalidRuntimeConditions();
  }

  const normalized = Object.freeze(
    [...new Set([...conditions, "node", lookupKind, "default"])].sort(compare),
  );
  return {
    ok: true,
    value: Object.freeze({ lookupKind, conditions: normalized }),
  };
}

function invalidRuntimeConditions(): RuntimeConditionNormalizationResult {
  return {
    ok: false,
    failure: {
      code: "invalid_request",
      message: "Runtime conditions must select exactly one bounded Node lookup kind.",
    },
  };
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
