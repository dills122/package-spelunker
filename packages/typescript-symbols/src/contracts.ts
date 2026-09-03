import type { PublicApiDataV1, PublicApiOmissionV1 } from "@package-spelunker/contracts";

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
