import {
  normalizeTypeScriptConditions,
  parseTypeScriptProjectConfig,
  resolveTypeScriptDeclaration,
  type TypeScriptProjectConfigFailure,
  type TypeScriptResolutionFileHost,
  type TypeScriptResolutionResult,
} from "@package-spelunker/typescript-resolution";

import { readFrameSync, writeFrameSync } from "./frame.js";
import {
  isTypeScriptBrokerResponseV1,
  isTypeScriptWorkerRequestV1,
  type TypeScriptBrokerRequestV1,
  type TypeScriptBrokerResponseV1,
  type TypeScriptWorkerRequestV1,
} from "./protocol.js";

const maxInitialRequestBytes = 1_048_576;

async function main(): Promise<void> {
  let result:
    | TypeScriptResolutionResult
    | { readonly ok: false; readonly failure: TypeScriptProjectConfigFailure };
  try {
    const request = await readInitialRequest();
    const host = createBrokerHost(request);
    const config = parseTypeScriptProjectConfig({
      tsconfigPath: request.tsconfigPath === null ? null : `/workspace/${request.tsconfigPath}`,
      host,
    });
    if (!config.ok) {
      result = config;
    } else {
      const conditions = normalizeTypeScriptConditions(
        request.conditions.conditions,
        config.value.customConditions,
      );
      result = conditions.ok
        ? resolveTypeScriptDeclaration({
            snapshotId: request.snapshotId,
            specifier: request.specifier,
            importer: request.importer,
            packageRoot: request.packageRoot,
            tsconfigPath: config.value.tsconfigPath,
            projectOptions: config.value.projectOptions,
            conditions: conditions.value,
            host,
            limits: request.limits,
          })
        : {
            ok: false,
            failure: {
              code: "invalid_request",
              message: "TypeScript resolution input is not valid bounded workspace context.",
            },
          };
    }
  } catch {
    result = {
      ok: false,
      failure: {
        code: "analysis_failed",
        message: "TypeScript declaration resolution could not complete safely.",
      },
    };
  }
  process.stdout.write(JSON.stringify(result));
}

async function readInitialRequest(): Promise<TypeScriptWorkerRequestV1> {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    byteLength += bytes.byteLength;
    if (byteLength > maxInitialRequestBytes) throw new Error("Worker request is too large.");
    chunks.push(bytes);
  }
  const value = JSON.parse(Buffer.concat(chunks, byteLength).toString("utf8")) as unknown;
  if (!isTypeScriptWorkerRequestV1(value)) throw new Error("Worker request is invalid.");
  return value;
}

function createBrokerHost(request: TypeScriptWorkerRequestV1): TypeScriptResolutionFileHost {
  let requestId = 0;
  const call = (operation: TypeScriptBrokerRequestV1["operation"], path: string) => {
    requestId += 1;
    const brokerRequest: TypeScriptBrokerRequestV1 = {
      protocolVersion: "1",
      operationId: request.operationId,
      requestId,
      operation,
      path,
    };
    writeFrameSync(3, brokerRequest);
    const response = readFrameSync(4);
    if (
      !isTypeScriptBrokerResponseV1(response) ||
      response.operationId !== request.operationId ||
      response.requestId !== requestId ||
      !response.ok
    ) {
      throw new Error("Broker response is invalid.");
    }
    return response;
  };

  return {
    currentDirectory: "/workspace",
    fileExists(path) {
      return existsValue(call("file-exists", path));
    },
    readFile(path) {
      const value = call("read-file", path).value;
      if (value.kind !== "file") throw new Error("Broker file response is invalid.");
      return value.contents ?? undefined;
    },
    directoryExists(path) {
      return existsValue(call("directory-exists", path));
    },
    getDirectories(path) {
      const value = call("get-directories", path).value;
      if (value.kind !== "directories") throw new Error("Broker directory response is invalid.");
      return value.directories;
    },
    realpath(path) {
      const value = call("realpath", path).value;
      if (value.kind !== "realpath") throw new Error("Broker realpath response is invalid.");
      return value.path;
    },
  };
}

function existsValue(
  response: Extract<TypeScriptBrokerResponseV1, { readonly ok: true }>,
): boolean {
  if (response.value.kind !== "exists") throw new Error("Broker existence response is invalid.");
  return response.value.exists;
}

await main();
