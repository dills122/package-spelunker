import { posix } from "node:path";

import {
  Application,
  Comment,
  type DeclarationReflection,
  type Reflection,
  ReflectionKind,
  type SignatureReflection,
  type SourceReference,
  type TypeParameterReflection,
} from "typedoc";
import ts from "typescript";

import type {
  AliasHopV1,
  DeprecationV1,
  HeritageV1,
  MemberV1,
  ModelPublicApiInput,
  PublicApiModel,
  PublicApiModelFailure,
  PublicApiModelFileHost,
  PublicApiModelLimits,
  PublicApiModelResult,
  PublicApiOmissionV1,
  PublicSymbolV1,
  SignatureV1,
  SourceLocationV1,
  SymbolMeaningV1,
  TypeParameterV1,
} from "./contracts.js";

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

const declarationExtensionPattern = /\.d\.(?:ts|mts|cts)$/;
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

/** TypeDoc supplies semantic extraction; this adapter owns containment, limits, and evidence. */
export async function modelPublicApi(input: ModelPublicApiInput): Promise<PublicApiModelResult> {
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
    if (semanticDiagnostics.some(({ code }) => code !== 2307)) return malformedDeclarations();
    const unresolvedModules = classifyUnresolvedModules(
      entrySource,
      semanticDiagnostics.filter(({ code }) => code === 2307),
    );
    if (unresolvedModules.kind === "malformed") return malformedDeclarations();
    if (unresolvedModules.kind === "unsupported") return unsupportedContamination();

    const checker = program.getTypeChecker();
    const moduleSymbol = checker.getSymbolAtLocation(entrySource);
    if (moduleSymbol === undefined) return malformedDeclarations();
    const context: ModelContext = { checker, normalized, signal: input.signal };

    const app = await Application.bootstrap(
      {
        excludeExternals: false,
        excludePrivate: false,
        excludeProtected: false,
        excludeReferences: false,
        name: normalized.entrypoint,
        readme: "none",
        skipErrorChecking: true,
      },
      [],
    );
    checkCancellation(input.signal);
    const project = app.converter.convert([
      { displayName: normalized.entrypoint, program, sourceFile: entrySource },
    ]);
    checkCancellation(input.signal);

    const reflectionsByName = groupReflections(project.children ?? []);
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
          : modelRoot(
              exported.symbol,
              exported.name,
              id,
              reflectionsByName.get(exported.name) ?? [],
              entrySource,
              context,
            );
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
        firstOmission = symbolBudgetOmission(
          remaining.reduce((total, candidate) => total + candidate.cost, 0),
          remaining[0]?.symbol.id ?? null,
        );
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
    const identity = {
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

function groupReflections(
  reflections: readonly DeclarationReflection[],
): ReadonlyMap<string, readonly DeclarationReflection[]> {
  const groups = new Map<string, DeclarationReflection[]>();
  for (const reflection of reflections) {
    const name = normalizeExportName(reflection.name);
    const group = groups.get(name) ?? [];
    group.push(reflection);
    groups.set(name, group);
  }
  return groups;
}

function modelRoot(
  exportedSymbol: ts.Symbol,
  exportName: string,
  id: string,
  reflections: readonly DeclarationReflection[],
  entrySource: ts.SourceFile,
  context: ModelContext,
): ModeledRoot | RootOmission | undefined {
  if (reflections.length === 0) return undefined;
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
    if (declarations.some((item) => isExternalDeclaration(item, context.normalized))) {
      return externalOmission(id);
    }
    checkHeritageDepth(target, context);

    const locations = reflectionLocations(reflections, context.normalized);
    if (locations.length === 0) return externalOmission(id);
    const signatures = reflections.flatMap((reflection) =>
      modelSignatures(reflection.signatures ?? [], context.normalized),
    );
    enforceSignatureLimit(signatures.length, context, id);
    const members = modelMembers(reflections, context, id);
    const meanings = rootMeanings(reflections);
    const declarationKinds = rootDeclarationKinds(reflections);
    if (meanings.length === 0 || declarationKinds.length === 0) {
      throw new UnsafeModelError();
    }

    const symbol: PublicSymbolV1 = {
      id,
      name: boundedIdentifier(exportName),
      meanings,
      declarationKinds,
      display: rootDisplay(reflections),
      aliasChain,
      locations,
      typeParameters: firstTypeParameters(reflections),
      signatures,
      members,
      heritage: modelHeritage(reflections, context.normalized),
      documentation: documentation(reflections),
      deprecation: deprecation(reflections),
    };
    return { symbol: freezeDeep(symbol), cost: 1 + members.length };
  } catch (error) {
    if (error instanceof RootOmissionError) return error.value;
    throw error;
  }
}

function modelMembers(
  roots: readonly DeclarationReflection[],
  context: ModelContext,
  subjectId: string,
): readonly MemberV1[] {
  const output: MemberV1[] = [];
  for (const root of roots) {
    for (const child of root.children ?? []) {
      output.push(modelMember(child, root.kind, context, subjectId));
    }
    for (const signature of root.indexSignatures ?? []) {
      const signatures = modelSignatures([signature], context.normalized);
      enforceSignatureLimit(signatures.length, context, subjectId);
      output.push({
        name: "[index]",
        meanings: ["value"],
        declarationKinds: ["index"],
        scope: "instance",
        visibility: "public",
        optional: false,
        readonly: false,
        display: signatures[0]?.display ?? null,
        signatures,
        locations: reflectionLocations([signature], context.normalized),
        documentation: documentation([signature]),
        deprecation: deprecation([signature]),
      });
    }
  }
  return output.sort(compareMembers);
}

function modelMember(
  reflection: DeclarationReflection,
  parentKind: ReflectionKind,
  context: ModelContext,
  subjectId: string,
): MemberV1 {
  const signatures = modelSignatures(reflection.getAllSignatures(), context.normalized);
  enforceSignatureLimit(signatures.length, context, subjectId);
  const kinds = memberDeclarationKinds(reflection);
  if (kinds.length === 0) throw new UnsafeModelError();
  return {
    name: boundedIdentifier(reflection.name),
    meanings: ["value"],
    declarationKinds: kinds,
    scope:
      reflection.flags.isStatic ||
      parentKind === ReflectionKind.Namespace ||
      parentKind === ReflectionKind.Module
        ? "static"
        : "instance",
    visibility: reflection.flags.isPrivate
      ? "private"
      : reflection.flags.isProtected
        ? "protected"
        : "public",
    optional: reflection.flags.isOptional,
    readonly: reflection.flags.isReadonly,
    display: memberDisplay(reflection, signatures),
    signatures,
    locations: reflectionLocations([reflection], context.normalized),
    documentation: documentation([reflection, ...reflection.getAllSignatures()]),
    deprecation: deprecation([reflection, ...reflection.getAllSignatures()]),
  };
}

function modelSignatures(
  values: readonly SignatureReflection[],
  normalized: NormalizedInput,
): readonly SignatureV1[] {
  return values.map((signature, ordinal) => ({
    kind: signature.kind === ReflectionKind.ConstructorSignature ? "construct" : "call",
    ordinal,
    display: signatureDisplay(signature),
    typeParameters: modelTypeParameters(signature.typeParameters ?? []),
    location: reflectionLocation(signature.sources?.[0], normalized),
  }));
}

function signatureDisplay(signature: SignatureReflection): string {
  const typeParameters = modelTypeParameters(signature.typeParameters ?? []);
  const generics =
    typeParameters.length === 0
      ? ""
      : `<${typeParameters
          .map(
            ({ name, constraint, default: defaultType }) =>
              `${name}${constraint === null ? "" : ` extends ${constraint}`}${
                defaultType === null ? "" : ` = ${defaultType}`
              }`,
          )
          .join(", ")}>`;
  const parameters = (signature.parameters ?? [])
    .map((parameter) => {
      const rest = parameter.flags.isRest ? "..." : "";
      const optional = parameter.flags.isOptional ? "?" : "";
      return `${rest}${parameter.name}${optional}: ${typeDisplay(parameter.type)}`;
    })
    .join(", ");
  const prefix =
    signature.kind === ReflectionKind.ConstructorSignature
      ? "new "
      : boundedIdentifier(signature.name);
  return boundedDisplay(`${prefix}${generics}(${parameters}): ${typeDisplay(signature.type)}`);
}

function modelTypeParameters(
  values: readonly TypeParameterReflection[],
): readonly TypeParameterV1[] {
  return values.map((parameter) => ({
    name: boundedIdentifier(parameter.name),
    constraint: parameter.type === undefined ? null : typeDisplay(parameter.type),
    default: parameter.default === undefined ? null : typeDisplay(parameter.default),
  }));
}

function firstTypeParameters(
  reflections: readonly DeclarationReflection[],
): readonly TypeParameterV1[] {
  const reflection = reflections.find((candidate) => candidate.typeParameters !== undefined);
  return modelTypeParameters(reflection?.typeParameters ?? []);
}

function typeDisplay(value: { toString(): string } | undefined): string {
  return boundedDisplay(value?.toString() ?? "unknown");
}

function rootDisplay(reflections: readonly DeclarationReflection[]): string | null {
  const reflection = reflections[0];
  if (reflection === undefined) return null;
  if (reflection.type !== undefined) {
    return boundedDisplay(`${reflection.name}: ${typeDisplay(reflection.type)}`);
  }
  const signature = reflection.signatures?.[0];
  if (signature !== undefined) return signatureDisplay(signature);
  return boundedDisplay(`${ReflectionKind.singularString(reflection.kind)} ${reflection.name}`);
}

function memberDisplay(
  reflection: DeclarationReflection,
  signatures: readonly SignatureV1[],
): string | null {
  if (reflection.type !== undefined) {
    return boundedDisplay(`${reflection.name}: ${typeDisplay(reflection.type)}`);
  }
  return signatures[0]?.display ?? null;
}

function rootMeanings(reflections: readonly DeclarationReflection[]): readonly SymbolMeaningV1[] {
  const values = new Set<SymbolMeaningV1>();
  for (const { kind } of reflections) {
    if (
      kind === ReflectionKind.Class ||
      kind === ReflectionKind.Interface ||
      kind === ReflectionKind.Enum ||
      kind === ReflectionKind.TypeAlias
    ) {
      values.add("type");
    }
    if (
      kind === ReflectionKind.Class ||
      kind === ReflectionKind.Enum ||
      kind === ReflectionKind.Function ||
      kind === ReflectionKind.Variable ||
      kind === ReflectionKind.Namespace ||
      kind === ReflectionKind.Module
    ) {
      values.add("value");
    }
    if (kind === ReflectionKind.Namespace || kind === ReflectionKind.Module) {
      values.add("namespace");
    }
  }
  return meaningOrder.filter((value) => values.has(value));
}

function rootDeclarationKinds(
  reflections: readonly DeclarationReflection[],
): PublicSymbolV1["declarationKinds"] {
  const values = new Set<PublicSymbolV1["declarationKinds"][number]>();
  for (const { kind } of reflections) {
    if (kind === ReflectionKind.Class) values.add("class");
    else if (kind === ReflectionKind.Interface) values.add("interface");
    else if (kind === ReflectionKind.Function) values.add("function");
    else if (kind === ReflectionKind.Variable) values.add("variable");
    else if (kind === ReflectionKind.Enum) values.add("enum");
    else if (kind === ReflectionKind.TypeAlias) values.add("type-alias");
    else if (kind === ReflectionKind.Namespace || kind === ReflectionKind.Module) {
      values.add("namespace");
    }
  }
  return declarationKindOrder.filter((value) => values.has(value));
}

function memberDeclarationKinds(reflection: DeclarationReflection): MemberV1["declarationKinds"] {
  const values = new Set<MemberV1["declarationKinds"][number]>();
  if (
    reflection.kind === ReflectionKind.Property ||
    reflection.kind === ReflectionKind.Variable ||
    reflection.kind === ReflectionKind.EnumMember
  ) {
    values.add("property");
  } else if (
    reflection.kind === ReflectionKind.Method ||
    reflection.kind === ReflectionKind.Function
  ) {
    values.add("method");
  } else if (reflection.kind === ReflectionKind.Constructor) {
    values.add("constructor");
  } else if (reflection.kind === ReflectionKind.Accessor) {
    if (reflection.getSignature !== undefined) values.add("getter");
    if (reflection.setSignature !== undefined) values.add("setter");
  }
  return memberKindOrder.filter((value) => values.has(value));
}

function modelHeritage(
  reflections: readonly DeclarationReflection[],
  normalized: NormalizedInput,
): readonly HeritageV1[] {
  const output: HeritageV1[] = [];
  for (const reflection of reflections) {
    const location = reflectionLocation(reflection.sources?.[0], normalized);
    for (const type of reflection.extendedTypes ?? []) {
      output.push({ kind: "extends", display: typeDisplay(type), location });
    }
    for (const type of reflection.implementedTypes ?? []) {
      output.push({ kind: "implements", display: typeDisplay(type), location });
    }
  }
  return output;
}

function documentation(reflections: readonly Reflection[]): string | null {
  for (const reflection of reflections) {
    const value = boundedDocumentation(Comment.combineDisplayParts(reflection.comment?.summary));
    if (value !== null) return value;
    if ("signatures" in reflection) {
      const nested = documentation((reflection as DeclarationReflection).signatures ?? []);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function deprecation(reflections: readonly Reflection[]): DeprecationV1 | null {
  for (const reflection of reflections) {
    const tag = reflection.comment?.blockTags.find(({ tag }) => tag === "@deprecated");
    if (tag !== undefined) {
      return { message: boundedDocumentation(Comment.combineDisplayParts(tag.content)) };
    }
    if ("signatures" in reflection) {
      const nested = deprecation((reflection as DeclarationReflection).signatures ?? []);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function reflectionLocations(
  reflections: readonly (DeclarationReflection | SignatureReflection)[],
  normalized: NormalizedInput,
): readonly SourceLocationV1[] {
  const output = new Map<string, SourceLocationV1>();
  for (const reflection of reflections) {
    for (const source of reflection.sources ?? []) {
      const location = reflectionLocation(source, normalized);
      if (location !== null) output.set(locationKey(location), location);
    }
  }
  return [...output.values()].sort(compareLocations);
}

function reflectionLocation(
  source: SourceReference | undefined,
  normalized: NormalizedInput,
): SourceLocationV1 | null {
  if (source === undefined) return null;
  const absolute = normalizeAbsolutePath(source.fullFileName);
  if (absolute === undefined || !isContained(normalized.packageRoot, absolute)) return null;
  const relative = posix.relative(normalized.packageRoot, absolute);
  if (!isPortableRelativePath(relative)) return null;
  return { path: relative, line: source.line, column: source.character + 1 };
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
    if (candidate === undefined || finalAliasedSymbol(candidate, context.checker) !== target) {
      continue;
    }
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
  return candidate === undefined ? fallback : Math.min(candidate, fallback);
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

function sourceLocation(node: ts.Node, normalized: NormalizedInput): SourceLocationV1 | null {
  const fileName = normalizeAbsolutePath(node.getSourceFile().fileName);
  if (fileName === undefined || !isContained(normalized.packageRoot, fileName)) return null;
  const relative = posix.relative(normalized.packageRoot, fileName);
  if (!isPortableRelativePath(relative)) return null;
  const point = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart());
  return { path: relative, line: point.line + 1, column: point.character + 1 };
}

function aliasSourceModule(declaration: ts.Declaration): string | null {
  let current: ts.Node | undefined = declaration;
  while (current !== undefined) {
    if (
      ts.isExportDeclaration(current) &&
      current.moduleSpecifier !== undefined &&
      ts.isStringLiteral(current.moduleSpecifier)
    ) {
      return boundedSourceModule(current.moduleSpecifier.text);
    }
    if (ts.isImportDeclaration(current) && ts.isStringLiteral(current.moduleSpecifier)) {
      return boundedSourceModule(current.moduleSpecifier.text);
    }
    current = current.parent;
  }
  return null;
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

function publicSymbolId(entrypoint: string, name: string): string | undefined {
  return isWellFormedUnicode(name) ? `${entrypoint}#${encodeURIComponent(name)}` : undefined;
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
  const normalized = normalizeWhitespace(value);
  if (
    normalized.length === 0 ||
    Buffer.byteLength(normalized) > 4_096 ||
    !isWellFormedUnicode(normalized)
  ) {
    throw new UnsafeModelError();
  }
  return normalized;
}

function boundedDocumentation(value: string): string | null {
  const normalized = normalizeWhitespace(value);
  if (
    normalized.length === 0 ||
    Buffer.byteLength(normalized) > 1_024 ||
    !isWellFormedUnicode(normalized)
  ) {
    return null;
  }
  return normalized;
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

function enforceSignatureLimit(count: number, context: ModelContext, subjectId: string): void {
  if (count > context.normalized.limits.maxSignaturesPerSymbol) {
    throw new RootOmissionError(signatureOmission(subjectId));
  }
}

function compareMembers(left: MemberV1, right: MemberV1): number {
  const scope = (left.scope === "static" ? 0 : 1) - (right.scope === "static" ? 0 : 1);
  if (scope !== 0) return scope;
  const name = compareCodePointStrings(left.name, right.name);
  if (name !== 0) return name;
  return (
    memberKindOrder.indexOf(left.declarationKinds[0] ?? "property") -
      memberKindOrder.indexOf(right.declarationKinds[0] ?? "property") ||
    compareLocations(left.locations[0], right.locations[0])
  );
}

function compareLocations(
  left: SourceLocationV1 | undefined,
  right: SourceLocationV1 | undefined,
): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  return (
    compareCodePointStrings(left.path, right.path) ||
    left.line - right.line ||
    left.column - right.column
  );
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

function isRelativeModuleSpecifier(value: string): boolean {
  return value === "." || value === ".." || value.startsWith("./") || value.startsWith("../");
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
    omission: { kind: "symbols", limit: "maxPublicSymbols", omittedCount, subjectId },
    failure: publicSymbolLimitExceeded(),
  };
}

function graphDepthOmission(subjectId: string | null): RootOmission {
  return {
    omission: { kind: "graph", limit: "maxGraphDepth", omittedCount: 1, subjectId },
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
    omission: { kind: "external-declaration", limit: null, omittedCount: 1, subjectId },
    failure: unsupportedFailure(),
  };
}

function locationKey(location: SourceLocationV1): string {
  return `${location.path}:${location.line}:${location.column}`;
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
  return freezeDeep({ ok: false, failure: unsupportedFailure() });
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
