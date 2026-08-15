import { createHash, type Hash } from "node:crypto";

import type { TypeScriptBrokerRequestV1, TypeScriptBrokerResponseV1 } from "./protocol.js";

export function createProjectContextHash(): Hash {
  const hash = createHash("sha256");
  frame(hash, "package-spelunker-typescript-project-context-v1");
  return hash;
}

export function observeProjectContext(
  hash: Hash,
  request: TypeScriptBrokerRequestV1,
  response: TypeScriptBrokerResponseV1,
): void {
  frame(hash, request.operation);
  frame(hash, request.path);
  frame(hash, JSON.stringify(response.ok ? response.value : { code: response.code }));
}

export function finishProjectContextHash(hash: Hash): string {
  return `sha256:${hash.digest("hex")}`;
}

function frame(hash: Hash, value: string): void {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.byteLength);
  hash.update(length);
  hash.update(bytes);
}
