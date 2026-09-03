import { readdir, readFile } from "node:fs/promises";
import { posix } from "node:path";
import ts60 from "typescript";
import ts58 from "typescript-5-8";
import ts59 from "typescript-5-9";
import { describe, expect, it } from "vitest";

import {
  modelPublicApi,
  type PublicApiModelFileHost,
  type PublicApiModelLimits,
  type PublicSymbolV1,
} from "../src/index.js";

const fixtureRoot = new URL("../../../fixtures/public-api/semantic/", import.meta.url);

describe("modelPublicApi", () => {
  it.each([
    ["5.8", ts58],
    ["5.9", ts59],
    ["6.0", ts60],
  ] as const)("models declaration output emitted by TypeScript %s", async (_line, compiler) => {
    const emitted = compiler.transpileDeclaration(
      [
        "/** Version-lane fixture. */",
        "export class Versioned<const T extends string = string> {",
        "  constructor(readonly value: T);",
        "  map<const U extends string>(value: U): Versioned<U>;",
        "}",
      ].join("\n"),
      {
        compilerOptions: {
          declaration: true,
          module: compiler.ModuleKind.NodeNext,
          target: compiler.ScriptTarget.ES2022,
        },
        fileName: "index.ts",
        reportDiagnostics: true,
      },
    );
    expect(emitted.diagnostics).toEqual([]);

    const result = await modelFixture(
      new Map([["index.d.ts", emitted.outputText]]),
      "/virtual/package",
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "complete",
        data: {
          symbols: [
            expect.objectContaining({
              name: "Versioned",
              typeParameters: [{ name: "T", constraint: "string", default: "string" }],
              members: expect.arrayContaining([
                expect.objectContaining({ name: "map", declarationKinds: ["method"] }),
              ]),
            }),
          ],
        },
      },
    });
  });

  it("models deterministic exports, aliases, merges, signatures, members, and documentation", async () => {
    const files = await semanticFixture();
    const result = await modelFixture(files, "/virtual/node_modules/public-api-fixture");

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "complete",
        compilerVersion: "6.0.3",
        snapshotId: "sha256:public-api-fixture",
        projectContextHash: "sha256:project-context",
        data: { entrypoint: ".", omission: null },
      },
    });
    if (!result.ok) throw new Error("Expected complete public API model.");
    expect(result.value.status).toBe("complete");

    const symbols = result.value.data.symbols;
    expect(symbols.map(({ name }) => name)).toEqual([
      "Base",
      "Contract",
      "Merged",
      "Service",
      "StarOptions",
      "alias",
      "cycleA",
      "cycleB",
      "default",
      "parse",
    ]);
    expect(symbols.map(({ id }) => id)).toEqual(
      symbols.map(({ name }) => `.#${encodeURIComponent(name)}`),
    );

    const alias = requiredSymbol(symbols, "alias");
    expect(alias.aliasChain).toMatchObject([
      { targetName: "renamed", sourceModule: "./aliases.js" },
      { targetName: "target", sourceModule: "./target.js" },
    ]);
    expect(alias.documentation).toBe("Resolves the aliased value.");

    const merged = requiredSymbol(symbols, "Merged");
    expect(merged.meanings).toEqual(["type", "value", "namespace"]);
    expect(merged.declarationKinds).toEqual(["interface", "namespace"]);
    expect(merged.members).toEqual([expect.objectContaining({ name: "value", scope: "instance" })]);
    expect(merged.namespaceExports).toEqual([
      expect.objectContaining({ id: ".#Merged/kind", name: "kind" }),
    ]);

    const service = requiredSymbol(symbols, "Service");
    expect(service.meanings).toEqual(["type", "value"]);
    expect(service.typeParameters).toEqual([
      { name: "T", constraint: "string", default: "string" },
    ]);
    expect(service.heritage.map(({ kind, display }) => ({ kind, display }))).toEqual([
      { kind: "extends", display: "Base" },
      { kind: "implements", display: "Contract" },
    ]);
    expect(service.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "create", scope: "static", visibility: "public" }),
        expect.objectContaining({ name: "baseState", visibility: "protected" }),
        expect.objectContaining({ name: "secret", visibility: "private" }),
        expect.objectContaining({ name: "name", readonly: true }),
        expect.objectContaining({ name: "optional", optional: true }),
        expect.objectContaining({ name: "constructor", declarationKinds: ["constructor"] }),
      ]),
    );
    expect(service.documentation).toBe("Service documentation.");

    const parse = requiredSymbol(symbols, "parse");
    expect(parse.signatures).toHaveLength(2);
    expect(parse.signatures.map(({ ordinal }) => ordinal)).toEqual([0, 1]);
    expect(parse.documentation).toContain("Parses text or numbers.");
    expect(parse.deprecation).toEqual({ message: "Use decode instead." });

    expect(JSON.stringify(result)).not.toContain("/virtual/");
    expect(
      symbols.flatMap(({ locations }) => locations).every(({ path }) => !path.startsWith("/")),
    ).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value.data.symbols)).toBe(true);
  });

  it("produces identical normalized output for npm, pnpm, and linked physical layouts", async () => {
    const files = await semanticFixture();
    const roots = [
      "/virtual/npm/node_modules/public-api-fixture",
      "/virtual/pnpm/node_modules/.pnpm/public-api-fixture@1.0.0/node_modules/public-api-fixture",
      "/virtual/linked/packages/public-api-fixture",
    ];
    const results = await Promise.all(roots.map((root) => modelFixture(files, root)));

    expect(results.every((result) => result.ok)).toBe(true);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it("enforces exact declaration and public-symbol boundaries", async () => {
    const files = await semanticFixture();
    const baseline = await modelFixture(files, "/virtual/package");
    if (!baseline.ok) throw new Error("Expected baseline model.");
    const declarationFiles = baseline.value.usage.declarationFiles;
    const publicSymbols = baseline.value.usage.publicSymbols;

    expect(
      await modelFixture(files, "/virtual/package", { maxDeclarationFiles: declarationFiles }),
    ).toEqual(baseline);
    expect(
      await modelFixture(files, "/virtual/package", { maxDeclarationFiles: declarationFiles - 1 }),
    ).toEqual({
      ok: false,
      failure: {
        code: "resource_limit_exceeded",
        message: "Public API modeling exceeded its declaration-file budget.",
        limit: "maxDeclarationFiles",
      },
    });

    expect(
      await modelFixture(files, "/virtual/package", { maxPublicSymbols: publicSymbols }),
    ).toEqual(baseline);
    expect(
      await modelFixture(files, "/virtual/package", { maxPublicSymbols: publicSymbols - 1 }),
    ).toMatchObject({
      ok: true,
      value: {
        status: "partial",
        data: {
          omission: {
            kind: "symbols",
            limit: "maxPublicSymbols",
            omittedCount: expect.any(Number),
            subjectId: expect.any(String),
          },
        },
        failure: { code: "resource_limit_exceeded", limit: "maxPublicSymbols" },
      },
    });
  });

  it("omits an independently bounded overloaded export above its signature limit", async () => {
    const files = new Map([
      [
        "index.d.ts",
        [
          "export declare function overloaded(value: string): string;",
          "export declare function overloaded(value: number): number;",
          "export declare const safe: true;",
        ].join("\n"),
      ],
    ]);

    expect(
      await modelFixture(files, "/virtual/package", { maxSignaturesPerSymbol: 2 }),
    ).toMatchObject({
      ok: true,
      value: { status: "complete" },
    });
    expect(
      await modelFixture(files, "/virtual/package", { maxSignaturesPerSymbol: 1 }),
    ).toMatchObject({
      ok: true,
      value: {
        status: "partial",
        data: {
          symbols: [expect.objectContaining({ name: "safe" })],
          omission: {
            kind: "signatures",
            limit: "maxSignaturesPerSymbol",
            omittedCount: 1,
            subjectId: ".#overloaded",
          },
        },
      },
    });
  });

  it("bounds alias graph depth and terminates star-export cycles", async () => {
    const files = await semanticFixture();
    expect(await modelFixture(files, "/virtual/package", { maxGraphDepth: 2 })).toMatchObject({
      ok: true,
      value: { status: "complete" },
    });

    const partial = await modelFixture(files, "/virtual/package", { maxGraphDepth: 1 });
    expect(partial).toMatchObject({
      ok: true,
      value: {
        status: "partial",
        data: {
          omission: {
            kind: "graph",
            limit: "maxGraphDepth",
            omittedCount: 3,
            subjectId: ".#Service",
          },
        },
      },
    });
    if (partial.ok) {
      expect(partial.value.data.symbols.map(({ name }) => name)).toContain("cycleA");
      expect(partial.value.data.symbols.map(({ name }) => name)).not.toContain("cycleB");
    }
  });

  it("models export-equals declarations as an explicit stable root", async () => {
    const result = await modelFixture(
      new Map([
        [
          "index.d.ts",
          [
            "/** Callable CommonJS API. */",
            "declare function api(value: string): string;",
            "export = api;",
          ].join("\n"),
        ],
      ]),
      "/virtual/package",
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "complete",
        data: {
          symbols: [
            expect.objectContaining({
              id: ".#export%3D",
              name: "export=",
              declarationKinds: ["function"],
              documentation: "Callable CommonJS API.",
              aliasChain: [expect.objectContaining({ targetName: "api", sourceModule: null })],
            }),
          ],
        },
      },
    });
  });

  it("records every multi-barrel re-export edge and applies exact depth bounds", async () => {
    const files = new Map([
      ["index.d.ts", 'export * from "./a.js";'],
      ["a.d.ts", 'export * from "./b.js";'],
      ["b.d.ts", 'export * from "./deep.js";'],
      ["deep.d.ts", "export interface Deep { value: string; }"],
    ]);
    const complete = await modelFixture(files, "/virtual/package", { maxGraphDepth: 3 });
    expect(complete).toMatchObject({
      ok: true,
      value: {
        status: "complete",
        data: {
          symbols: [
            expect.objectContaining({
              name: "Deep",
              aliasChain: [
                expect.objectContaining({ sourceModule: "./a.js" }),
                expect.objectContaining({ sourceModule: "./b.js" }),
                expect.objectContaining({ sourceModule: "./deep.js" }),
              ],
            }),
          ],
        },
      },
    });
    expect(await modelFixture(files, "/virtual/package", { maxGraphDepth: 2 })).toMatchObject({
      ok: true,
      value: {
        status: "partial",
        data: { omission: { kind: "graph", subjectId: ".#Deep" } },
      },
    });
  });

  it("models recursive namespace exports with parent-derived IDs and budget accounting", async () => {
    const files = new Map([
      [
        "index.d.ts",
        [
          "export declare namespace N {",
          "  export class C { value: string; }",
          "  export namespace Inner { export type T = string; }",
          "}",
        ].join("\n"),
      ],
    ]);
    const complete = await modelFixture(files, "/virtual/package", { maxGraphDepth: 2 });
    expect(complete).toMatchObject({ ok: true, value: { status: "complete" } });
    if (!complete.ok) throw new Error("Expected nested namespace model.");
    const namespace = requiredSymbol(complete.value.data.symbols, "N");
    expect(namespace.members).toEqual([]);
    expect(namespace.namespaceExports).toMatchObject([
      { id: ".#N/C", name: "C" },
      {
        id: ".#N/Inner",
        name: "Inner",
        namespaceExports: [{ id: ".#N/Inner/T", name: "T" }],
      },
    ]);
    expect(complete.value.usage.publicSymbols).toBe(6);
    expect(
      await modelFixture(files, "/virtual/package", {
        maxGraphDepth: 2,
        maxPublicSymbols: 4,
      }),
    ).toMatchObject({
      ok: true,
      value: { status: "partial", data: { omission: { kind: "symbols" } } },
    });
    expect(await modelFixture(files, "/virtual/package", { maxGraphDepth: 1 })).toMatchObject({
      ok: true,
      value: { status: "partial", data: { omission: { kind: "graph" } } },
    });
  });

  it("rejects reachable declarations owned by a nested package", async () => {
    const files = new Map([
      [
        "index.d.ts",
        [
          'import type { External } from "external-package";',
          "export declare function leaked(value: External): External;",
          "export declare const safe: true;",
        ].join("\n"),
      ],
      [
        "node_modules/external-package/package.json",
        '{"name":"external-package","version":"1.0.0","types":"index.d.ts"}',
      ],
      ["node_modules/external-package/index.d.ts", "export interface External { id: string; }"],
    ]);

    expect(await modelFixture(files, "/virtual/package")).toMatchObject({
      ok: true,
      value: {
        status: "partial",
        data: {
          symbols: [expect.objectContaining({ name: "safe" })],
          omission: { kind: "external-declaration", subjectId: ".#leaked" },
        },
      },
    });

    const nestedManifest = new Map([
      [
        "index.d.ts",
        [
          'import type { External } from "./vendor/external/index.js";',
          "export interface Leaked { value: External; }",
        ].join("\n"),
      ],
      ["vendor/external/package.json", '{"name":"external","version":"1.0.0"}'],
      ["vendor/external/index.d.ts", "export interface External { id: string; }"],
    ]);
    expect(await modelFixture(nestedManifest, "/virtual/package")).toMatchObject({
      ok: true,
      value: {
        status: "partial",
        data: { omission: { kind: "external-declaration", subjectId: ".#Leaked" } },
      },
    });
  });

  it("enforces type-parameter and heritage record ceilings at and over the limit", async () => {
    const typeParameters = new Map([
      ["index.d.ts", "export interface Pair<A, B> { left: A; right: B; }"],
    ]);
    expect(
      await modelFixture(typeParameters, "/virtual/package", { maxSignaturesPerSymbol: 2 }),
    ).toMatchObject({ ok: true, value: { status: "complete" } });
    expect(
      await modelFixture(typeParameters, "/virtual/package", { maxSignaturesPerSymbol: 1 }),
    ).toMatchObject({
      ok: true,
      value: { status: "partial", data: { omission: { kind: "signatures" } } },
    });

    const heritage = new Map([
      [
        "index.d.ts",
        [
          "export interface A {}",
          "export interface B {}",
          "export interface Combined extends A, B {}",
        ].join("\n"),
      ],
    ]);
    expect(await modelFixture(heritage, "/virtual/package", { maxGraphDepth: 2 })).toMatchObject({
      ok: true,
      value: { status: "complete" },
    });
    expect(await modelFixture(heritage, "/virtual/package", { maxGraphDepth: 1 })).toMatchObject({
      ok: true,
      value: {
        status: "partial",
        data: { omission: { kind: "graph", subjectId: ".#Combined" } },
      },
    });
  });

  it("preserves alias-local docs, readonly indexes, construct signatures, and modifiers", async () => {
    const files = new Map([
      [
        "index.d.ts",
        [
          "/** Target docs. */",
          "declare function target(value: string): string;",
          "/** Alias docs. */",
          "export { target as alias };",
          "export interface Factory {",
          "  readonly [key: string]: unknown;",
          "  new (value: string): Factory;",
          "  (this: Factory, value?: number, ...rest: [string, string]): string;",
          "}",
          "/** @deprecated */",
          "export declare const oldValue: string;",
        ].join("\n"),
      ],
    ]);
    const result = await modelFixture(files, "/virtual/package");
    expect(result).toMatchObject({ ok: true, value: { status: "complete" } });
    if (!result.ok) throw new Error("Expected normalization coverage model.");
    expect(requiredSymbol(result.value.data.symbols, "alias").documentation).toBe("Alias docs.");
    const factory = requiredSymbol(result.value.data.symbols, "Factory");
    expect(factory.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ declarationKinds: ["index"], readonly: true }),
        expect.objectContaining({ declarationKinds: ["construct"] }),
      ]),
    );
    expect(factory.signatures.map(({ kind }) => kind)).toEqual(["call"]);
    expect(factory.signatures[0]?.display).toContain("value?: number");
    expect(factory.signatures[0]?.display).toContain("this: Factory");
    expect(factory.signatures[0]?.display).toContain("...rest: [string, string]");
    expect(requiredSymbol(result.value.data.symbols, "oldValue").deprecation).toEqual({
      message: null,
    });
  });

  it.each(["index.d.mts", "index.d.cts"])("models %s declaration entrypoints", async (target) => {
    expect(
      await modelFixture(
        new Map([[target, "export declare const format: string;"]]),
        "/virtual/package",
        undefined,
        { declarationTarget: target },
      ),
    ).toMatchObject({ ok: true, value: { status: "complete" } });
  });

  it("models representative enum, type-alias, variable, and default declaration kinds", async () => {
    const result = await modelFixture(
      new Map([
        [
          "index.d.ts",
          [
            "export enum Kind { A = 'a' }",
            "export type Pair<T = string> = readonly [T, T];",
            "export declare const value: unique symbol;",
            "export default class DefaultClass {}",
          ].join("\n"),
        ],
      ]),
      "/virtual/package",
    );
    expect(result).toMatchObject({ ok: true, value: { status: "complete" } });
    if (!result.ok) throw new Error("Expected declaration-kind coverage model.");
    expect(requiredSymbol(result.value.data.symbols, "Kind").declarationKinds).toEqual(["enum"]);
    expect(requiredSymbol(result.value.data.symbols, "Pair").declarationKinds).toEqual([
      "type-alias",
    ]);
    expect(requiredSymbol(result.value.data.symbols, "value").declarationKinds).toEqual([
      "variable",
    ]);
    expect(requiredSymbol(result.value.data.symbols, "default").declarationKinds).toEqual([
      "class",
    ]);
  });

  it("admits only pinned compiler-lib declarations and never reads executable package files", async () => {
    const reads: string[] = [];
    const files = new Map([
      ["index.d.ts", "export interface UsesArray extends Array<string> { values: Array<string>; }"],
      ["index.js", 'throw new Error("must not load");'],
      [
        "/virtual/compiler/lib/lib.d.ts",
        "interface Array<T> { readonly length: number; [index: number]: T; }",
      ],
    ]);
    const packageRoot = "/virtual/package";
    const result = await modelFixture(files, packageRoot, undefined, {
      compilerLibRoot: "/virtual/compiler/lib",
      defaultLibFileName: "/virtual/compiler/lib/lib.d.ts",
      host: virtualHost(files, packageRoot, (name) => reads.push(name)),
    });
    expect(result).toMatchObject({ ok: true, value: { status: "complete" } });
    if (!result.ok) throw new Error("Expected pinned-lib model.");
    expect(
      result.value.data.symbols
        .flatMap(({ members }) => members)
        .every(({ locations }) => locations.length > 0),
    ).toBe(true);
    expect(reads).not.toContain("/virtual/package/index.js");

    const taintedLibFiles = new Map([
      ["index.d.ts", "export interface Leaked { value: Evil; }"],
      [
        "/virtual/compiler/lib/lib.d.ts",
        '/// <reference path="./evil.d.ts" />\ninterface Array<T> { length: number; }',
      ],
      ["/virtual/compiler/lib/evil.d.ts", "interface Evil { secret: string; }"],
    ]);
    expect(
      await modelFixture(taintedLibFiles, packageRoot, undefined, {
        compilerLibRoot: "/virtual/compiler/lib",
        defaultLibFileName: "/virtual/compiler/lib/lib.d.ts",
        host: virtualHost(taintedLibFiles, packageRoot),
      }),
    ).toMatchObject({ ok: false, failure: { code: "malformed_artifact" } });
  });

  it("isolates named external re-exports and rejects unsafe unresolved context", async () => {
    expect(
      await modelFixture(
        new Map([["index.d.ts", "export declare const safe: true;"]]),
        "/virtual/package",
        undefined,
        { declarationTarget: "../escape.d.ts" },
      ),
    ).toEqual({
      ok: false,
      failure: {
        code: "invalid_request",
        message: "Public API modeling input is not valid bounded package context.",
      },
    });
    expect(
      await modelFixture(
        new Map([["index.d.ts", "export declare const safe: true;"]]),
        "/virtual/package",
        { maxGraphDepth: 0 },
      ),
    ).toMatchObject({ ok: false, failure: { code: "invalid_request" } });
    expect(
      await modelFixture(
        new Map([
          ["index.d.ts", "export declare const safe: true;"],
          ["compiler/lib.d.ts", "interface Array<T> { length: number; }"],
        ]),
        "/virtual/package",
        undefined,
        {
          compilerLibRoot: "/virtual/package/compiler",
          defaultLibFileName: "/virtual/package/compiler/lib.d.ts",
        },
      ),
    ).toMatchObject({ ok: false, failure: { code: "invalid_request" } });
    expect(
      await modelFixture(new Map([["index.d.ts", "export declare const ;"]]), "/virtual/package"),
    ).toMatchObject({ ok: false, failure: { code: "malformed_artifact" } });
    expect(
      await modelFixture(
        new Map([
          [
            "index.d.ts",
            [
              'export { external } from "external-package";',
              "export declare const safe: true;",
            ].join("\n"),
          ],
        ]),
        "/virtual/package",
      ),
    ).toMatchObject({
      ok: true,
      value: {
        status: "partial",
        data: {
          symbols: [expect.objectContaining({ name: "safe" })],
          omission: {
            kind: "external-declaration",
            limit: null,
            omittedCount: 1,
            subjectId: ".#external",
          },
        },
        failure: {
          code: "unsupported_context",
          message: "Public API reaches a declaration outside the admitted package snapshot.",
        },
      },
    });
    expect(
      await modelFixture(
        new Map([
          [
            "index.d.ts",
            [
              'import type { External } from "external-package";',
              "export declare function leaked(value: External): External;",
            ].join("\n"),
          ],
        ]),
        "/virtual/package",
      ),
    ).toEqual({
      ok: false,
      failure: {
        code: "unsupported_context",
        message: "Public API reaches a declaration outside the admitted package snapshot.",
      },
    });
    expect(
      await modelFixture(
        new Map([["index.d.ts", 'export { missing } from "./missing.js";']]),
        "/virtual/package",
      ),
    ).toMatchObject({ ok: false, failure: { code: "malformed_artifact" } });
    expect(
      await modelFixture(
        new Map([
          ["index.d.ts", 'export { sourceOnly } from "./source-only.js";'],
          ["source-only.ts", "export const sourceOnly = true;"],
        ]),
        "/virtual/package",
      ),
    ).toMatchObject({ ok: false, failure: { code: "malformed_artifact" } });

    const controller = new AbortController();
    controller.abort();
    expect(
      await modelFixture(
        new Map([["index.d.ts", "export declare const safe: true;"]]),
        "/virtual/package",
        undefined,
        { signal: controller.signal },
      ),
    ).toEqual({
      ok: false,
      failure: { code: "cancelled", message: "Public API modeling was cancelled." },
    });
  });
});

async function semanticFixture(): Promise<Map<string, string>> {
  const paths = (await readdir(fixtureRoot, { recursive: true })).filter(
    (path) => path.endsWith(".d.ts") || path.endsWith("package.json"),
  );
  return new Map(
    await Promise.all(
      paths.map(
        async (path) => [path, await readFile(new URL(path, fixtureRoot), "utf8")] as const,
      ),
    ),
  );
}

function modelFixture(
  files: ReadonlyMap<string, string>,
  packageRoot: string,
  limits?: Partial<PublicApiModelLimits>,
  overrides: Partial<Parameters<typeof modelPublicApi>[0]> = {},
) {
  return modelPublicApi({
    snapshotId: "sha256:public-api-fixture",
    entrypoint: ".",
    declarationTarget: "index.d.ts",
    packageRoot,
    compilerVersion: "6.0.3",
    projectContextHash: "sha256:project-context",
    host: virtualHost(files, packageRoot),
    ...(limits === undefined ? {} : { limits }),
    ...overrides,
  });
}

function virtualHost(
  relativeFiles: ReadonlyMap<string, string>,
  packageRoot: string,
  onRead?: (path: string) => void,
): PublicApiModelFileHost {
  const files = new Map(
    [...relativeFiles].map(([path, contents]) => [
      posix.isAbsolute(path) ? posix.normalize(path) : posix.join(packageRoot, path),
      contents,
    ]),
  );
  const directories = new Set<string>(["/", "/virtual", packageRoot]);
  for (const path of files.keys()) {
    let directory = posix.dirname(path);
    while (!directories.has(directory)) {
      directories.add(directory);
      const parent = posix.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  return {
    currentDirectory: "/virtual",
    fileExists: (path) => files.has(posix.normalize(path)),
    readFile(path) {
      const normalized = posix.normalize(path);
      onRead?.(normalized);
      return files.get(normalized);
    },
    directoryExists: (path) => directories.has(posix.normalize(path)),
    getDirectories(path) {
      const normalized = posix.normalize(path);
      return [...directories]
        .filter((candidate) => candidate !== normalized && posix.dirname(candidate) === normalized)
        .map((candidate) => posix.basename(candidate))
        .sort();
    },
    realpath: (path) => posix.normalize(path),
  };
}

function requiredSymbol(symbols: readonly PublicSymbolV1[], name: string): PublicSymbolV1 {
  const symbol = symbols.find((candidate) => candidate.name === name);
  if (symbol === undefined) throw new Error(`Missing symbol: ${name}`);
  return symbol;
}
