import { posix } from "node:path";

import ts from "@typescript/typescript6";

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

interface NormalizedInput {
  readonly snapshotId: string;
  readonly entrypoint: string;
  readonly declarationTarget: string;
  readonly absoluteDeclarationTarget: string;
  readonly packageRoot: string;
  readonly compilerVersion: string;
  readonly projectContextHash: string;
  readonly currentDirectory: string;
  readonly compilerLibRoot: string | null;
  readonly defaultLibFileName: string | null;
  readonly limits: PublicApiModelLimits;
}

interface ModelContext {
  readonly checker: ts.TypeChecker;
  readonly printer: ts.Printer;
  readonly normalized: NormalizedInput;
  readonly signal: AbortSignal | undefined;
}

interface ModeledRoot {
  readonly symbol: PublicSymbolV1;
  readonly cost: number;
}

interface RootOmission {
  readonly omission: PublicApiOmissionV1;
  readonly failure: Extract<
    PublicApiModelFailure,
    { readonly code: "resource_limit_exceeded" | "unsupported_context" }
  >;
}

interface UnresolvedModuleClassification {
  readonly kind: "isolated" | "malformed" | "unsupported";
  readonly names: ReadonlySet<string>;
}

const defaultLimits: PublicApiModelLimits = Object.freeze({
  maxDeclarationFiles: 4_096,
  maxGraphDepth: 128,
  maxPublicSymbols: 50_000,
  maxSignaturesPerSymbol: 256,
});

const meaningOrder: readonly SymbolMeaningV1[] = ["type", "value", "namespace"];
const declarationKindOrder = [
  "class",
  "interface",
  "function",
  "variable",
  "enum",
  "type-alias",
  "namespace",
] as const;
const memberKindOrder = [
  "property",
  "method",
  "getter",
  "setter",
  "constructor",
  "index",
  "call",
  "construct",
] as const;
const declarationExtensionPattern = /\.d\.(?:ts|mts|cts)$/;

/** Models one selected declaration entrypoint without ambient filesystem access. */
export function modelPublicApi(input: ModelPublicApiInput): PublicApiModelResult {
  if (input.signal?.aborted) return cancelled();
  const normalized = normalizeInput(input);
  if (normalized === undefined) return invalidInput();

  let declarationFiles = 0;
  try {
    const host = createCompilerHost(input.host, normalized, () => {
      declarationFiles += 1;
      if (declarationFiles > normalized.limits.maxDeclarationFiles) {
        throw new DeclarationFileLimitError();
      }
      checkCancellation(input.signal);
    });
    const program = ts.createProgram({
      rootNames: [normalized.absoluteDeclarationTarget],
      options: compilerOptions(normalized),
      host,
    });
    checkCancellation(input.signal);

    const entrySource = program.getSourceFile(normalized.absoluteDeclarationTarget);
    if (entrySource === undefined) return missingDeclaration();
    if (program.getSyntacticDiagnostics().length > 0) return malformedDeclarations();
    const semanticDiagnostics = program.getSemanticDiagnostics();
    const nonModuleDiagnostics = semanticDiagnostics.filter(
      (diagnostic) => diagnostic.code !== 2307,
    );
    if (nonModuleDiagnostics.length > 0) return malformedDeclarations();
    const unresolvedModules = classifyUnresolvedModules(
      entrySource,
      semanticDiagnostics.filter((diagnostic) => diagnostic.code === 2307),
    );
    if (unresolvedModules.kind === "malformed") return malformedDeclarations();
    if (unresolvedModules.kind === "unsupported") return unsupportedContamination();

    const checker = program.getTypeChecker();
    const moduleSymbol = checker.getSymbolAtLocation(entrySource);
    if (moduleSymbol === undefined) return malformedDeclarations();

    const context: ModelContext = {
      checker,
      printer: ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }),
      normalized,
      signal: input.signal,
    };
    const exportsByName = new Map<string, ts.Symbol | undefined>(
      checker
        .getExportsOfModule(moduleSymbol)
        .map((symbol) => [normalizeExportName(symbol.getName()), symbol]),
    );
    for (const name of unresolvedModules.names) {
      if (!exportsByName.has(name)) exportsByName.set(name, undefined);
    }
    const exports = [...exportsByName]
      .map(([name, symbol]) => ({ name, symbol }))
      .sort((left, right) => compareCodePointStrings(left.name, right.name));

    const modeledRoots: ModeledRoot[] = [];
    let firstOmission: RootOmission | undefined;
    for (const exported of exports) {
      checkCancellation(input.signal);
      const id = publicSymbolId(normalized.entrypoint, exported.name);
      if (id === undefined) return analysisFailed();
      const result = unresolvedModules.names.has(exported.name)
        ? externalOmission(id)
        : exported.symbol === undefined
          ? undefined
          : modelRootSymbol(exported.symbol, exported.name, id, entrySource, context);
      if (result === undefined) return analysisFailed();
      if ("omission" in result) {
        if (firstOmission === undefined) firstOmission = result;
        else {
          if (!sameOmission(firstOmission, result)) return analysisFailed();
          firstOmission = mergeOmission(firstOmission, result);
        }
      } else {
        modeledRoots.push(result);
      }
    }

    const retained: PublicSymbolV1[] = [];
    let retainedCount = 0;
    for (let index = 0; index < modeledRoots.length; index += 1) {
      const root = modeledRoots[index];
      if (root === undefined) return analysisFailed();
      if (retainedCount + root.cost > normalized.limits.maxPublicSymbols) {
        if (firstOmission !== undefined) return analysisFailed();
        const remaining = modeledRoots.slice(index);
        const omittedCount = remaining.reduce((total, candidate) => total + candidate.cost, 0);
        const subject = remaining[0]?.symbol.id ?? null;
        firstOmission = symbolBudgetOmission(omittedCount, subject);
        break;
      }
      retained.push(root.symbol);
      retainedCount += root.cost;
    }

    const data = {
      entrypoint: normalized.entrypoint,
      symbols: retained,
      omission: firstOmission?.omission ?? null,
    };
    const identity: PublicApiModelIdentity = {
      snapshotId: normalized.snapshotId,
      compilerVersion: normalized.compilerVersion,
      projectContextHash: normalized.projectContextHash,
      usage: { declarationFiles, publicSymbols: retainedCount },
    };
    const value: PublicApiModel =
      firstOmission === undefined
        ? { ...identity, status: "complete", data: { ...data, omission: null } }
        : {
            ...identity,
            status: "partial",
            data: { ...data, omission: firstOmission.omission },
            failure: firstOmission.failure,
          };
    return freezeDeep({ ok: true, value });
  } catch (error) {
    if (error instanceof DeclarationFileLimitError) return declarationFileLimitExceeded();
    if (error instanceof CancelledModelError) return cancelled();
    return analysisFailed();
  }
}

function classifyUnresolvedModules(
  entrySource: ts.SourceFile,
  diagnostics: readonly ts.Diagnostic[],
): UnresolvedModuleClassification {
  const names = new Set<string>();
  for (const diagnostic of diagnostics) {
    const source = diagnostic.file;
    if (source === undefined || diagnostic.start === undefined) {
      return { kind: "unsupported", names };
    }
    const declaration = source.statements.find((statement): statement is ts.ExportDeclaration => {
      if (!ts.isExportDeclaration(statement)) return false;
      const moduleSpecifier = statement.moduleSpecifier;
      if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier)) return false;
      return (
        diagnostic.start !== undefined &&
        diagnostic.start >= moduleSpecifier.getStart(source) &&
        diagnostic.start < moduleSpecifier.getEnd()
      );
    });
    const moduleSpecifier = declaration?.moduleSpecifier;
    if (
      declaration === undefined ||
      moduleSpecifier === undefined ||
      !ts.isStringLiteral(moduleSpecifier)
    ) {
      return { kind: "unsupported", names };
    }
    if (isRelativeModuleSpecifier(moduleSpecifier.text)) {
      return { kind: "malformed", names };
    }
    const exportClause = declaration.exportClause;
    if (source !== entrySource || exportClause === undefined || !ts.isNamedExports(exportClause)) {
      return { kind: "unsupported", names };
    }
    for (const element of exportClause.elements) names.add(element.name.text);
  }
  return { kind: "isolated", names };
}

function isRelativeModuleSpecifier(value: string): boolean {
  return value === "." || value === ".." || value.startsWith("./") || value.startsWith("../");
}

function modelRootSymbol(
  exportedSymbol: ts.Symbol,
  exportName: string,
  id: string,
  entrySource: ts.SourceFile,
  context: ModelContext,
): ModeledRoot | RootOmission {
  try {
    const aliasChain: AliasHopV1[] = [];
    const target = resolveAliasChain(exportedSymbol, aliasChain, context);
    if (aliasChain.length === 0) {
      const starHop = starReexportHop(entrySource, exportName, target, context);
      if (starHop !== null) aliasChain.push(starHop);
    }
    const declarations = uniqueDeclarations([
      ...(exportedSymbol.declarations ?? []),
      ...(target.declarations ?? []),
    ]);
    if (declarations.length === 0) throw new UnsafeModelError();
    if (
      declarations.some((declaration) => isExternalDeclaration(declaration, context.normalized))
    ) {
      return externalOmission(id);
    }
    checkHeritageDepth(target, context);

    const locationNode = target.valueDeclaration ?? target.declarations?.[0];
    if (locationNode === undefined) throw new UnsafeModelError();
    const typeParameters = declarationTypeParameters(declarations, context);
    const signatures = modelSymbolSignatures(target, locationNode, context);
    const members = modelMembers(target, declarations, context, id);
    const locations = packageLocations(declarations, context.normalized);
    if (locations.length === 0) return externalOmission(id);

    const symbol: PublicSymbolV1 = {
      id,
      name: boundedIdentifier(exportName),
      meanings: symbolMeanings(target),
      declarationKinds: rootDeclarationKinds(declarations),
      display: declarationDisplay(target.declarations?.[0] ?? declarations[0], context),
      aliasChain,
      locations,
      typeParameters,
      signatures,
      members,
      heritage: modelHeritage(declarations, context),
      documentation: documentation(exportedSymbol, target, context.checker),
      deprecation: deprecation(exportedSymbol, target, context.checker),
    };
    if (symbol.meanings.length === 0 || symbol.declarationKinds.length === 0) {
      throw new UnsafeModelError();
    }
    return { symbol: freezeDeep(symbol), cost: 1 + members.length };
  } catch (error) {
    if (error instanceof RootOmissionError) return error.value;
    throw error;
  }
}

function resolveAliasChain(
  initial: ts.Symbol,
  output: AliasHopV1[],
  context: ModelContext,
): ts.Symbol {
  let current = initial;
  const visited = new Set<ts.Symbol>();
  let depth = 0;
  while ((current.flags & ts.SymbolFlags.Alias) !== 0) {
    checkCancellation(context.signal);
    if (visited.has(current)) break;
    visited.add(current);
    depth += 1;
    if (depth > context.normalized.limits.maxGraphDepth) {
      throw new RootOmissionError(graphDepthOmission(publicSymbolIdOrNull(context, initial)));
    }
    const next =
      context.checker.getImmediateAliasedSymbol(current) ??
      context.checker.getAliasedSymbol(current);
    const declaration = current.declarations?.[0];
    if (declaration === undefined || isExternalDeclaration(declaration, context.normalized)) {
      throw new RootOmissionError(externalOmission(publicSymbolIdOrNull(context, initial)));
    }
    const location = sourceLocation(declaration, context.normalized);
    if (location === null) {
      throw new RootOmissionError(externalOmission(publicSymbolIdOrNull(context, initial)));
    }
    output.push({
      targetName: boundedIdentifier(normalizeExportName(next.getName())),
      sourceModule: aliasSourceModule(declaration),
      location,
    });
    current = next;
  }
  return current;
}

function starReexportHop(
  entrySource: ts.SourceFile,
  exportName: string,
  target: ts.Symbol,
  context: ModelContext,
): AliasHopV1 | null {
  for (const statement of entrySource.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.exportClause !== undefined ||
      statement.moduleSpecifier === undefined ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const moduleSymbol = context.checker.getSymbolAtLocation(statement.moduleSpecifier);
    const candidate = moduleSymbol
      ? context.checker
          .getExportsOfModule(moduleSymbol)
          .find((symbol) => normalizeExportName(symbol.getName()) === exportName)
      : undefined;
    if (candidate === undefined || finalAliasedSymbol(candidate, context.checker) !== target)
      continue;
    const location = sourceLocation(statement, context.normalized);
    if (location === null) continue;
    return {
      targetName: boundedIdentifier(exportName),
      sourceModule: boundedSourceModule(statement.moduleSpecifier.text),
      location,
    };
  }
  return null;
}

function finalAliasedSymbol(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  let current = symbol;
  const visited = new Set<ts.Symbol>();
  while ((current.flags & ts.SymbolFlags.Alias) !== 0 && !visited.has(current)) {
    visited.add(current);
    current = checker.getImmediateAliasedSymbol(current) ?? checker.getAliasedSymbol(current);
  }
  return current;
}

function modelSymbolSignatures(
  symbol: ts.Symbol,
  location: ts.Node,
  context: ModelContext,
): readonly SignatureV1[] {
  const valueType = context.checker.getTypeOfSymbolAtLocation(symbol, location);
  const declaredType = context.checker.getDeclaredTypeOfSymbol(symbol);
  const valueSignatures = signaturesForType(valueType, context);
  const declaredSignatures = signaturesForType(declaredType, context);
  const signatures = deduplicateSignatures([...valueSignatures, ...declaredSignatures]);
  enforceSignatureLimit(signatures.length, context, symbol);
  return signatures;
}

function signaturesForType(type: ts.Type, context: ModelContext): SignatureV1[] {
  const output: SignatureV1[] = [];
  for (const [kind, signatureKind] of [
    ["call", ts.SignatureKind.Call],
    ["construct", ts.SignatureKind.Construct],
  ] as const) {
    const signatures = context.checker.getSignaturesOfType(type, signatureKind);
    for (const [ordinal, signature] of signatures.entries()) {
      const declaration = signature.declaration;
      output.push({
        kind,
        ordinal,
        display: boundedDisplay(
          normalizeWhitespace(
            context.checker.signatureToString(
              signature,
              declaration,
              ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteTypeArgumentsOfSignature,
            ),
          ),
        ),
        typeParameters: signatureTypeParameters(signature, context),
        location:
          declaration === undefined ? null : sourceLocation(declaration, context.normalized),
      });
    }
  }
  return output;
}

function deduplicateSignatures(signatures: readonly SignatureV1[]): SignatureV1[] {
  const output: SignatureV1[] = [];
  const seen = new Set<string>();
  const ordinals = { call: 0, construct: 0 };
  for (const signature of signatures) {
    const key = `${signature.kind}:${signature.display}:${locationKey(signature.location)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ ...signature, ordinal: ordinals[signature.kind] });
    ordinals[signature.kind] += 1;
  }
  return output;
}

function modelMembers(
  root: ts.Symbol,
  declarations: readonly ts.Declaration[],
  context: ModelContext,
  rootId: string,
): readonly MemberV1[] {
  const candidates: Array<{ symbol: ts.Symbol; scope: "static" | "instance" }> = [];
  const seen = new Map<ts.Symbol, Set<"static" | "instance">>();
  const retain = (symbol: ts.Symbol, scope: "static" | "instance"): void => {
    const scopes = seen.get(symbol) ?? new Set<"static" | "instance">();
    if (scopes.has(scope)) return;
    scopes.add(scope);
    seen.set(symbol, scopes);
    candidates.push({ symbol, scope });
  };

  root.exports?.forEach((symbol, name) => {
    if (String(name) !== "prototype") retain(symbol, "static");
  });
  const declaredType = context.checker.getDeclaredTypeOfSymbol(root);
  for (const symbol of context.checker.getPropertiesOfType(declaredType))
    retain(symbol, "instance");

  const members = candidates.map(({ symbol, scope }) =>
    modelMemberSymbol(symbol, scope, context, rootId),
  );
  members.push(...modelSyntheticMembers(declarations, context, rootId));
  members.sort(compareMembers);
  return members;
}

function modelMemberSymbol(
  symbol: ts.Symbol,
  scope: "static" | "instance",
  context: ModelContext,
  rootId: string,
): MemberV1 {
  const declarations = uniqueDeclarations(symbol.declarations ?? []);
  if (
    declarations.length === 0 ||
    declarations.some((item) => isExternalDeclaration(item, context.normalized))
  ) {
    throw new RootOmissionError(externalOmission(rootId));
  }
  const locationNode = symbol.valueDeclaration ?? declarations[0];
  if (locationNode === undefined) throw new UnsafeModelError();
  const type = context.checker.getTypeOfSymbolAtLocation(symbol, locationNode);
  const signatures = signaturesForType(type, context);
  enforceSignatureLimit(signatures.length, context, symbol, rootId);
  const kinds = memberDeclarationKinds(declarations);
  if (kinds.length === 0) throw new UnsafeModelError();
  return {
    name: boundedIdentifier(symbol.getName()),
    meanings: symbolMeanings(symbol),
    declarationKinds: kinds,
    scope,
    visibility: visibility(declarations),
    optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0 || declarations.some(hasQuestionToken),
    readonly: declarations.some(isReadonlyDeclaration),
    display: declarationDisplay(declarations[0], context),
    signatures,
    locations: packageLocations(declarations, context.normalized),
    documentation: boundedDocumentation(
      normalizeWhitespace(ts.displayPartsToString(symbol.getDocumentationComment(context.checker))),
    ),
    deprecation: symbolDeprecation(symbol, context.checker),
  };
}

function modelSyntheticMembers(
  declarations: readonly ts.Declaration[],
  context: ModelContext,
  rootId: string,
): MemberV1[] {
  const signatureGroups = new Map<"call" | "construct", ts.SignatureDeclaration[]>();
  const output: MemberV1[] = [];
  for (const declaration of declarations) {
    if (!hasMembers(declaration)) continue;
    for (const member of declaration.members) {
      if (ts.isConstructorDeclaration(member)) {
        output.push(modelConstructor(member, context, rootId));
      } else if (ts.isIndexSignatureDeclaration(member)) {
        output.push(modelIndexSignature(member, context));
      } else if (ts.isCallSignatureDeclaration(member)) {
        const values = signatureGroups.get("call") ?? [];
        values.push(member);
        signatureGroups.set("call", values);
      } else if (ts.isConstructSignatureDeclaration(member)) {
        const values = signatureGroups.get("construct") ?? [];
        values.push(member);
        signatureGroups.set("construct", values);
      }
    }
  }
  for (const [kind, signatureDeclarations] of signatureGroups) {
    const signatures = signatureDeclarations.flatMap((declaration) => {
      const signature = context.checker.getSignatureFromDeclaration(declaration);
      return signature === undefined ? [] : signaturesFromDeclarations(kind, [signature], context);
    });
    enforceSignatureLimit(signatures.length, context, undefined, rootId);
    output.push({
      name: kind,
      meanings: ["type"],
      declarationKinds: [kind],
      scope: "instance",
      visibility: "public",
      optional: false,
      readonly: false,
      display: declarationDisplay(signatureDeclarations[0], context),
      signatures,
      locations: packageLocations(signatureDeclarations, context.normalized),
      documentation: null,
      deprecation: null,
    });
  }
  return output;
}

function modelConstructor(
  declaration: ts.ConstructorDeclaration,
  context: ModelContext,
  rootId: string,
): MemberV1 {
  const signature = context.checker.getSignatureFromDeclaration(declaration);
  const signatures =
    signature === undefined ? [] : signaturesFromDeclarations("construct", [signature], context);
  enforceSignatureLimit(signatures.length, context, undefined, rootId);
  return {
    name: "constructor",
    meanings: ["value"],
    declarationKinds: ["constructor"],
    scope: "instance",
    visibility: visibility([declaration]),
    optional: false,
    readonly: false,
    display: declarationDisplay(declaration, context),
    signatures,
    locations: packageLocations([declaration], context.normalized),
    documentation: null,
    deprecation: null,
  };
}

function modelIndexSignature(
  declaration: ts.IndexSignatureDeclaration,
  context: ModelContext,
): MemberV1 {
  return {
    name: "index",
    meanings: ["type"],
    declarationKinds: ["index"],
    scope: "instance",
    visibility: "public",
    optional: false,
    readonly: isReadonlyDeclaration(declaration),
    display: declarationDisplay(declaration, context),
    signatures: [],
    locations: packageLocations([declaration], context.normalized),
    documentation: null,
    deprecation: null,
  };
}

function signaturesFromDeclarations(
  kind: "call" | "construct",
  signatures: readonly ts.Signature[],
  context: ModelContext,
): SignatureV1[] {
  return signatures.map((signature, ordinal) => ({
    kind,
    ordinal,
    display: boundedDisplay(
      normalizeWhitespace(
        context.checker.signatureToString(
          signature,
          signature.declaration,
          ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteTypeArgumentsOfSignature,
        ),
      ),
    ),
    typeParameters: signatureTypeParameters(signature, context),
    location:
      signature.declaration === undefined
        ? null
        : sourceLocation(signature.declaration, context.normalized),
  }));
}

function modelHeritage(
  declarations: readonly ts.Declaration[],
  context: ModelContext,
): HeritageV1[] {
  const output: HeritageV1[] = [];
  for (const declaration of declarations) {
    if (!hasHeritage(declaration)) continue;
    for (const clause of declaration.heritageClauses ?? []) {
      const kind = clause.token === ts.SyntaxKind.ImplementsKeyword ? "implements" : "extends";
      for (const type of clause.types) {
        output.push({
          kind,
          display: boundedDisplay(printNode(type, context)),
          location: sourceLocation(type, context.normalized),
        });
      }
    }
  }
  return output;
}

function checkHeritageDepth(root: ts.Symbol, context: ModelContext): void {
  const visited = new Set<ts.Symbol>();
  const visit = (symbol: ts.Symbol, depth: number): void => {
    checkCancellation(context.signal);
    if (visited.has(symbol)) return;
    visited.add(symbol);
    for (const declaration of symbol.declarations ?? []) {
      if (!hasHeritage(declaration)) continue;
      for (const clause of declaration.heritageClauses ?? []) {
        for (const typeNode of clause.types) {
          const nextDepth = depth + 1;
          if (nextDepth > context.normalized.limits.maxGraphDepth) {
            throw new RootOmissionError(graphDepthOmission(publicSymbolIdOrNull(context, root)));
          }
          const base = context.checker.getTypeAtLocation(typeNode).getSymbol();
          if (base === undefined) continue;
          if (
            (base.declarations ?? []).some((item) =>
              isExternalDeclaration(item, context.normalized),
            )
          ) {
            throw new RootOmissionError(externalOmission(publicSymbolIdOrNull(context, root)));
          }
          visit(base, nextDepth);
        }
      }
    }
  };
  visit(root, 0);
}

function declarationTypeParameters(
  declarations: readonly ts.Declaration[],
  context: ModelContext,
): readonly TypeParameterV1[] {
  const declaration = declarations.find(hasTypeParameterNodes);
  return (
    declaration?.typeParameters?.map((parameter) => modelTypeParameter(parameter, context)) ?? []
  );
}

function signatureTypeParameters(
  signature: ts.Signature,
  context: ModelContext,
): readonly TypeParameterV1[] {
  const declaration = signature.declaration;
  if (declaration?.typeParameters !== undefined) {
    return declaration.typeParameters
      .filter(ts.isTypeParameterDeclaration)
      .map((parameter) => modelTypeParameter(parameter, context));
  }
  return (signature.typeParameters ?? []).map((parameter) => ({
    name: boundedIdentifier(parameter.symbol.getName()),
    constraint: null,
    default: null,
  }));
}

function modelTypeParameter(
  parameter: ts.TypeParameterDeclaration,
  context: ModelContext,
): TypeParameterV1 {
  return {
    name: boundedIdentifier(parameter.name.text),
    constraint:
      parameter.constraint === undefined
        ? null
        : boundedDisplay(printNode(parameter.constraint, context)),
    default:
      parameter.default === undefined
        ? null
        : boundedDisplay(printNode(parameter.default, context)),
  };
}

function symbolMeanings(symbol: ts.Symbol): readonly SymbolMeaningV1[] {
  const values = new Set<SymbolMeaningV1>();
  if ((symbol.flags & ts.SymbolFlags.Type) !== 0) values.add("type");
  if ((symbol.flags & ts.SymbolFlags.Value) !== 0) values.add("value");
  if ((symbol.flags & ts.SymbolFlags.Namespace) !== 0) values.add("namespace");
  return meaningOrder.filter((value) => values.has(value));
}

function rootDeclarationKinds(
  declarations: readonly ts.Declaration[],
): readonly (typeof declarationKindOrder)[number][] {
  const values = new Set<(typeof declarationKindOrder)[number]>();
  for (const declaration of declarations) {
    if (ts.isClassDeclaration(declaration) || ts.isClassExpression(declaration))
      values.add("class");
    else if (ts.isInterfaceDeclaration(declaration)) values.add("interface");
    else if (ts.isFunctionDeclaration(declaration)) values.add("function");
    else if (ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration))
      values.add("variable");
    else if (ts.isEnumDeclaration(declaration)) values.add("enum");
    else if (ts.isTypeAliasDeclaration(declaration)) values.add("type-alias");
    else if (ts.isModuleDeclaration(declaration)) values.add("namespace");
  }
  return declarationKindOrder.filter((value) => values.has(value));
}

function memberDeclarationKinds(
  declarations: readonly ts.Declaration[],
): readonly (typeof memberKindOrder)[number][] {
  const values = new Set<(typeof memberKindOrder)[number]>();
  for (const declaration of declarations) {
    if (ts.isMethodDeclaration(declaration) || ts.isMethodSignature(declaration))
      values.add("method");
    else if (ts.isGetAccessorDeclaration(declaration)) values.add("getter");
    else if (ts.isSetAccessorDeclaration(declaration)) values.add("setter");
    else if (ts.isConstructorDeclaration(declaration)) values.add("constructor");
    else if (ts.isIndexSignatureDeclaration(declaration)) values.add("index");
    else if (ts.isCallSignatureDeclaration(declaration)) values.add("call");
    else if (ts.isConstructSignatureDeclaration(declaration)) values.add("construct");
    else values.add("property");
  }
  return memberKindOrder.filter((value) => values.has(value));
}

function packageLocations(
  declarations: readonly ts.Declaration[],
  normalized: NormalizedInput,
): readonly SourceLocationV1[] {
  const locations = declarations.flatMap((declaration) => {
    const location = sourceLocation(declaration, normalized);
    return location === null ? [] : [location];
  });
  const keys = new Set<string>();
  return locations.sort(compareLocations).filter((location) => {
    const key = locationKey(location);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function sourceLocation(node: ts.Node, normalized: NormalizedInput): SourceLocationV1 | null {
  const source = node.getSourceFile();
  const fileName = normalizeAbsolutePath(source.fileName);
  if (fileName === undefined || !isContained(normalized.packageRoot, fileName)) return null;
  const path = posix.relative(normalized.packageRoot, fileName);
  if (!isPortableRelativePath(path)) return null;
  const position = source.getLineAndCharacterOfPosition(node.getStart(source, false));
  return { path, line: position.line + 1, column: position.character + 1 };
}

function declarationDisplay(node: ts.Node | undefined, context: ModelContext): string | null {
  if (node === undefined) return null;
  const display = normalizeWhitespace(printNode(node, context));
  return Buffer.byteLength(display) > 4_096 || display.length === 0 ? null : display;
}

function printNode(node: ts.Node, context: ModelContext): string {
  return normalizeWhitespace(
    context.printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile()),
  );
}

function documentation(
  exported: ts.Symbol,
  target: ts.Symbol,
  checker: ts.TypeChecker,
): string | null {
  const exportedText = normalizeWhitespace(
    ts.displayPartsToString(exported.getDocumentationComment(checker)),
  );
  if (exportedText.length > 0) return boundedDocumentation(exportedText);
  return boundedDocumentation(
    normalizeWhitespace(ts.displayPartsToString(target.getDocumentationComment(checker))),
  );
}

function deprecation(
  exported: ts.Symbol,
  target: ts.Symbol,
  checker: ts.TypeChecker,
): DeprecationV1 | null {
  return symbolDeprecation(exported, checker) ?? symbolDeprecation(target, checker);
}

function symbolDeprecation(symbol: ts.Symbol, checker: ts.TypeChecker): DeprecationV1 | null {
  const tag = symbol.getJsDocTags(checker).find(({ name }) => name === "deprecated");
  if (tag === undefined) return null;
  const text = normalizeWhitespace(ts.displayPartsToString(tag.text));
  return { message: boundedDocumentation(text) };
}

function aliasSourceModule(declaration: ts.Declaration): string | null {
  if (ts.isExportSpecifier(declaration)) {
    const exportDeclaration = declaration.parent.parent;
    if (
      ts.isExportDeclaration(exportDeclaration) &&
      exportDeclaration.moduleSpecifier !== undefined &&
      ts.isStringLiteral(exportDeclaration.moduleSpecifier)
    ) {
      return boundedSourceModule(exportDeclaration.moduleSpecifier.text);
    }
  }
  if (ts.isImportSpecifier(declaration)) {
    const importDeclaration = declaration.parent.parent.parent;
    if (
      ts.isImportDeclaration(importDeclaration) &&
      ts.isStringLiteral(importDeclaration.moduleSpecifier)
    ) {
      return boundedSourceModule(importDeclaration.moduleSpecifier.text);
    }
  }
  return null;
}

function visibility(
  declarations: readonly ts.Declaration[],
): "public" | "protected" | "private" | "unknown" {
  if (declarations.some((item) => hasModifier(item, ts.SyntaxKind.PrivateKeyword)))
    return "private";
  if (declarations.some((item) => hasModifier(item, ts.SyntaxKind.ProtectedKeyword)))
    return "protected";
  if (declarations.some((item) => hasModifier(item, ts.SyntaxKind.PublicKeyword))) return "public";
  if (
    declarations.every(
      (item) =>
        ts.isPropertyDeclaration(item) ||
        ts.isMethodDeclaration(item) ||
        ts.isPropertySignature(item) ||
        ts.isMethodSignature(item) ||
        ts.isGetAccessorDeclaration(item) ||
        ts.isSetAccessorDeclaration(item) ||
        ts.isConstructorDeclaration(item),
    )
  ) {
    return "public";
  }
  return "unknown";
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((item) => item.kind === kind) ?? false)
  );
}

function isReadonlyDeclaration(declaration: ts.Declaration): boolean {
  return hasModifier(declaration, ts.SyntaxKind.ReadonlyKeyword);
}

function hasQuestionToken(declaration: ts.Declaration): boolean {
  return "questionToken" in declaration && declaration.questionToken !== undefined;
}

function hasMembers(
  declaration: ts.Declaration,
): declaration is ts.ClassLikeDeclaration | ts.InterfaceDeclaration | ts.TypeLiteralNode {
  return (
    ts.isClassDeclaration(declaration) ||
    ts.isClassExpression(declaration) ||
    ts.isInterfaceDeclaration(declaration) ||
    ts.isTypeLiteralNode(declaration)
  );
}

function hasHeritage(
  declaration: ts.Declaration,
): declaration is ts.ClassLikeDeclaration | ts.InterfaceDeclaration {
  return (
    ts.isClassDeclaration(declaration) ||
    ts.isClassExpression(declaration) ||
    ts.isInterfaceDeclaration(declaration)
  );
}

function hasTypeParameterNodes(
  declaration: ts.Declaration,
): declaration is
  | ts.SignatureDeclaration
  | ts.ClassLikeDeclaration
  | ts.InterfaceDeclaration
  | ts.TypeAliasDeclaration {
  return (
    ts.isFunctionDeclaration(declaration) ||
    ts.isMethodDeclaration(declaration) ||
    ts.isMethodSignature(declaration) ||
    ts.isCallSignatureDeclaration(declaration) ||
    ts.isConstructSignatureDeclaration(declaration) ||
    ts.isConstructorDeclaration(declaration) ||
    ts.isGetAccessorDeclaration(declaration) ||
    ts.isSetAccessorDeclaration(declaration) ||
    ts.isFunctionTypeNode(declaration) ||
    ts.isConstructorTypeNode(declaration) ||
    ts.isClassDeclaration(declaration) ||
    ts.isClassExpression(declaration) ||
    ts.isInterfaceDeclaration(declaration) ||
    ts.isTypeAliasDeclaration(declaration)
  );
}

function compareMembers(left: MemberV1, right: MemberV1): number {
  const scope = (left.scope === "static" ? 0 : 1) - (right.scope === "static" ? 0 : 1);
  if (scope !== 0) return scope;
  const name = compareCodePointStrings(left.name, right.name);
  if (name !== 0) return name;
  const leftKind = memberKindOrder.indexOf(left.declarationKinds[0] ?? "property");
  const rightKind = memberKindOrder.indexOf(right.declarationKinds[0] ?? "property");
  if (leftKind !== rightKind) return leftKind - rightKind;
  return compareLocations(left.locations[0], right.locations[0]);
}

function compareLocations(
  left: SourceLocationV1 | undefined,
  right: SourceLocationV1 | undefined,
): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  const path = compareCodePointStrings(left.path, right.path);
  if (path !== 0) return path;
  return left.line - right.line || left.column - right.column;
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

function createCompilerHost(
  source: PublicApiModelFileHost,
  normalized: NormalizedInput,
  retainDeclaration: () => void,
): ts.CompilerHost {
  const retained = new Set<string>();
  const normalizeForHost = (path: string): string | undefined => {
    const absolute = normalizeVirtualPath(path, normalized.currentDirectory);
    if (absolute === undefined) return undefined;
    if (isContained(normalized.packageRoot, absolute)) return absolute;
    if (normalized.compilerLibRoot !== null && isContained(normalized.compilerLibRoot, absolute)) {
      return absolute;
    }
    return undefined;
  };
  return {
    getSourceFile(fileName, languageVersion) {
      const normalizedPath = normalizeForHost(fileName);
      if (normalizedPath === undefined) return undefined;
      if (
        isContained(normalized.packageRoot, normalizedPath) &&
        !declarationExtensionPattern.test(normalizedPath)
      ) {
        return undefined;
      }
      const contents = source.readFile(normalizedPath);
      if (contents === undefined) return undefined;
      if (
        isContained(normalized.packageRoot, normalizedPath) &&
        declarationExtensionPattern.test(normalizedPath) &&
        !retained.has(normalizedPath)
      ) {
        retained.add(normalizedPath);
        retainDeclaration();
      }
      return ts.createSourceFile(normalizedPath, contents, languageVersion, true);
    },
    getDefaultLibFileName: () => normalized.defaultLibFileName ?? "/__no_default_lib__.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => normalized.currentDirectory,
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists(path) {
      const normalizedPath = normalizeForHost(path);
      return normalizedPath !== undefined && source.fileExists(normalizedPath);
    },
    readFile(path) {
      const normalizedPath = normalizeForHost(path);
      return normalizedPath === undefined ? undefined : source.readFile(normalizedPath);
    },
    directoryExists(path) {
      const normalizedPath = normalizeForHost(path);
      return normalizedPath !== undefined && source.directoryExists(normalizedPath);
    },
    getDirectories(path) {
      const normalizedPath = normalizeForHost(path);
      return normalizedPath === undefined ? [] : [...source.getDirectories(normalizedPath)];
    },
    realpath(path) {
      const normalizedPath = normalizeForHost(path);
      if (normalizedPath === undefined) return "/__rejected__";
      return normalizeForHost(source.realpath(normalizedPath)) ?? "/__rejected__";
    },
  };
}

function compilerOptions(normalized: NormalizedInput): ts.CompilerOptions {
  return {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    noEmit: true,
    noLib: normalized.defaultLibFileName === null,
    skipLibCheck: false,
    types: [],
    allowJs: false,
    resolvePackageJsonExports: true,
  };
}

function normalizeInput(input: ModelPublicApiInput): NormalizedInput | undefined {
  const currentDirectory = normalizeAbsolutePath(input.host.currentDirectory);
  const packageRoot = normalizeAbsolutePath(input.packageRoot);
  const limits = effectiveLimits(input.limits);
  if (
    currentDirectory === undefined ||
    packageRoot === undefined ||
    limits === undefined ||
    !isContained(currentDirectory, packageRoot) ||
    input.snapshotId.length === 0 ||
    input.snapshotId.length > 256 ||
    input.projectContextHash.length === 0 ||
    input.projectContextHash.length > 256 ||
    input.compilerVersion !== ts.version ||
    !isEntrypoint(input.entrypoint) ||
    !isPortableRelativePath(input.declarationTarget) ||
    !declarationExtensionPattern.test(input.declarationTarget)
  ) {
    return undefined;
  }
  const absoluteDeclarationTarget = posix.join(packageRoot, input.declarationTarget);
  const compilerLibRoot =
    input.compilerLibRoot === undefined || input.compilerLibRoot === null
      ? null
      : normalizeAbsolutePath(input.compilerLibRoot);
  const defaultLibFileName =
    input.defaultLibFileName === undefined || input.defaultLibFileName === null
      ? null
      : normalizeAbsolutePath(input.defaultLibFileName);
  if (compilerLibRoot === undefined || defaultLibFileName === undefined) return undefined;
  if (
    (compilerLibRoot === null) !== (defaultLibFileName === null) ||
    (compilerLibRoot !== null &&
      (!isContained(currentDirectory, compilerLibRoot) ||
        defaultLibFileName === null ||
        !isContained(compilerLibRoot, defaultLibFileName)))
  ) {
    return undefined;
  }
  return {
    snapshotId: input.snapshotId,
    entrypoint: input.entrypoint,
    declarationTarget: input.declarationTarget,
    absoluteDeclarationTarget,
    packageRoot,
    compilerVersion: input.compilerVersion,
    projectContextHash: input.projectContextHash,
    currentDirectory,
    compilerLibRoot,
    defaultLibFileName,
    limits,
  };
}

function effectiveLimits(
  overrides: Partial<PublicApiModelLimits> | undefined,
): PublicApiModelLimits | undefined {
  if (
    overrides !== undefined &&
    Object.values(overrides).some((value) => !Number.isSafeInteger(value) || value < 1)
  ) {
    return undefined;
  }
  return {
    maxDeclarationFiles: loweredLimit(
      overrides?.maxDeclarationFiles,
      defaultLimits.maxDeclarationFiles,
    ),
    maxGraphDepth: loweredLimit(overrides?.maxGraphDepth, defaultLimits.maxGraphDepth),
    maxPublicSymbols: loweredLimit(overrides?.maxPublicSymbols, defaultLimits.maxPublicSymbols),
    maxSignaturesPerSymbol: loweredLimit(
      overrides?.maxSignaturesPerSymbol,
      defaultLimits.maxSignaturesPerSymbol,
    ),
  };
}

function loweredLimit(candidate: number | undefined, fallback: number): number {
  if (candidate === undefined) return fallback;
  return Math.min(candidate, fallback);
}

function isEntrypoint(value: string): boolean {
  if (value === ".") return true;
  if (
    !value.startsWith("./") ||
    value.length > 512 ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    return false;
  }
  return value
    .slice(2)
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isPortableRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 4_096 &&
    !posix.isAbsolute(value) &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

function normalizeAbsolutePath(value: string): string | undefined {
  if (
    !posix.isAbsolute(value) ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.length > 4_096
  ) {
    return undefined;
  }
  return posix.normalize(value);
}

function normalizeVirtualPath(value: string, currentDirectory: string): string | undefined {
  if (value.length === 0 || value.length > 4_096 || value.includes("\\") || value.includes("\0")) {
    return undefined;
  }
  return posix.normalize(posix.isAbsolute(value) ? value : posix.resolve(currentDirectory, value));
}

function isContained(root: string, candidate: string): boolean {
  const relative = posix.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith("../") && !posix.isAbsolute(relative))
  );
}

function isExternalDeclaration(declaration: ts.Declaration, normalized: NormalizedInput): boolean {
  const fileName = normalizeAbsolutePath(declaration.getSourceFile().fileName);
  if (fileName === undefined) return true;
  if (isContained(normalized.packageRoot, fileName)) return false;
  return normalized.compilerLibRoot === null || !isContained(normalized.compilerLibRoot, fileName);
}

function publicSymbolId(entrypoint: string, name: string): string | undefined {
  if (!isWellFormedUnicode(name)) return undefined;
  return `${entrypoint}#${encodeURIComponent(name)}`;
}

function publicSymbolIdOrNull(context: ModelContext, symbol: ts.Symbol): string | null {
  return (
    publicSymbolId(context.normalized.entrypoint, normalizeExportName(symbol.getName())) ?? null
  );
}

function normalizeExportName(value: string): string {
  return value === "export=" ? "export=" : value;
}

function boundedIdentifier(value: string): string {
  if (value.length === 0 || value.length > 256 || !isWellFormedUnicode(value)) {
    throw new UnsafeModelError();
  }
  return value;
}

function boundedSourceModule(value: string): string {
  if (value.length === 0 || value.length > 512 || !isWellFormedUnicode(value)) {
    throw new UnsafeModelError();
  }
  return value;
}

function boundedDisplay(value: string): string {
  if (value.length === 0 || Buffer.byteLength(value) > 4_096 || !isWellFormedUnicode(value)) {
    throw new UnsafeModelError();
  }
  return value;
}

function boundedDocumentation(value: string): string | null {
  if (value.length === 0 || Buffer.byteLength(value) > 1_024 || !isWellFormedUnicode(value))
    return null;
  return value;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function uniqueDeclarations(values: readonly ts.Declaration[]): ts.Declaration[] {
  return [...new Set(values)];
}

function enforceSignatureLimit(
  count: number,
  context: ModelContext,
  symbol: ts.Symbol | undefined,
  explicitSubject?: string,
): void {
  if (count <= context.normalized.limits.maxSignaturesPerSymbol) return;
  const subjectId =
    explicitSubject ?? (symbol === undefined ? null : publicSymbolIdOrNull(context, symbol));
  throw new RootOmissionError(signatureOmission(subjectId));
}

function sameOmission(left: RootOmission, right: RootOmission): boolean {
  return left.omission.kind === right.omission.kind && left.omission.limit === right.omission.limit;
}

function mergeOmission(left: RootOmission, right: RootOmission): RootOmission {
  return {
    omission: {
      ...left.omission,
      omittedCount: left.omission.omittedCount + right.omission.omittedCount,
    },
    failure: left.failure,
  };
}

function symbolBudgetOmission(omittedCount: number, subjectId: string | null): RootOmission {
  return {
    omission: {
      kind: "symbols",
      limit: "maxPublicSymbols",
      omittedCount,
      subjectId,
    },
    failure: publicSymbolLimitExceeded(),
  };
}

function graphDepthOmission(subjectId: string | null): RootOmission {
  return {
    omission: {
      kind: "graph",
      limit: "maxGraphDepth",
      omittedCount: 1,
      subjectId,
    },
    failure: graphDepthLimitExceeded(),
  };
}

function signatureOmission(subjectId: string | null): RootOmission {
  return {
    omission: {
      kind: "signatures",
      limit: "maxSignaturesPerSymbol",
      omittedCount: 1,
      subjectId,
    },
    failure: signatureLimitExceeded(),
  };
}

function externalOmission(subjectId: string | null): RootOmission {
  return {
    omission: {
      kind: "external-declaration",
      limit: null,
      omittedCount: 1,
      subjectId,
    },
    failure: unsupportedFailure(),
  };
}

function locationKey(location: SourceLocationV1 | null | undefined): string {
  return location === null || location === undefined
    ? ""
    : `${location.path}:${location.line}:${location.column}`;
}

function checkCancellation(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new CancelledModelError();
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function invalidInput(): PublicApiModelResult {
  return freezeDeep({
    ok: false,
    failure: {
      code: "invalid_request",
      message: "Public API modeling input is not valid bounded package context.",
    },
  });
}

function missingDeclaration(): PublicApiModelResult {
  return freezeDeep({
    ok: false,
    failure: {
      code: "malformed_artifact",
      message: "Selected public API declaration is missing from the admitted snapshot.",
    },
  });
}

function malformedDeclarations(): PublicApiModelResult {
  return freezeDeep({
    ok: false,
    failure: {
      code: "malformed_artifact",
      message: "Selected public API declarations are not valid TypeScript.",
    },
  });
}

function unsupportedContamination(): Extract<PublicApiModelResult, { readonly ok: false }> {
  return freezeDeep({
    ok: false,
    failure: unsupportedFailure(),
  });
}

function unsupportedFailure(): Extract<
  PublicApiModelFailure,
  { readonly code: "unsupported_context" }
> {
  return {
    code: "unsupported_context",
    message: "Public API reaches a declaration outside the admitted package snapshot.",
  };
}

function declarationFileLimitExceeded(): PublicApiModelResult {
  return freezeDeep({
    ok: false,
    failure: {
      code: "resource_limit_exceeded",
      message: "Public API modeling exceeded its declaration-file budget.",
      limit: "maxDeclarationFiles",
    },
  });
}

function graphDepthLimitExceeded(): Extract<
  PublicApiModelFailure,
  { readonly code: "resource_limit_exceeded" }
> {
  return {
    code: "resource_limit_exceeded",
    message: "Public API modeling exceeded its graph-depth budget.",
    limit: "maxGraphDepth",
  };
}

function publicSymbolLimitExceeded(): Extract<
  PublicApiModelFailure,
  { readonly code: "resource_limit_exceeded" }
> {
  return {
    code: "resource_limit_exceeded",
    message: "Public API modeling exceeded its public-symbol budget.",
    limit: "maxPublicSymbols",
  };
}

function signatureLimitExceeded(): Extract<
  PublicApiModelFailure,
  { readonly code: "resource_limit_exceeded" }
> {
  return {
    code: "resource_limit_exceeded",
    message: "Public API modeling exceeded its per-symbol signature budget.",
    limit: "maxSignaturesPerSymbol",
  };
}

function cancelled(): PublicApiModelResult {
  return freezeDeep({
    ok: false,
    failure: { code: "cancelled", message: "Public API modeling was cancelled." },
  });
}

function analysisFailed(): PublicApiModelResult {
  return freezeDeep({
    ok: false,
    failure: {
      code: "analysis_failed",
      message: "Public API modeling could not complete safely.",
    },
  });
}

class DeclarationFileLimitError extends Error {}
class CancelledModelError extends Error {}
class UnsafeModelError extends Error {}
class RootOmissionError extends Error {
  constructor(readonly value: RootOmission) {
    super();
  }
}
