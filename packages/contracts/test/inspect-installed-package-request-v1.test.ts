import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type InspectInstalledPackageRequestV1,
  inspectInstalledPackageRequestV1Schema,
  validateInspectInstalledPackageRequestV1,
} from "../src/index.js";

const validRequest = {
  schemaVersion: "1",
  kind: "inspect-installed-package",
  workspaceRoot: "/workspace",
  importer: "packages/app/src/index.ts",
  specifier: "@scope/example-package/subpath",
  runtimeConditions: ["node", "import", "default"],
  typescriptConditions: ["types", "import", "default"],
  tsconfigPath: "packages/app/tsconfig.json",
  limits: {
    maxFilesVisited: 5000,
    maxWallTimeMs: 30000,
  },
};

describe("validateInspectInstalledPackageRequestV1", () => {
  it("accepts a bounded installed-package request", () => {
    const result = validateInspectInstalledPackageRequestV1(validRequest);

    expect(result).toEqual({ valid: true, value: validRequest });
    expectTypeOf<InspectInstalledPackageRequestV1["schemaVersion"]>().toEqualTypeOf<"1">();
    expect(JSON.stringify(inspectInstalledPackageRequestV1Schema)).not.toContain('"~kind"');
  });

  it("rejects unknown request fields", () => {
    const result = validateInspectInstalledPackageRequestV1({
      ...validRequest,
      arbitraryFetchUrl: "https://example.invalid/package.tgz",
    });

    expect(result).toMatchObject({
      valid: false,
      errors: [{ keyword: "additionalProperties", path: "" }],
    });
  });

  it.each(["https://example.invalid/pkg", "../pkg", "/absolute/pkg", "file:./pkg"])(
    "rejects unsafe package specifier %s",
    (specifier) => {
      const result = validateInspectInstalledPackageRequestV1({ ...validRequest, specifier });

      expect(result).toMatchObject({
        valid: false,
        errors: [{ keyword: "pattern", path: "/specifier" }],
      });
    },
  );

  it("rejects a caller limit above the policy ceiling", () => {
    const result = validateInspectInstalledPackageRequestV1({
      ...validRequest,
      limits: { maxFilesVisited: 50001 },
    });

    expect(result).toMatchObject({
      valid: false,
      errors: [{ keyword: "maximum", path: "/limits/maxFilesVisited" }],
    });
  });
});
