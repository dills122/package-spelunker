import { describe, expect, it } from "vitest";

import { parsePackageSpecifier } from "../src/index.js";

describe("parsePackageSpecifier", () => {
  it.each([
    ["fixture-pkg", "fixture-pkg", undefined],
    ["fixture-pkg/feature", "fixture-pkg", "feature"],
    ["@fixture/linked-pkg", "@fixture/linked-pkg", undefined],
    ["@fixture/linked-pkg/sub/path", "@fixture/linked-pkg", "sub/path"],
  ])("parses %s without applying runtime resolution semantics", (value, name, subpath) => {
    expect(parsePackageSpecifier(value)).toEqual({
      ok: true,
      value: {
        requested: value,
        packageName: name,
        ...(subpath === undefined ? {} : { packageSubpath: subpath }),
      },
    });
  });

  it.each([
    "",
    ".",
    "..",
    "./fixture-pkg",
    "../fixture-pkg",
    "/fixture-pkg",
    "fixture-pkg/../escape",
    "fixture-pkg/%2e%2e/escape",
    "fixture-pkg/%2Fescape",
    "fixture-pkg\\escape",
    "fixture-pkg\0escape",
    "file:fixture-pkg",
    "node:fs",
    "https://example.invalid/package.tgz",
    "@fixture",
    "@fixture/",
    "@fixture/linked-pkg//feature",
    "fixture pkg",
  ])("CTX-002 rejects unsafe specifier %j before filesystem mapping", (value) => {
    expect(parsePackageSpecifier(value)).toEqual({
      ok: false,
      failure: {
        code: "invalid_request",
        message:
          "Package specifier must be a bare or scoped package name with an optional safe subpath.",
      },
    });
  });

  it("applies the request contract's 512-byte ceiling", () => {
    expect(parsePackageSpecifier(`package-${"a".repeat(504)}`)).toMatchObject({
      ok: true,
    });
    expect(parsePackageSpecifier(`package-${"a".repeat(505)}`)).toMatchObject({
      ok: false,
      failure: { code: "invalid_request" },
    });
  });

  it("returns immutable normalized package components", () => {
    const result = parsePackageSpecifier("@fixture/linked-pkg/subpath");

    expect(result.ok && Object.isFrozen(result.value)).toBe(true);
  });
});
