import { posix } from "node:path";

import Type, { type Static } from "typebox";
import Schema from "typebox/schema";

const closed = { additionalProperties: false } as const;
const identifier = Type.String({ minLength: 1, maxLength: 256 });
const virtualPath = Type.String({ minLength: 1, maxLength: 4096 });
const relativePath = Type.String({ minLength: 1, maxLength: 4096 });
const condition = Type.String({ minLength: 1, maxLength: 256 });

const projectOptions = Type.Object(
  {
    moduleResolution: Type.Union([Type.Literal("node16"), Type.Literal("nodenext")]),
    baseUrl: Type.Optional(virtualPath),
    paths: Type.Optional(
      Type.Record(
        Type.String({ minLength: 1, maxLength: 256 }),
        Type.Array(relativePath, { maxItems: 64 }),
      ),
    ),
    moduleSuffixes: Type.Optional(Type.Array(Type.String({ maxLength: 256 }), { maxItems: 64 })),
    resolvePackageJsonExports: Type.Optional(Type.Boolean()),
    preserveSymlinks: Type.Optional(Type.Boolean()),
  },
  closed,
);

const normalizedConditions = Type.Object(
  {
    lookupKind: Type.Union([Type.Literal("import"), Type.Literal("require")]),
    conditions: Type.Array(condition, { maxItems: 64, uniqueItems: true }),
    customConditions: Type.Array(condition, { maxItems: 64, uniqueItems: true }),
  },
  closed,
);

export const typeScriptWorkerRequestV1Schema = Type.Object(
  {
    protocolVersion: Type.Literal("1"),
    operation: Type.Literal("resolve-declaration"),
    operationId: identifier,
    snapshotId: identifier,
    specifier: Type.String({ minLength: 1, maxLength: 512 }),
    importer: virtualPath,
    packageRoot: virtualPath,
    tsconfigPath: Type.Union([relativePath, Type.Null()]),
    projectOptions,
    conditions: normalizedConditions,
    limits: Type.Object(
      {
        maxResolverTraceSteps: Type.Integer({ minimum: 1, maximum: 10000 }),
      },
      closed,
    ),
  },
  closed,
);

const brokerOperation = Type.Union([
  Type.Literal("file-exists"),
  Type.Literal("read-file"),
  Type.Literal("directory-exists"),
  Type.Literal("get-directories"),
  Type.Literal("realpath"),
]);

export const typeScriptBrokerRequestV1Schema = Type.Object(
  {
    protocolVersion: Type.Literal("1"),
    operationId: identifier,
    requestId: Type.Integer({ minimum: 0, maximum: 2_147_483_647 }),
    operation: brokerOperation,
    path: virtualPath,
  },
  closed,
);

const brokerValue = Type.Union([
  Type.Object({ kind: Type.Literal("exists"), exists: Type.Boolean() }, closed),
  Type.Object(
    {
      kind: Type.Literal("file"),
      contents: Type.Union([Type.String({ maxLength: 8_388_608 }), Type.Null()]),
    },
    closed,
  ),
  Type.Object(
    {
      kind: Type.Literal("directories"),
      directories: Type.Array(Type.String({ minLength: 1, maxLength: 1024 }), { maxItems: 10000 }),
    },
    closed,
  ),
  Type.Object({ kind: Type.Literal("realpath"), path: virtualPath }, closed),
]);

export const typeScriptBrokerResponseV1Schema = Type.Union([
  Type.Object(
    {
      protocolVersion: Type.Literal("1"),
      operationId: identifier,
      requestId: Type.Integer({ minimum: 0, maximum: 2_147_483_647 }),
      ok: Type.Literal(true),
      value: brokerValue,
    },
    closed,
  ),
  Type.Object(
    {
      protocolVersion: Type.Literal("1"),
      operationId: identifier,
      requestId: Type.Integer({ minimum: 0, maximum: 2_147_483_647 }),
      ok: Type.Literal(false),
      code: Type.Literal("broker_failure"),
    },
    closed,
  ),
]);

export type TypeScriptWorkerRequestV1 = Static<typeof typeScriptWorkerRequestV1Schema>;
export type TypeScriptBrokerRequestV1 = Static<typeof typeScriptBrokerRequestV1Schema>;
export type TypeScriptBrokerResponseV1 = Static<typeof typeScriptBrokerResponseV1Schema>;

const workerRequestValidator = Schema.Compile(typeScriptWorkerRequestV1Schema);
const brokerRequestValidator = Schema.Compile(typeScriptBrokerRequestV1Schema);
const brokerResponseValidator = Schema.Compile(typeScriptBrokerResponseV1Schema);

export function isTypeScriptWorkerRequestV1(value: unknown): value is TypeScriptWorkerRequestV1 {
  if (!workerRequestValidator.Check(value)) return false;
  if (!validWorkspaceVirtualPath(value.importer) || !validWorkspaceVirtualPath(value.packageRoot)) {
    return false;
  }
  if (
    value.projectOptions.baseUrl !== undefined &&
    !validWorkspaceVirtualPath(value.projectOptions.baseUrl)
  ) {
    return false;
  }
  if (value.tsconfigPath !== null && !validRelativePath(value.tsconfigPath)) return false;
  return (
    value.conditions.conditions.includes("types") &&
    value.conditions.conditions.includes("node") &&
    value.conditions.conditions.includes("default") &&
    value.conditions.conditions.includes(value.conditions.lookupKind) &&
    !value.conditions.customConditions.some((entry) =>
      ["types", "node", "import", "require", "default"].includes(entry),
    )
  );
}

export function isTypeScriptBrokerRequestV1(value: unknown): value is TypeScriptBrokerRequestV1 {
  return brokerRequestValidator.Check(value) && validWorkspaceVirtualPath(value.path);
}

export function isTypeScriptBrokerResponseV1(value: unknown): value is TypeScriptBrokerResponseV1 {
  if (!brokerResponseValidator.Check(value)) return false;
  if (!value.ok) return true;
  if (value.value.kind === "realpath") return validWorkspaceVirtualPath(value.value.path);
  if (value.value.kind === "file" && typeof value.value.contents === "string") {
    return Buffer.byteLength(value.value.contents, "utf8") <= 8_388_608;
  }
  return true;
}

function validVirtualPath(path: string): boolean {
  return (
    posix.isAbsolute(path) &&
    Buffer.byteLength(path, "utf8") <= 4096 &&
    !path.includes("\0") &&
    !path.includes("\\") &&
    !path.split("/").includes("..") &&
    posix.normalize(path) === path
  );
}

function validWorkspaceVirtualPath(path: string): boolean {
  return validVirtualPath(path) && (path === "/workspace" || path.startsWith("/workspace/"));
}

function validRelativePath(path: string): boolean {
  return (
    !posix.isAbsolute(path) &&
    Buffer.byteLength(path, "utf8") <= 4096 &&
    !path.includes("\0") &&
    !path.includes("\\") &&
    !path.split("/").includes("..") &&
    posix.normalize(path) === path
  );
}
