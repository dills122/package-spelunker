import { describe, expect, it } from "vitest";

import { FrameDecoder } from "../src/frame.js";

describe("FrameDecoder", () => {
  it("rejects aggregate bytes beyond one bounded broker frame", () => {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(16, 0);
    const validPayload = Buffer.from("null            ", "utf8");
    const oversized = Buffer.concat([header, validPayload, Buffer.from("x")]);

    expect(() => new FrameDecoder(16).push(oversized)).toThrow(
      "Worker protocol frame is too large.",
    );
  });
});
