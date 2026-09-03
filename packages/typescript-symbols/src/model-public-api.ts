import { posix } from "node:path";
import type {
  AliasHopV1,
  DeprecationV1,
  HeritageV1,
  MemberV1,
  PublicApiOmissionV1,
  PublicSymbolV1,
  SignatureV1,
  SourceLocationV1,
  SymbolMeaningV1,
  TypeParameterV1,
} from "@package-spelunker/contracts";
import type {
  NormalizedTypeScriptConditions,
  TypeScriptProjectResolutionOptions,
} from "@package-spelunker/typescript-resolution";
import { normalizeTypeScriptConditions } from "@package-spelunker/typescript-resolution/conditions";
import {
  Application,
  Comment,
  type DeclarationReflection,
  makeRecursiveVisitor,
  type ReferenceType,
  type Reflection,
  ReflectionKind,
  type SignatureReflection,
  type SomeType,
  type SourceReference,
  type TypeParameterReflection,
} from "typedoc";
import ts from "typescript";
import type {
  ModelPublicApiInput,
  PublicApiModel,
  PublicApiModelFailure,
  PublicApiModelFileHost,
  PublicApiModelLimits,
  PublicApiModelResult,
} from "./contracts.js";

interface NormalizedInput {
  readonly snapshotId: string;
  readonly entrypoint: string;
  readonly declarationTarget: string;
  readonly absoluteDeclarationTarget: string;
  readonly packageRoot: string;
  readonly compilerVersion: string;
  readonly projectContextHash: string;
  readonly projectOptions: TypeScriptProjectResolutionOptions;
  readonly conditions: NormalizedTypeScriptConditions;
  readonly currentDirectory: string;
  readonly compilerLibRoot: string | null;
  readonly defaultLibFileName: string | null;
  readonly limits: PublicApiModelLimits;
}

interface ModelContext {
  readonly checker: ts.TypeChecker;
  readonly host: PublicApiModelFileHost;
  readonly normalized: NormalizedInput;
  readonly ownedPackagePaths: Map<string, boolean>;
  readonly publicSymbolUsage: { traversed: number };
  readonly signal: AbortSignal | undefined;
}

interface ModeledRoot {
  readonly symbol: PublicSymbolV1;
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

interface ExportedRoot {
  readonly name: string;
  readonly symbol: ts.Symbol | undefined;
  readonly exportEquals: ts.ExportAssignment | undefined;
}

const defaultLimits: PublicApiModelLimits = Object.freeze({
  maxDeclarationFiles: 4_096,
  maxGraphDepth: 128,
  maxPublicSymbols: 50_000,
  maxSignaturesPerSymbol: 256,
});

const declarationExtensionPattern = /\.d\.(?:ts|mts|cts)$/;
const maxRelativePathBytes = 1_024;
const maxSourceLocations = 16_384;
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
    const checker = program.getTypeChecker();
    const unresolvedModules = classifyUnresolvedModules(
      entrySource,
      semanticDiagnostics.filter(({ code }) => code === 2307),
      checker,
    );
    if (unresolvedModules.kind === "malformed") return malformedDeclarations();
    if (unresolvedModules.kind === "unsupported") return unsupportedContamination();

    const moduleSymbol = checker.getSymbolAtLocation(entrySource);
    if (moduleSymbol === undefined) return malformedDeclarations();
    const context: ModelContext = {
      checker,
      host: input.host,
      normalized,
      ownedPackagePaths: new Map(),
      publicSymbolUsage: { traversed: 0 },
      signal: input.signal,
    };

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
    const exportEquals = findExportEquals(entrySource);
    if (exportEquals !== undefined) {
      exportsByName.set("export=", checker.getSymbolAtLocation(exportEquals.expression));
    }
    const exports: ExportedRoot[] = [...exportsByName]
      .map(([name, symbol]) => ({
        name,
        symbol,
        exportEquals: name === "export=" ? exportEquals : undefined,
      }))
      .sort((left, right) => compareCodePointStrings(left.name, right.name));

    const retained: PublicSymbolV1[] = [];
    let firstOmission: RootOmission | undefined;
    for (const [exportIndex, exported] of exports.entries()) {
      checkCancellation(input.signal);
      const id = publicSymbolId(normalized.entrypoint, exported.name);
      if (id === undefined) return analysisFailed();
      if (!consumePublicSymbol(context)) {
        if (firstOmission !== undefined) return analysisFailed();
        firstOmission = symbolBudgetOmission(exports.length - exportIndex, id);
        break;
      }
      const result = unresolvedModules.names.has(exported.name)
        ? externalOmission(id)
        : exported.symbol === undefined
          ? undefined
          : modelRoot(
              exported.symbol,
              exported.name,
              id,
              reflectionsForExport(reflectionsByName, exported.name, exported.symbol, checker),
              entrySource,
              context,
              exported.exportEquals,
            );
      if (result === undefined) return analysisFailed();
      if ("omission" in result) {
        if (result.omission.kind === "symbols") {
          if (firstOmission !== undefined) return analysisFailed();
          firstOmission = symbolBudgetOmission(exports.length - exportIndex, id);
          break;
        }
        if (firstOmission === undefined) firstOmission = result;
        else {
          if (!sameOmission(firstOmission, result)) return analysisFailed();
          firstOmission = mergeOmission(firstOmission, result);
        }
      } else {
        retained.push(result.symbol);
      }
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
      usage: { declarationFiles, publicSymbols: context.publicSymbolUsage.traversed },
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

function findExportEquals(source: ts.SourceFile): ts.ExportAssignment | undefined {
  return source.statements.find(
    (statement): statement is ts.ExportAssignment =>
      ts.isExportAssignment(statement) && statement.isExportEquals === true,
  );
}

function reflectionsForExport(
  groups: ReadonlyMap<string, readonly DeclarationReflection[]>,
  exportName: string,
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
): readonly DeclarationReflection[] {
  const direct = groups.get(exportName);
  if (direct !== undefined && direct.length > 0) return direct;
  const target = finalAliasedSymbol(symbol, checker);
  return groups.get(normalizeExportName(target.getName())) ?? [];
}

function modelRoot(
  exportedSymbol: ts.Symbol,
  exportName: string,
  id: string,
  reflections: readonly DeclarationReflection[],
  entrySource: ts.SourceFile,
  context: ModelContext,
  exportEquals: ts.ExportAssignment | undefined,
): ModeledRoot | RootOmission | undefined {
  if (reflections.length === 0) return undefined;
  try {
    const aliasChain: AliasHopV1[] = [];
    if (exportEquals !== undefined) {
      const location = sourceLocation(exportEquals, context);
      if (location === null) return externalOmission(id);
      aliasChain.push({
        targetName: boundedIdentifier(normalizeExportName(exportedSymbol.getName())),
        sourceModule: null,
        location,
      });
    }
    const target = resolveAliasChain(exportedSymbol, aliasChain, context, id);
    if (aliasChain.length === 0) {
      aliasChain.push(...starReexportChain(entrySource, exportName, target, context, id));
    }
    enforceGraphLimit(aliasChain.length, context, id);
    const declarations = uniqueDeclarations([
      ...(exportedSymbol.declarations ?? []),
      ...(target.declarations ?? []),
    ]);
    if (declarations.length === 0) throw new UnsafeModelError();
    if (declarations.some((item) => isExternalDeclaration(item, context))) {
      return externalOmission(id);
    }

    const locations = reflectionLocations(reflections, context);
    if (locations.length === 0) return externalOmission(id);
    const signatures = modelSignatures(
      reflections.flatMap((reflection) => reflection.signatures ?? []),
      context,
      id,
    );
    enforceSignatureLimit(signatures.length, context, id);
    const members = modelMembers(reflections, context, id);
    const graphDepth = aliasChain.length;
    const namespaceExports = modelNamespaceExports(reflections, target, id, graphDepth, context);
    assertReflectionAuthority(reflections, context, id);
    checkHeritageDepth(target, graphDepth, context, id);
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
      typeParameters: firstTypeParameters(reflections, context, id),
      signatures,
      members,
      heritage: modelHeritage(reflections, context, id),
      namespaceExports: namespaceExports.map(({ symbol }) => symbol),
      documentation: symbolDocumentation(exportedSymbol, target, context.checker, reflections),
      deprecation:
        symbolDeprecation(exportedSymbol, context.checker) ??
        symbolDeprecation(target, context.checker) ??
        deprecation(reflections),
    };
    return {
      symbol: freezeDeep(symbol),
    };
  } catch (error) {
    if (error instanceof RootOmissionError) return error.value;
    throw error;
  }
}

function modelNamespaceExports(
  roots: readonly DeclarationReflection[],
  target: ts.Symbol,
  parentId: string,
  depth: number,
  context: ModelContext,
): readonly ModeledRoot[] {
  const namespaceRoots = roots.filter(
    ({ kind }) => kind === ReflectionKind.Namespace || kind === ReflectionKind.Module,
  );
  if (namespaceRoots.length === 0) return [];
  const groups = groupReflections(namespaceRoots.flatMap((root) => root.children ?? []));
  if (groups.size === 0) return [];
  const nextDepth = depth + 1;
  if (nextDepth > context.normalized.limits.maxGraphDepth) {
    throw new RootOmissionError(graphDepthOmission(parentId, groups.size));
  }
  const symbols = new Map<string, ts.Symbol>();
  if ((target.flags & ts.SymbolFlags.Module) !== 0) {
    for (const symbol of context.checker.getExportsOfModule(target)) {
      symbols.set(normalizeExportName(symbol.getName()), symbol);
    }
  }
  const output: ModeledRoot[] = [];
  for (const [name, reflections] of [...groups].sort(([left], [right]) =>
    compareCodePointStrings(left, right),
  )) {
    const id = nestedPublicSymbolId(parentId, name);
    const exported = symbols.get(name);
    if (id === undefined || exported === undefined) throw new UnsafeModelError();
    if (!consumePublicSymbol(context)) {
      throw new RootOmissionError(symbolBudgetOmission(1, id));
    }
    output.push(modelNestedRoot(exported, name, id, reflections, nextDepth, context));
  }
  return output;
}

function modelNestedRoot(
  exportedSymbol: ts.Symbol,
  exportName: string,
  id: string,
  reflections: readonly DeclarationReflection[],
  depth: number,
  context: ModelContext,
): ModeledRoot {
  const aliasChain: AliasHopV1[] = [];
  const target = resolveAliasChain(exportedSymbol, aliasChain, context, id);
  const graphDepth = depth + aliasChain.length;
  enforceGraphLimit(graphDepth, context, id);
  const declarations = uniqueDeclarations([
    ...(exportedSymbol.declarations ?? []),
    ...(target.declarations ?? []),
  ]);
  if (
    declarations.length === 0 ||
    declarations.some((declaration) => isExternalDeclaration(declaration, context))
  ) {
    throw new RootOmissionError(externalOmission(id));
  }
  const locations = reflectionLocations(reflections, context);
  if (locations.length === 0) throw new RootOmissionError(externalOmission(id));
  const signatures = modelSignatures(
    reflections.flatMap((reflection) => reflection.signatures ?? []),
    context,
    id,
  );
  enforceSignatureLimit(signatures.length, context, id);
  const members = modelMembers(reflections, context, id);
  const namespaceExports = modelNamespaceExports(reflections, target, id, graphDepth, context);
  assertReflectionAuthority(reflections, context, id);
  checkHeritageDepth(target, graphDepth, context, id);
  const meanings = rootMeanings(reflections);
  const declarationKinds = rootDeclarationKinds(reflections);
  if (meanings.length === 0 || declarationKinds.length === 0) throw new UnsafeModelError();
  return {
    symbol: freezeDeep({
      id,
      name: boundedIdentifier(exportName),
      meanings,
      declarationKinds,
      display: rootDisplay(reflections),
      aliasChain,
      locations,
      typeParameters: firstTypeParameters(reflections, context, id),
      signatures,
      members,
      heritage: modelHeritage(reflections, context, id),
      namespaceExports: namespaceExports.map(({ symbol }) => symbol),
      documentation: symbolDocumentation(exportedSymbol, target, context.checker, reflections),
      deprecation:
        symbolDeprecation(exportedSymbol, context.checker) ??
        symbolDeprecation(target, context.checker) ??
        deprecation(reflections),
    }),
  };
}

function modelMembers(
  roots: readonly DeclarationReflection[],
  context: ModelContext,
  subjectId: string,
): readonly MemberV1[] {
  const output: MemberV1[] = [];
  for (const root of roots) {
    checkCancellation(context.signal);
    if (root.kind === ReflectionKind.Namespace || root.kind === ReflectionKind.Module) continue;
    const rootLocations = reflectionLocations([root], context);
    for (const child of root.children ?? []) {
      if (!consumePublicSymbol(context)) {
        throw new RootOmissionError(symbolBudgetOmission(1, subjectId));
      }
      const childLocations = reflectionLocations([child], context);
      const inheritedLocations = inheritedReflectionLocations(child, context, subjectId);
      output.push(
        modelMember(
          child,
          root.kind,
          childLocations.length > 0
            ? childLocations
            : inheritedLocations.length > 0
              ? inheritedLocations
              : rootLocations,
          context,
          subjectId,
        ),
      );
    }
    for (const signature of root.indexSignatures ?? []) {
      if (!consumePublicSymbol(context)) {
        throw new RootOmissionError(symbolBudgetOmission(1, subjectId));
      }
      const ownLocations = reflectionLocations([signature], context);
      const locations = ownLocations.length === 0 ? rootLocations : ownLocations;
      if (locations.length === 0) throw new UnsafeModelError();
      output.push({
        name: "[index]",
        meanings: ["value"],
        declarationKinds: ["index"],
        scope: "instance",
        visibility: "public",
        optional: false,
        readonly: signature.flags.isReadonly,
        display: indexSignatureDisplay(signature),
        signatures: [],
        locations,
        documentation: documentation([signature]),
        deprecation: deprecation([signature]),
      });
    }
  }
  return output.sort(compareMembers);
}

function inheritedReflectionLocations(
  reflection: DeclarationReflection,
  context: ModelContext,
  subjectId: string,
): readonly SourceLocationV1[] {
  const inheritedFrom = reflection.inheritedFrom;
  if (inheritedFrom === undefined) return [];
  const fileName = inheritedFrom.symbolId?.fileName;
  if (fileName !== undefined) {
    const absolute = normalizeAbsolutePath(fileName);
    if (absolute === undefined || !isAuthoritativePath(absolute, context)) {
      throw new RootOmissionError(externalOmission(subjectId));
    }
  }
  const target = inheritedFrom.reflection;
  if (target === undefined || (!target.isDeclaration() && !target.isSignature())) return [];
  for (const source of target.sources ?? []) {
    const absolute = normalizeAbsolutePath(source.fullFileName);
    if (absolute === undefined || !isAuthoritativePath(absolute, context)) {
      throw new RootOmissionError(externalOmission(subjectId));
    }
  }
  return reflectionLocations([target], context);
}

function modelMember(
  reflection: DeclarationReflection,
  parentKind: ReflectionKind,
  locations: readonly SourceLocationV1[],
  context: ModelContext,
  subjectId: string,
): MemberV1 {
  const signatures = modelSignatures(memberSignatures(reflection), context, subjectId);
  enforceSignatureLimit(signatures.length, context, subjectId);
  const kinds = memberDeclarationKinds(reflection, parentKind);
  if (kinds.length === 0) throw new UnsafeModelError();
  if (locations.length === 0) throw new UnsafeModelError();
  return {
    name: boundedIdentifier(reflection.name),
    meanings: ["value"],
    declarationKinds: kinds,
    scope:
      reflection.flags.isStatic ||
      parentKind === ReflectionKind.Namespace ||
      parentKind === ReflectionKind.Module
        ? "static"
        : kinds.includes("constructor")
          ? "static"
          : "instance",
    visibility: reflection.flags.isPrivate
      ? "private"
      : reflection.flags.isProtected
        ? "protected"
        : "public",
    optional: reflection.flags.isOptional,
    readonly:
      reflection.flags.isReadonly ||
      (reflection.kind === ReflectionKind.Accessor && reflection.setSignature === undefined),
    display: memberDisplay(reflection, signatures),
    signatures,
    locations,
    documentation: documentation([reflection, ...reflection.getAllSignatures()]),
    deprecation: deprecation([reflection, ...reflection.getAllSignatures()]),
  };
}

function modelSignatures(
  values: readonly SignatureReflection[],
  context: ModelContext,
  subjectId: string,
): readonly SignatureV1[] {
  enforceSignatureLimit(values.length, context, subjectId);
  let callOrdinal = 0;
  let constructOrdinal = 0;
  return values.map((signature) => {
    const kind = signature.kind === ReflectionKind.ConstructorSignature ? "construct" : "call";
    const ordinal = kind === "construct" ? constructOrdinal++ : callOrdinal++;
    return {
      kind,
      ordinal,
      display: signatureDisplay(signature),
      typeParameters: modelTypeParameters(signature.typeParameters ?? [], context, subjectId),
      location: reflectionLocation(signature.sources?.[0], context),
    };
  });
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

function memberSignatures(reflection: DeclarationReflection): readonly SignatureReflection[] {
  if (reflection.kind === ReflectionKind.Accessor) return [];
  return reflection
    .getAllSignatures()
    .filter(
      ({ kind }) =>
        kind === ReflectionKind.CallSignature || kind === ReflectionKind.ConstructorSignature,
    );
}

function indexSignatureDisplay(signature: SignatureReflection): string {
  const parameters = (signature.parameters ?? [])
    .map((parameter) => `${parameter.name}: ${typeDisplay(parameter.type)}`)
    .join(", ");
  return boundedDisplay(`[${parameters}]: ${typeDisplay(signature.type)}`);
}

function modelTypeParameters(
  values: readonly TypeParameterReflection[],
  context?: ModelContext,
  subjectId?: string,
): readonly TypeParameterV1[] {
  if (context !== undefined && subjectId !== undefined) {
    enforceSignatureLimit(values.length, context, subjectId);
  }
  return values.map((parameter) => ({
    name: boundedIdentifier(parameter.name),
    constraint: parameter.type === undefined ? null : typeDisplay(parameter.type),
    default: parameter.default === undefined ? null : typeDisplay(parameter.default),
  }));
}

function firstTypeParameters(
  reflections: readonly DeclarationReflection[],
  context: ModelContext,
  subjectId: string,
): readonly TypeParameterV1[] {
  const reflection = reflections.find((candidate) => candidate.typeParameters !== undefined);
  return modelTypeParameters(reflection?.typeParameters ?? [], context, subjectId);
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
  if (reflection.kind === ReflectionKind.Accessor) {
    const accessorType =
      reflection.getSignature?.type ?? reflection.setSignature?.parameters?.[0]?.type;
    return boundedDisplay(`${reflection.name}: ${typeDisplay(accessorType)}`);
  }
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

function memberDeclarationKinds(
  reflection: DeclarationReflection,
  parentKind: ReflectionKind,
): MemberV1["declarationKinds"] {
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
    values.add(
      parentKind === ReflectionKind.Interface || parentKind === ReflectionKind.TypeLiteral
        ? "construct"
        : "constructor",
    );
  } else if (reflection.kind === ReflectionKind.Accessor) {
    if (reflection.getSignature !== undefined) values.add("getter");
    if (reflection.setSignature !== undefined) values.add("setter");
  }
  return memberKindOrder.filter((value) => values.has(value));
}

function modelHeritage(
  reflections: readonly DeclarationReflection[],
  context: ModelContext,
  subjectId: string,
): readonly HeritageV1[] {
  const output: HeritageV1[] = [];
  for (const reflection of reflections) {
    const location = reflectionLocation(reflection.sources?.[0], context);
    for (const type of reflection.extendedTypes ?? []) {
      output.push({ kind: "extends", display: typeDisplay(type), location });
    }
    for (const type of reflection.implementedTypes ?? []) {
      output.push({ kind: "implements", display: typeDisplay(type), location });
    }
  }
  enforceGraphLimit(output.length, context, subjectId);
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

function symbolDocumentation(
  exported: ts.Symbol,
  target: ts.Symbol,
  checker: ts.TypeChecker,
  reflections: readonly Reflection[],
): string | null {
  const declarationText = declarationDocumentation(exported.declarations ?? []);
  if (declarationText !== null) return declarationText;
  const exportedText = boundedDocumentation(
    ts.displayPartsToString(exported.getDocumentationComment(checker)),
  );
  if (exportedText !== null) return exportedText;
  const targetText = boundedDocumentation(
    ts.displayPartsToString(target.getDocumentationComment(checker)),
  );
  return targetText ?? documentation(reflections);
}

function declarationDocumentation(declarations: readonly ts.Declaration[]): string | null {
  for (const declaration of declarations) {
    let current: ts.Node | undefined = declaration;
    while (current !== undefined && !ts.isSourceFile(current)) {
      for (const item of ts.getJSDocCommentsAndTags(current)) {
        if (!ts.isJSDoc(item)) continue;
        const text = boundedDocumentation(ts.getTextOfJSDocComment(item.comment) ?? "");
        if (text !== null) return text;
      }
      current = current.parent;
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

function symbolDeprecation(symbol: ts.Symbol, checker: ts.TypeChecker): DeprecationV1 | null {
  const tag = symbol.getJsDocTags(checker).find(({ name }) => name === "deprecated");
  if (tag === undefined) return null;
  return { message: boundedDocumentation(ts.displayPartsToString(tag.text)) };
}

function assertReflectionAuthority(
  reflections: readonly DeclarationReflection[],
  context: ModelContext,
  subjectId: string,
): void {
  const visited = new Set<Reflection>();
  const visitor = makeRecursiveVisitor({
    reference(type: ReferenceType) {
      if (type.refersToTypeParameter) return;
      if (type.isIntentionallyBroken()) {
        throw new RootOmissionError(externalOmission(subjectId));
      }
      const fileName = type.symbolId?.fileName;
      if (fileName !== undefined) {
        const absolute = normalizeAbsolutePath(fileName);
        if (absolute === undefined || !isAuthoritativePath(absolute, context)) {
          throw new RootOmissionError(externalOmission(subjectId));
        }
      }
      const reflection = type.reflection;
      if (reflection !== undefined) visitReflection(reflection);
    },
    reflection(type) {
      visitReflection(type.declaration);
    },
  });
  const visitType = (type: SomeType | undefined): void => {
    type?.visit(visitor);
  };
  const visitTypeParameter = (parameter: TypeParameterReflection): void => {
    visitType(parameter.type);
    visitType(parameter.default);
  };
  const visitSignature = (signature: SignatureReflection): void => {
    visitReflection(signature);
  };
  function visitReflection(reflection: Reflection): void {
    checkCancellation(context.signal);
    if (visited.has(reflection)) return;
    visited.add(reflection);
    if (reflection.isDeclaration() || reflection.isSignature()) {
      for (const source of reflection.sources ?? []) {
        const absolute = normalizeAbsolutePath(source.fullFileName);
        if (absolute === undefined || !isAuthoritativePath(absolute, context)) {
          throw new RootOmissionError(externalOmission(subjectId));
        }
      }
    }
    if (reflection.isSignature()) {
      visitType(reflection.type);
      for (const parameter of reflection.typeParameters ?? []) visitTypeParameter(parameter);
      for (const parameter of reflection.parameters ?? []) visitReflection(parameter);
      return;
    }
    if (reflection.isParameter()) {
      visitType(reflection.type);
      return;
    }
    if (reflection.isTypeParameter()) {
      visitTypeParameter(reflection);
      return;
    }
    if (!reflection.isDeclaration()) return;
    visitType(reflection.type);
    for (const parameter of reflection.typeParameters ?? []) visitTypeParameter(parameter);
    for (const type of reflection.extendedTypes ?? []) visitType(type);
    for (const type of reflection.implementedTypes ?? []) visitType(type);
    for (const signature of reflection.signatures ?? []) visitSignature(signature);
    for (const signature of reflection.indexSignatures ?? []) visitSignature(signature);
    if (reflection.getSignature !== undefined) visitSignature(reflection.getSignature);
    if (reflection.setSignature !== undefined) visitSignature(reflection.setSignature);
    for (const child of reflection.children ?? []) visitReflection(child);
  }
  for (const reflection of reflections) visitReflection(reflection);
}

function reflectionLocations(
  reflections: readonly (DeclarationReflection | SignatureReflection)[],
  context: ModelContext,
): readonly SourceLocationV1[] {
  const output = new Map<string, SourceLocationV1>();
  for (const reflection of reflections) {
    for (const source of reflection.sources ?? []) {
      const location = reflectionLocation(source, context);
      if (location !== null) output.set(locationKey(location), location);
      if (output.size > maxSourceLocations) throw new UnsafeModelError();
    }
  }
  return [...output.values()].sort(compareLocations);
}

function reflectionLocation(
  source: SourceReference | undefined,
  context: ModelContext,
): SourceLocationV1 | null {
  if (source === undefined) return null;
  const absolute = normalizeAbsolutePath(source.fullFileName);
  if (absolute === undefined) return null;
  if (isOwnedPackagePath(absolute, context)) {
    const relative = posix.relative(context.normalized.packageRoot, absolute);
    if (!isPortableRelativePath(relative)) return null;
    return {
      authority: "package",
      path: relative,
      line: source.line,
      column: source.character + 1,
    };
  }
  const compilerLibRoot = context.normalized.compilerLibRoot;
  if (
    compilerLibRoot === null ||
    !isContained(compilerLibRoot, absolute) ||
    !isPinnedLibFileName(absolute)
  ) {
    return null;
  }
  const relative = posix.relative(compilerLibRoot, absolute);
  if (!isPortableRelativePath(relative)) return null;
  return {
    authority: "compiler-lib",
    path: relative,
    line: source.line,
    column: source.character + 1,
  };
}

function classifyUnresolvedModules(
  entrySource: ts.SourceFile,
  diagnostics: readonly ts.Diagnostic[],
  checker: ts.TypeChecker,
): UnresolvedModuleClassification {
  const names = new Set<string>();
  const unresolvedExports = new Set<ts.ExportDeclaration>();
  for (const diagnostic of diagnostics) {
    const source = diagnostic.file;
    if (source === undefined || diagnostic.start === undefined) {
      return { kind: "unsupported", names };
    }
    const declaration = source.statements.find(
      (statement): statement is ts.ExportDeclaration | ts.ImportDeclaration => {
        if (!ts.isExportDeclaration(statement) && !ts.isImportDeclaration(statement)) return false;
        const moduleSpecifier = statement.moduleSpecifier;
        if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier)) return false;
        return (
          diagnostic.start !== undefined &&
          diagnostic.start >= moduleSpecifier.getStart(source) &&
          diagnostic.start < moduleSpecifier.getEnd()
        );
      },
    );
    if (declaration === undefined) continue;
    const candidateSpecifier = declaration.moduleSpecifier;
    if (candidateSpecifier === undefined || !ts.isStringLiteral(candidateSpecifier)) continue;
    const moduleSpecifier = candidateSpecifier;
    if (isRelativeModuleSpecifier(moduleSpecifier.text)) {
      return { kind: "malformed", names };
    }
    if (ts.isImportDeclaration(declaration)) {
      if (declaration.importClause === undefined) return { kind: "unsupported", names };
      continue;
    }
    unresolvedExports.add(declaration);
  }
  const unknownSurface = collectReachableUnresolvedExports(
    entrySource,
    null,
    null,
    checker,
    unresolvedExports,
    names,
    new Set(),
  );
  let hasUnknownSurface = unknownSurface;
  const moduleSymbol = checker.getSymbolAtLocation(entrySource);
  for (const exported of moduleSymbol === undefined
    ? []
    : checker.getExportsOfModule(moduleSymbol)) {
    const target = finalAliasedSymbol(exported, checker);
    const targetSource = target.declarations?.find((declaration): declaration is ts.SourceFile =>
      ts.isSourceFile(declaration),
    );
    if (targetSource === undefined || targetSource === entrySource) continue;
    hasUnknownSurface =
      collectReachableUnresolvedExports(
        targetSource,
        null,
        normalizeExportName(exported.getName()),
        checker,
        unresolvedExports,
        names,
        new Set(),
      ) || hasUnknownSurface;
  }
  return { kind: hasUnknownSurface ? "unsupported" : "isolated", names };
}

function collectReachableUnresolvedExports(
  source: ts.SourceFile,
  requestedName: string | null,
  rootName: string | null,
  checker: ts.TypeChecker,
  unresolved: ReadonlySet<ts.ExportDeclaration>,
  names: Set<string>,
  visited: Set<string>,
): boolean {
  const visitKey = `${source.fileName}\0${requestedName ?? "*"}\0${rootName ?? "*"}`;
  if (visited.has(visitKey)) return false;
  visited.add(visitKey);

  if (requestedName !== null) {
    const moduleSymbol = checker.getSymbolAtLocation(source);
    const exported =
      moduleSymbol === undefined
        ? undefined
        : checker
            .getExportsOfModule(moduleSymbol)
            .find((symbol) => normalizeExportName(symbol.getName()) === requestedName);
    if (
      exported !== undefined &&
      (finalAliasedSymbol(exported, checker).declarations?.length ?? 0) > 0
    ) {
      return false;
    }
  }

  let unknownSurface = false;
  for (const statement of source.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.moduleSpecifier === undefined ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const clause = statement.exportClause;
    if (unresolved.has(statement)) {
      if (clause !== undefined && ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          if (requestedName === null || element.name.text === requestedName) {
            names.add(rootName ?? element.name.text);
          }
        }
      } else if (clause !== undefined && ts.isNamespaceExport(clause)) {
        if (requestedName === null || clause.name.text === requestedName) {
          names.add(rootName ?? clause.name.text);
        }
      } else if (rootName === null) {
        unknownSurface = true;
      } else {
        names.add(rootName);
      }
      continue;
    }

    const child = resolvedModuleSource(statement.moduleSpecifier, checker);
    if (child === undefined) continue;
    if (requestedName === null) {
      if (clause === undefined) {
        unknownSurface =
          collectReachableUnresolvedExports(
            child,
            null,
            rootName,
            checker,
            unresolved,
            names,
            visited,
          ) || unknownSurface;
      } else if (ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          unknownSurface =
            collectReachableUnresolvedExports(
              child,
              element.propertyName?.text ?? element.name.text,
              rootName ?? element.name.text,
              checker,
              unresolved,
              names,
              visited,
            ) || unknownSurface;
        }
      } else if (ts.isNamespaceExport(clause)) {
        collectReachableUnresolvedExports(
          child,
          null,
          rootName ?? clause.name.text,
          checker,
          unresolved,
          names,
          visited,
        );
      }
      continue;
    }

    if (clause === undefined) {
      unknownSurface =
        collectReachableUnresolvedExports(
          child,
          requestedName,
          rootName,
          checker,
          unresolved,
          names,
          visited,
        ) || unknownSurface;
    } else if (ts.isNamedExports(clause)) {
      const element = clause.elements.find(({ name }) => name.text === requestedName);
      if (element !== undefined) {
        unknownSurface =
          collectReachableUnresolvedExports(
            child,
            element.propertyName?.text ?? element.name.text,
            rootName,
            checker,
            unresolved,
            names,
            visited,
          ) || unknownSurface;
      }
    } else if (ts.isNamespaceExport(clause) && clause.name.text === requestedName) {
      collectReachableUnresolvedExports(child, null, rootName, checker, unresolved, names, visited);
    }
  }
  return unknownSurface;
}

function resolvedModuleSource(
  moduleSpecifier: ts.StringLiteral,
  checker: ts.TypeChecker,
): ts.SourceFile | undefined {
  return checker
    .getSymbolAtLocation(moduleSpecifier)
    ?.declarations?.find((declaration): declaration is ts.SourceFile =>
      ts.isSourceFile(declaration),
    );
}

function resolveAliasChain(
  initial: ts.Symbol,
  output: AliasHopV1[],
  context: ModelContext,
  subjectId: string,
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
      throw new RootOmissionError(graphDepthOmission(subjectId));
    }
    const next =
      context.checker.getImmediateAliasedSymbol(current) ??
      context.checker.getAliasedSymbol(current);
    const declaration = current.declarations?.[0];
    if (declaration === undefined || isExternalDeclaration(declaration, context)) {
      throw new RootOmissionError(externalOmission(subjectId));
    }
    const location = sourceLocation(declaration, context);
    if (location === null) {
      throw new RootOmissionError(externalOmission(subjectId));
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

function starReexportChain(
  source: ts.SourceFile,
  exportName: string,
  target: ts.Symbol,
  context: ModelContext,
  subjectId: string,
  visited = new Set<string>(),
  depth = 0,
): readonly AliasHopV1[] {
  const visitKey = `${source.fileName}\0${exportName}`;
  if (visited.has(visitKey)) return [];
  visited.add(visitKey);
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (statement.moduleSpecifier === undefined || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const moduleSymbol = context.checker.getSymbolAtLocation(statement.moduleSpecifier);
    if (moduleSymbol === undefined) continue;
    let nextName = exportName;
    let candidate: ts.Symbol | undefined;
    if (statement.exportClause === undefined) {
      candidate = context.checker
        .getExportsOfModule(moduleSymbol)
        .find((symbol) => normalizeExportName(symbol.getName()) === exportName);
    } else if (ts.isNamedExports(statement.exportClause)) {
      const element = statement.exportClause.elements.find(
        ({ name }) => normalizeExportName(name.text) === exportName,
      );
      if (element !== undefined) {
        nextName = element.propertyName?.text ?? element.name.text;
        candidate = context.checker.getSymbolAtLocation(element.name);
      }
    }
    if (candidate === undefined || finalAliasedSymbol(candidate, context.checker) !== target) {
      continue;
    }
    const location = sourceLocation(statement, context);
    if (location === null) continue;
    const hop: AliasHopV1 = {
      targetName: boundedIdentifier(nextName),
      sourceModule: boundedSourceModule(statement.moduleSpecifier.text),
      location,
    };
    const nextDepth = depth + 1;
    enforceGraphLimit(nextDepth, context, subjectId);
    const child = moduleSymbol.declarations?.find(ts.isSourceFile);
    const nested =
      child === undefined || symbolDeclaredInSource(target, child)
        ? []
        : starReexportChain(child, nextName, target, context, subjectId, visited, nextDepth);
    return [hop, ...nested];
  }
  return [];
}

function symbolDeclaredInSource(symbol: ts.Symbol, source: ts.SourceFile): boolean {
  return (symbol.declarations ?? []).some((declaration) => declaration.getSourceFile() === source);
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

function checkHeritageDepth(
  root: ts.Symbol,
  startingDepth: number,
  context: ModelContext,
  subjectId: string,
): void {
  const deepestVisited = new Map<ts.Symbol, number>();
  const active = new Set<ts.Symbol>();
  const visit = (symbol: ts.Symbol, depth: number): void => {
    checkCancellation(context.signal);
    if (active.has(symbol) || (deepestVisited.get(symbol) ?? -1) >= depth) return;
    deepestVisited.set(symbol, depth);
    active.add(symbol);
    for (const declaration of symbol.declarations ?? []) {
      if (!hasHeritage(declaration)) continue;
      for (const clause of declaration.heritageClauses ?? []) {
        for (const typeNode of clause.types) {
          const nextDepth = depth + 1;
          const base = context.checker.getTypeAtLocation(typeNode).getSymbol();
          if (base === undefined) continue;
          if (active.has(base) || (deepestVisited.get(base) ?? -1) >= nextDepth) continue;
          if (nextDepth > context.normalized.limits.maxGraphDepth) {
            throw new RootOmissionError(graphDepthOmission(subjectId));
          }
          if ((base.declarations ?? []).some((item) => isExternalDeclaration(item, context))) {
            throw new RootOmissionError(externalOmission(subjectId));
          }
          visit(base, nextDepth);
        }
      }
    }
    active.delete(symbol);
  };
  visit(root, startingDepth);
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
    if (
      normalized.compilerLibRoot !== null &&
      isContained(normalized.compilerLibRoot, absolute) &&
      isPinnedLibFileName(absolute)
    ) {
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
  const project = normalized.projectOptions;
  return {
    module: project.moduleResolution === "node16" ? ts.ModuleKind.Node16 : ts.ModuleKind.NodeNext,
    moduleResolution:
      project.moduleResolution === "node16"
        ? ts.ModuleResolutionKind.Node16
        : ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    noEmit: true,
    noLib: normalized.defaultLibFileName === null,
    skipLibCheck: false,
    types: [],
    allowJs: false,
    resolvePackageJsonExports: project.resolvePackageJsonExports ?? true,
    customConditions: [...normalized.conditions.customConditions],
    ...(project.baseUrl === undefined ? {} : { baseUrl: project.baseUrl }),
    ...(project.paths === undefined
      ? {}
      : {
          paths: Object.fromEntries(
            Object.entries(project.paths).map(([pattern, targets]) => [pattern, [...targets]]),
          ),
        }),
    ...(project.moduleSuffixes === undefined
      ? {}
      : { moduleSuffixes: [...project.moduleSuffixes] }),
    ...(project.preserveSymlinks === undefined
      ? {}
      : { preserveSymlinks: project.preserveSymlinks }),
  };
}

function normalizeInput(input: ModelPublicApiInput): NormalizedInput | undefined {
  const currentDirectory = normalizeAbsolutePath(input.host.currentDirectory);
  const packageRoot = normalizeAbsolutePath(input.packageRoot);
  const limits = effectiveLimits(input.limits);
  const projectOptions = normalizeProjectOptions(input.projectOptions, currentDirectory);
  const conditions = normalizeConditions(input.conditions);
  if (
    currentDirectory === undefined ||
    packageRoot === undefined ||
    limits === undefined ||
    projectOptions === undefined ||
    conditions === undefined ||
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
        !isContained(compilerLibRoot, defaultLibFileName) ||
        isContained(packageRoot, compilerLibRoot) ||
        isContained(compilerLibRoot, packageRoot) ||
        !isPinnedLibFileName(defaultLibFileName)))
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
    projectOptions,
    conditions,
    currentDirectory,
    compilerLibRoot,
    defaultLibFileName,
    limits,
  };
}

function normalizeProjectOptions(
  value: TypeScriptProjectResolutionOptions | undefined,
  currentDirectory: string | undefined,
): TypeScriptProjectResolutionOptions | undefined {
  if (
    currentDirectory === undefined ||
    value === undefined ||
    typeof value !== "object" ||
    value === null ||
    (value.moduleResolution !== "node16" && value.moduleResolution !== "nodenext") ||
    Object.keys(value).some(
      (key) =>
        ![
          "moduleResolution",
          "baseUrl",
          "paths",
          "moduleSuffixes",
          "resolvePackageJsonExports",
          "preserveSymlinks",
        ].includes(key),
    ) ||
    (value.resolvePackageJsonExports !== undefined &&
      typeof value.resolvePackageJsonExports !== "boolean") ||
    (value.preserveSymlinks !== undefined && typeof value.preserveSymlinks !== "boolean")
  ) {
    return undefined;
  }
  const baseUrl = value.baseUrl === undefined ? undefined : normalizeAbsolutePath(value.baseUrl);
  if (
    (value.baseUrl !== undefined && baseUrl === undefined) ||
    (baseUrl !== undefined && !isContained(currentDirectory, baseUrl))
  ) {
    return undefined;
  }
  const moduleSuffixes = normalizeBoundedStringList(value.moduleSuffixes, true);
  if (value.moduleSuffixes !== undefined && moduleSuffixes === undefined) return undefined;
  let paths: Readonly<Record<string, readonly string[]>> | undefined;
  if (value.paths !== undefined) {
    if (typeof value.paths !== "object" || value.paths === null || Array.isArray(value.paths)) {
      return undefined;
    }
    const entries = Object.entries(value.paths);
    if (entries.length > 64) return undefined;
    const normalizedEntries: [string, readonly string[]][] = [];
    for (const [pattern, targets] of entries) {
      const normalizedTargets = normalizeBoundedStringList(targets, true);
      if (
        pattern.length === 0 ||
        pattern.length > 256 ||
        pattern.includes("\0") ||
        !isWellFormedUnicode(pattern) ||
        normalizedTargets === undefined
      ) {
        return undefined;
      }
      normalizedEntries.push([pattern, normalizedTargets]);
    }
    paths = Object.freeze(Object.fromEntries(normalizedEntries));
  }
  return Object.freeze({
    moduleResolution: value.moduleResolution,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(paths === undefined ? {} : { paths }),
    ...(moduleSuffixes === undefined ? {} : { moduleSuffixes }),
    resolvePackageJsonExports: value.resolvePackageJsonExports ?? true,
    ...(value.preserveSymlinks === undefined ? {} : { preserveSymlinks: value.preserveSymlinks }),
  });
}

function normalizeConditions(
  value: NormalizedTypeScriptConditions | undefined,
): NormalizedTypeScriptConditions | undefined {
  if (
    value === undefined ||
    typeof value !== "object" ||
    value === null ||
    !Array.isArray(value.conditions) ||
    !Array.isArray(value.customConditions) ||
    Object.keys(value).some(
      (key) => !["lookupKind", "conditions", "customConditions"].includes(key),
    ) ||
    [...value.conditions, ...value.customConditions].some(
      (condition) =>
        typeof condition !== "string" ||
        condition.length === 0 ||
        condition.length > 256 ||
        condition.includes("\0") ||
        !isWellFormedUnicode(condition),
    )
  ) {
    return undefined;
  }
  const normalized = normalizeTypeScriptConditions(value.conditions, value.customConditions);
  if (
    !normalized.ok ||
    normalized.value.lookupKind !== value.lookupKind ||
    !sameStrings(normalized.value.conditions, value.conditions) ||
    !sameStrings(normalized.value.customConditions, value.customConditions)
  ) {
    return undefined;
  }
  return normalized.value;
}

function normalizeBoundedStringList(
  values: unknown,
  allowEmpty: boolean,
): readonly string[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values)) return undefined;
  if (values.length > 64) return undefined;
  const output: string[] = [];
  for (const value of values) {
    if (
      typeof value !== "string" ||
      (!allowEmpty && value.length === 0) ||
      value.length > 256 ||
      value.includes("\0") ||
      !isWellFormedUnicode(value)
    ) {
      return undefined;
    }
    output.push(value);
  }
  return Object.freeze(output);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isPinnedLibFileName(value: string): boolean {
  return /^lib(?:\.[a-z0-9]+)*\.d\.ts$/i.test(posix.basename(value));
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
    Buffer.byteLength(value) <= maxRelativePathBytes &&
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

function isExternalDeclaration(declaration: ts.Declaration, context: ModelContext): boolean {
  const fileName = normalizeAbsolutePath(declaration.getSourceFile().fileName);
  if (fileName === undefined) return true;
  return !isAuthoritativePath(fileName, context);
}

function isAuthoritativePath(path: string, context: ModelContext): boolean {
  if (isOwnedPackagePath(path, context)) return true;
  return (
    context.normalized.compilerLibRoot !== null &&
    isContained(context.normalized.compilerLibRoot, path) &&
    isPinnedLibFileName(path)
  );
}

function isOwnedPackagePath(path: string, context: ModelContext): boolean {
  const cached = context.ownedPackagePaths.get(path);
  if (cached !== undefined) return cached;
  const { packageRoot } = context.normalized;
  if (!isContained(packageRoot, path)) {
    context.ownedPackagePaths.set(path, false);
    return false;
  }
  const relative = posix.relative(packageRoot, path);
  if (relative.split("/").includes("node_modules")) {
    context.ownedPackagePaths.set(path, false);
    return false;
  }
  let directory = posix.dirname(path);
  while (directory !== packageRoot && isContained(packageRoot, directory)) {
    if (context.host.fileExists(posix.join(directory, "package.json"))) {
      context.ownedPackagePaths.set(path, false);
      return false;
    }
    const parent = posix.dirname(directory);
    if (parent === directory) {
      context.ownedPackagePaths.set(path, false);
      return false;
    }
    directory = parent;
  }
  const owned = directory === packageRoot;
  context.ownedPackagePaths.set(path, owned);
  return owned;
}

function sourceLocation(node: ts.Node, context: ModelContext): SourceLocationV1 | null {
  const fileName = normalizeAbsolutePath(node.getSourceFile().fileName);
  if (fileName === undefined || !isOwnedPackagePath(fileName, context)) return null;
  const relative = posix.relative(context.normalized.packageRoot, fileName);
  if (!isPortableRelativePath(relative)) return null;
  const point = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart());
  return {
    authority: "package",
    path: relative,
    line: point.line + 1,
    column: point.character + 1,
  };
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
  if (!isWellFormedUnicode(name)) return undefined;
  const id = `${entrypoint}#${encodeURIComponent(name)}`;
  return id.length <= 4_096 ? id : undefined;
}

function nestedPublicSymbolId(parentId: string, name: string): string | undefined {
  if (!isWellFormedUnicode(name)) return undefined;
  const id = `${parentId}/${encodeURIComponent(name)}`;
  return id.length <= 4_096 ? id : undefined;
}

function normalizeExportName(value: string): string {
  return value === "export=" ? "export=" : value;
}

function boundedIdentifier(value: string): string {
  if (unicodeLength(value) === 0 || unicodeLength(value) > 256 || !isWellFormedUnicode(value)) {
    throw new UnsafeModelError();
  }
  return value;
}

function boundedSourceModule(value: string): string {
  if (unicodeLength(value) === 0 || unicodeLength(value) > 512 || !isWellFormedUnicode(value)) {
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
  if (normalized.length === 0) return null;
  if (Buffer.byteLength(normalized) > 1_024 || !isWellFormedUnicode(normalized)) {
    throw new UnsafeModelError();
  }
  return normalized;
}

function unicodeLength(value: string): number {
  return Array.from(value).length;
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

function enforceGraphLimit(count: number, context: ModelContext, subjectId: string): void {
  if (count > context.normalized.limits.maxGraphDepth) {
    throw new RootOmissionError(graphDepthOmission(subjectId));
  }
}

function consumePublicSymbol(context: ModelContext): boolean {
  context.publicSymbolUsage.traversed += 1;
  return context.publicSymbolUsage.traversed <= context.normalized.limits.maxPublicSymbols;
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
    compareCodePointStrings(left.authority, right.authority) ||
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
  if (left.omission.kind === "graph") return left;
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

function graphDepthOmission(subjectId: string | null, omittedCount = 1): RootOmission {
  return {
    omission: { kind: "graph", limit: "maxGraphDepth", omittedCount, subjectId },
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
  return `${location.authority}:${location.path}:${location.line}:${location.column}`;
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
