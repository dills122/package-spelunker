export {
  type InvalidTypeScriptConditionsFailure,
  type NormalizedTypeScriptConditions,
  normalizeTypeScriptConditions,
  type TypeScriptConditionNormalizationResult,
  type TypeScriptLookupKind,
} from "./conditions.js";
export {
  type ResolveTypeScriptDeclarationInput,
  resolveTypeScriptDeclaration,
  type SupportedTypeScriptModuleResolution,
  type TypeScriptProjectResolutionOptions,
  type TypeScriptResolution,
  type TypeScriptResolutionFailure,
  type TypeScriptResolutionFileHost,
  type TypeScriptResolutionLimits,
  type TypeScriptResolutionResult,
  type TypeScriptResolutionTraceKind,
  type TypeScriptResolutionTraceStep,
} from "./resolver.js";
