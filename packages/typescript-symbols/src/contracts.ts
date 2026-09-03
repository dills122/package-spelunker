export interface PublicApiModelFileHost {
  readonly currentDirectory: string;
  fileExists(path: string): boolean;
  readFile(path: string): string | undefined;
  directoryExists(path: string): boolean;
  getDirectories(path: string): readonly string[];
  realpath(path: string): string;
}

export interface PublicApiModelLimits {
  readonly maxDeclarationFiles: number;
  readonly maxGraphDepth: number;
  readonly maxPublicSymbols: number;
  readonly maxSignaturesPerSymbol: number;
}

export interface ModelPublicApiInput {
  readonly snapshotId: string;
  readonly entrypoint: string;
  readonly declarationTarget: string;
  readonly packageRoot: string;
  readonly compilerVersion: string;
  readonly projectContextHash: string;
  readonly host: PublicApiModelFileHost;
  readonly compilerLibRoot?: string | null;
  readonly defaultLibFileName?: string | null;
  readonly limits?: Partial<PublicApiModelLimits>;
  readonly signal?: AbortSignal;
}

export interface SourceLocationV1 {
  readonly path: string;
  readonly line: number;
  readonly column: number;
}

export interface TypeParameterV1 {
  readonly name: string;
  readonly constraint: string | null;
  readonly default: string | null;
}

export interface SignatureV1 {
  readonly kind: "call" | "construct";
  readonly ordinal: number;
  readonly display: string;
  readonly typeParameters: readonly TypeParameterV1[];
  readonly location: SourceLocationV1 | null;
}

export interface DeprecationV1 {
  readonly message: string | null;
}

export type SymbolMeaningV1 = "type" | "value" | "namespace";

export interface MemberV1 {
  readonly name: string;
  readonly meanings: readonly SymbolMeaningV1[];
  readonly declarationKinds: readonly (
    | "property"
    | "method"
    | "getter"
    | "setter"
    | "constructor"
    | "index"
    | "call"
    | "construct"
  )[];
  readonly scope: "static" | "instance";
  readonly visibility: "public" | "protected" | "private" | "unknown";
  readonly optional: boolean;
  readonly readonly: boolean;
  readonly display: string | null;
  readonly signatures: readonly SignatureV1[];
  readonly locations: readonly SourceLocationV1[];
  readonly documentation: string | null;
  readonly deprecation: DeprecationV1 | null;
}

export interface AliasHopV1 {
  readonly targetName: string;
  readonly sourceModule: string | null;
  readonly location: SourceLocationV1;
}

export interface HeritageV1 {
  readonly kind: "extends" | "implements";
  readonly display: string;
  readonly location: SourceLocationV1 | null;
}

export interface PublicSymbolV1 {
  readonly id: string;
  readonly name: string;
  readonly meanings: readonly SymbolMeaningV1[];
  readonly declarationKinds: readonly (
    | "class"
    | "interface"
    | "function"
    | "variable"
    | "enum"
    | "type-alias"
    | "namespace"
  )[];
  readonly display: string | null;
  readonly aliasChain: readonly AliasHopV1[];
  readonly locations: readonly SourceLocationV1[];
  readonly typeParameters: readonly TypeParameterV1[];
  readonly signatures: readonly SignatureV1[];
  readonly members: readonly MemberV1[];
  readonly heritage: readonly HeritageV1[];
  readonly documentation: string | null;
  readonly deprecation: DeprecationV1 | null;
}

export interface PublicApiOmissionV1 {
  readonly kind: "symbols" | "signatures" | "graph" | "external-declaration";
  readonly limit: "maxPublicSymbols" | "maxSignaturesPerSymbol" | "maxGraphDepth" | null;
  readonly omittedCount: number;
  readonly subjectId: string | null;
}

export interface PublicApiDataV1 {
  readonly entrypoint: string;
  readonly symbols: readonly PublicSymbolV1[];
  readonly omission: PublicApiOmissionV1 | null;
}

export type PublicApiModelFailure =
  | {
      readonly code: "invalid_request";
      readonly message: "Public API modeling input is not valid bounded package context.";
    }
  | {
      readonly code: "unsupported_context";
      readonly message:
        | "Public API reaches a declaration outside the admitted package snapshot."
        | "Public API contains compiler semantics that cannot be isolated safely.";
    }
  | {
      readonly code: "malformed_artifact";
      readonly message:
        | "Selected public API declaration is missing from the admitted snapshot."
        | "Selected public API declarations are not valid TypeScript.";
    }
  | {
      readonly code: "resource_limit_exceeded";
      readonly message:
        | "Public API modeling exceeded its declaration-file budget."
        | "Public API modeling exceeded its graph-depth budget."
        | "Public API modeling exceeded its public-symbol budget."
        | "Public API modeling exceeded its per-symbol signature budget.";
      readonly limit:
        | "maxDeclarationFiles"
        | "maxGraphDepth"
        | "maxPublicSymbols"
        | "maxSignaturesPerSymbol";
    }
  | {
      readonly code: "cancelled";
      readonly message: "Public API modeling was cancelled.";
    }
  | {
      readonly code: "analysis_failed";
      readonly message: "Public API modeling could not complete safely.";
    };

interface PublicApiModelIdentity {
  readonly snapshotId: string;
  readonly compilerVersion: string;
  readonly projectContextHash: string;
  readonly usage: {
    readonly declarationFiles: number;
    readonly publicSymbols: number;
  };
}

export type PublicApiModel =
  | (PublicApiModelIdentity & {
      readonly status: "complete";
      readonly data: PublicApiDataV1 & { readonly omission: null };
    })
  | (PublicApiModelIdentity & {
      readonly status: "partial";
      readonly data: PublicApiDataV1 & { readonly omission: PublicApiOmissionV1 };
      readonly failure: Extract<
        PublicApiModelFailure,
        { readonly code: "resource_limit_exceeded" | "unsupported_context" }
      >;
    });

export type PublicApiModelResult =
  | { readonly ok: true; readonly value: PublicApiModel }
  | { readonly ok: false; readonly failure: PublicApiModelFailure };
