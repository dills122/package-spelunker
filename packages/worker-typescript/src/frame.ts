import { readSync, writeSync } from "node:fs";

export const maxTypeScriptBrokerFrameBytes = 8_454_144;

export function encodeFrame(value: unknown, maxBytes = maxTypeScriptBrokerFrameBytes): Buffer {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  if (payload.byteLength > maxBytes) throw new Error("Worker protocol frame is too large.");
  const frame = Buffer.allocUnsafe(payload.byteLength + 4);
  frame.writeUInt32BE(payload.byteLength, 0);
  payload.copy(frame, 4);
  return frame;
}

export function writeFrameSync(
  descriptor: number,
  value: unknown,
  maxBytes = maxTypeScriptBrokerFrameBytes,
): void {
  const frame = encodeFrame(value, maxBytes);
  let offset = 0;
  while (offset < frame.byteLength) {
    const written = writeSync(descriptor, frame, offset, frame.byteLength - offset);
    if (written < 1) throw new Error("Worker protocol pipe closed during write.");
    offset += written;
  }
}

export function readFrameSync(
  descriptor: number,
  maxBytes = maxTypeScriptBrokerFrameBytes,
): unknown {
  const header = readExact(descriptor, 4);
  const byteLength = header.readUInt32BE(0);
  if (byteLength > maxBytes) throw new Error("Worker protocol frame is too large.");
  return JSON.parse(readExact(descriptor, byteLength).toString("utf8")) as unknown;
}

export class FrameDecoder {
  readonly #maxBytes: number;
  #buffer = Buffer.alloc(0);

  constructor(maxBytes = maxTypeScriptBrokerFrameBytes) {
    this.#maxBytes = maxBytes;
  }

  push(chunk: Buffer): unknown[] {
    if (this.#buffer.byteLength + chunk.byteLength > this.#maxBytes + 4) {
      throw new Error("Worker protocol frame is too large.");
    }
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const values: unknown[] = [];
    while (this.#buffer.byteLength >= 4) {
      const byteLength = this.#buffer.readUInt32BE(0);
      if (byteLength > this.#maxBytes) throw new Error("Worker protocol frame is too large.");
      if (this.#buffer.byteLength < byteLength + 4) break;
      const payload = this.#buffer.subarray(4, byteLength + 4);
      this.#buffer = this.#buffer.subarray(byteLength + 4);
      values.push(JSON.parse(payload.toString("utf8")) as unknown);
    }
    return values;
  }
}

function readExact(descriptor: number, byteLength: number): Buffer {
  const buffer = Buffer.allocUnsafe(byteLength);
  let offset = 0;
  while (offset < byteLength) {
    const read = readSync(descriptor, buffer, offset, byteLength - offset, null);
    if (read < 1) throw new Error("Worker protocol pipe closed during read.");
    offset += read;
  }
  return buffer;
}
