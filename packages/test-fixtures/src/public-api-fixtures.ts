import { mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type PublicApiFixtureLayout = "npm" | "pnpm" | "workspace-linked";
export type PublicApiLimitDimension = "graph" | "declarations" | "symbols" | "signatures";
export type PublicApiLimitBoundary = "below" | "at" | "above";

export interface MaterializedPublicApiSemanticFixture {
  readonly layout: PublicApiFixtureLayout;
  readonly root: string;
  readonly packageRoot: string;
  readonly selectedPackage: string;
  readonly declarationTarget: string;
}

export interface MaterializedPublicApiLimitFixture {
  readonly dimension: PublicApiLimitDimension;
  readonly boundary: PublicApiLimitBoundary;
  readonly root: string;
  readonly packageRoot: string;
  readonly declarationTarget: string;
  readonly size: number;
  readonly limitName:
    | "maxGraphDepth"
    | "maxDeclarationFiles"
    | "maxPublicSymbols"
    | "maxSignaturesPerSymbol";
  readonly expectedOutcome: "complete" | "resource_limit_exceeded";
}

const semanticDeclarations = {
  "dist/aliases.d.ts": 'export { original as aliased } from "./reexports.js";\n',
  "dist/cycle-a.d.ts":
    'export interface CycleA { readonly a: true; }\nexport * from "./cycle-b.js";\n',
  "dist/cycle-b.d.ts":
    'export interface CycleB { readonly b: true; }\nexport * from "./cycle-a.js";\n',
  "dist/index.d.ts": `/** Returns the supplied value. */
export default function identity<T extends Base>(value: T): T;
export { aliased as renamed } from "./aliases.js";
export * from "./reexports.js";
export * from "./cycle-a.js";

export interface Merged { readonly value: string; }
export namespace Merged { const kind: "merged"; }

export interface Contract { run(value: string): string; }
export declare class Base {
  private brand: void;
  protected inherited: string;
  method(): void;
}
export declare class Derived<T extends string = string> extends Base implements Contract {
  static create<T extends string>(value: T): Derived<T>;
  readonly value: T;
  optional?: number;
  run(value: string): string;
}

/** @deprecated Use currentValue instead. */
export declare const legacyValue: string;
export declare const currentValue: string;
`,
  "dist/reexports.d.ts": `export interface FeatureOptions<T = string> { readonly value: T; }
export declare const original: unique symbol;
export declare function parse(value: string): string;
export declare function parse(value: Uint8Array): Uint8Array;
`,
} as const;

const semanticManifest = `${JSON.stringify(
  {
    name: "semantic-fixture",
    version: "1.0.0",
    type: "module",
    types: "./dist/index.d.ts",
    exports: { ".": { types: "./dist/index.d.ts" } },
  },
  null,
  2,
)}\n`;

export async function materializePublicApiSemanticFixture(
  layout: PublicApiFixtureLayout,
  destination: string,
): Promise<MaterializedPublicApiSemanticFixture> {
  await assertEmptyDestination(destination);

  const nodeModulesRoot = join(destination, "node_modules");
  const packageRoot =
    layout === "npm"
      ? join(nodeModulesRoot, "semantic-fixture")
      : layout === "pnpm"
        ? join(
            nodeModulesRoot,
            ".pnpm",
            "semantic-fixture@1.0.0",
            "node_modules",
            "semantic-fixture",
          )
        : join(destination, "packages", "semantic-fixture");
  const selectedPackage = join(nodeModulesRoot, "semantic-fixture");

  await writePackage(packageRoot, semanticManifest, semanticDeclarations);
  if (layout === "pnpm") {
    await mkdir(nodeModulesRoot, { recursive: true });
    await symlink(
      join(".pnpm", "semantic-fixture@1.0.0", "node_modules", "semantic-fixture"),
      selectedPackage,
      "dir",
    );
  } else if (layout === "workspace-linked") {
    await mkdir(nodeModulesRoot, { recursive: true });
    await symlink(join("..", "packages", "semantic-fixture"), selectedPackage, "dir");
  }

  return {
    layout,
    root: destination,
    packageRoot,
    selectedPackage,
    declarationTarget: join(packageRoot, "dist", "index.d.ts"),
  };
}

export async function materializePublicApiLimitFixture(options: {
  readonly dimension: PublicApiLimitDimension;
  readonly boundary: PublicApiLimitBoundary;
  readonly limit: number;
  readonly destination: string;
}): Promise<MaterializedPublicApiLimitFixture> {
  const { dimension, boundary, limit, destination } = options;
  if (!Number.isInteger(limit) || limit < 2) {
    throw new Error(`Public API fixture limit must be an integer of at least 2: ${limit}`);
  }
  await assertEmptyDestination(destination);

  const size = limit + { below: -1, at: 0, above: 1 }[boundary];
  const packageRoot = join(destination, "package");
  const { declarations, declarationTarget, limitName } = limitDeclarations(
    dimension,
    size,
    packageRoot,
  );
  const manifest = `${JSON.stringify({
    name: `limit-${dimension}-fixture`,
    version: "1.0.0",
    types: `./${declarationTarget.slice(packageRoot.length + 1)}`,
  })}\n`;
  await writePackage(packageRoot, manifest, declarations);

  return {
    dimension,
    boundary,
    root: destination,
    packageRoot,
    declarationTarget,
    size,
    limitName,
    expectedOutcome: boundary === "above" ? "resource_limit_exceeded" : "complete",
  };
}

function limitDeclarations(
  dimension: PublicApiLimitDimension,
  size: number,
  packageRoot: string,
): {
  readonly declarations: Readonly<Record<string, string>>;
  readonly declarationTarget: string;
  readonly limitName: MaterializedPublicApiLimitFixture["limitName"];
} {
  switch (dimension) {
    case "graph":
      return {
        declarations: graphDeclarations(size),
        declarationTarget: join(packageRoot, "dist", "level-0.d.ts"),
        limitName: "maxGraphDepth",
      };
    case "declarations":
      return {
        declarations: declarationCountFiles(size),
        declarationTarget: join(packageRoot, "dist", "file-0.d.ts"),
        limitName: "maxDeclarationFiles",
      };
    case "symbols":
      return {
        declarations: { "dist/index.d.ts": symbolDeclarations(size) },
        declarationTarget: join(packageRoot, "dist", "index.d.ts"),
        limitName: "maxPublicSymbols",
      };
    case "signatures":
      return {
        declarations: { "dist/index.d.ts": signatureDeclarations(size) },
        declarationTarget: join(packageRoot, "dist", "index.d.ts"),
        limitName: "maxSignaturesPerSymbol",
      };
  }
}

function graphDeclarations(depth: number): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Array.from({ length: depth + 1 }, (_, index) => [
      `dist/level-${index}.d.ts`,
      index === depth
        ? "export declare const graphLeaf: true;\n"
        : `export * from "./level-${index + 1}.js";\n`,
    ]),
  );
}

function declarationCountFiles(count: number): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `dist/file-${index}.d.ts`,
      index === count - 1
        ? "export declare const declarationLeaf: true;\n"
        : `export * from "./file-${index + 1}.js";\n`,
    ]),
  );
}

function symbolDeclarations(count: number): string {
  return `${Array.from(
    { length: count },
    (_, index) => `export declare const symbol${index.toString().padStart(6, "0")}: ${index};`,
  ).join("\n")}\n`;
}

function signatureDeclarations(count: number): string {
  return `${Array.from(
    { length: count },
    (_, index) => `export declare function parse(value: "${index}"): "${index}";`,
  ).join("\n")}\n`;
}

async function writePackage(
  packageRoot: string,
  manifest: string,
  declarations: Readonly<Record<string, string>>,
): Promise<void> {
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), manifest);
  for (const [path, content] of Object.entries(declarations)) {
    const target = join(packageRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

async function assertEmptyDestination(destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  if ((await readdir(destination)).length > 0) {
    throw new Error(`Fixture destination must be empty: ${destination}`);
  }
}
