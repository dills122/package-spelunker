import { posix } from "node:path";

import { describe, expect, it } from "vitest";

import { parseTypeScriptProjectConfig, type TypeScriptResolutionFileHost } from "../src/index.js";

describe("parseTypeScriptProjectConfig", () => {
  it("parses Node16 resolution options and project custom conditions", () => {
    const result = parseTypeScriptProjectConfig({
      tsconfigPath: "/workspace/packages/app/tsconfig.json",
      host: virtualHost({
        "/workspace/packages/app/tsconfig.json": `{
          // JSONC is valid TypeScript project configuration.
          "compilerOptions": {
            "module": "node16",
            "moduleResolution": "node16",
            "customConditions": ["development"],
            "baseUrl": ".",
            "paths": { "fixture-pkg": ["src/shim.ts"] },
            "moduleSuffixes": [".native", ""]
          }
        }`,
      }),
    });

    expect(result).toEqual({
      ok: true,
      value: {
        tsconfigPath: "packages/app/tsconfig.json",
        projectOptions: {
          moduleResolution: "node16",
          baseUrl: "/workspace/packages/app",
          paths: { "fixture-pkg": ["src/shim.ts"] },
          moduleSuffixes: [".native", ""],
          resolvePackageJsonExports: true,
        },
        customConditions: ["development"],
      },
    });
  });

  it("applies a contained relative extends chain", () => {
    const result = parseTypeScriptProjectConfig({
      tsconfigPath: "/workspace/packages/app/tsconfig.json",
      host: virtualHost({
        "/workspace/tsconfig.base.json": JSON.stringify({
          compilerOptions: {
            module: "nodenext",
            moduleResolution: "nodenext",
            customConditions: ["base-condition"],
          },
        }),
        "/workspace/packages/app/tsconfig.json": JSON.stringify({
          extends: "../../tsconfig.base.json",
          compilerOptions: { customConditions: ["app-condition"] },
        }),
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        projectOptions: { moduleResolution: "nodenext" },
        customConditions: ["app-condition"],
      },
    });
  });

  it("uses the fixed inferred NodeNext configuration when no config applies", () => {
    expect(parseTypeScriptProjectConfig({ tsconfigPath: null, host: virtualHost({}) })).toEqual({
      ok: true,
      value: {
        tsconfigPath: null,
        projectOptions: {
          moduleResolution: "nodenext",
          resolvePackageJsonExports: true,
        },
        customConditions: [],
      },
    });
  });

  it("returns fixed failures for bundler mode and malformed config", () => {
    expect(
      parseTypeScriptProjectConfig({
        tsconfigPath: "/workspace/tsconfig.json",
        host: virtualHost({
          "/workspace/tsconfig.json": JSON.stringify({
            compilerOptions: { module: "preserve", moduleResolution: "bundler" },
          }),
        }),
      }),
    ).toEqual({
      ok: false,
      failure: {
        code: "unsupported_context",
        message: "TypeScript project module resolution is outside first-slice support.",
      },
    });
    expect(
      parseTypeScriptProjectConfig({
        tsconfigPath: "/workspace/tsconfig.json",
        host: virtualHost({ "/workspace/tsconfig.json": "{" }),
      }),
    ).toEqual({
      ok: false,
      failure: {
        code: "malformed_artifact",
        message: "TypeScript project configuration is not valid bounded metadata.",
      },
    });
  });
});

function virtualHost(files: Readonly<Record<string, string>>): TypeScriptResolutionFileHost {
  const normalizedFiles = new Map(
    Object.entries(files).map(([path, contents]) => [posix.normalize(path), contents]),
  );
  const directories = new Set<string>(["/workspace"]);
  for (const path of normalizedFiles.keys()) {
    let directory = posix.dirname(path);
    while (directory.startsWith("/workspace") && !directories.has(directory)) {
      directories.add(directory);
      directory = posix.dirname(directory);
    }
  }
  return {
    currentDirectory: "/workspace",
    fileExists: (path) => normalizedFiles.has(posix.normalize(path)),
    readFile: (path) => normalizedFiles.get(posix.normalize(path)),
    directoryExists: (path) => directories.has(posix.normalize(path)),
    getDirectories: () => [],
    realpath: (path) => posix.normalize(path),
  };
}
