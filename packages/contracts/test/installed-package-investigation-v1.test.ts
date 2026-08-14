import { readFile } from "node:fs/promises";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type InstalledPackageInvestigationV1,
  installedPackageInvestigationV1Schema,
  validateInstalledPackageInvestigationV1,
} from "../src/index.js";

const exampleDirectory = new URL("../../../docs/contracts/v1/", import.meta.url);

async function readExample(name: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(name, exampleDirectory), "utf8"));
}

describe("validateInstalledPackageInvestigationV1", () => {
  it("exports a portable Draft 2020-12 schema and derives its version type", () => {
    const serializedSchema = JSON.stringify(installedPackageInvestigationV1Schema);

    expect(JSON.parse(serializedSchema)).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "urn:package-spelunker:schema:installed-package-investigation:1",
    });
    expect(serializedSchema).not.toContain('"~kind"');
    expectTypeOf<InstalledPackageInvestigationV1["schemaVersion"]>().toEqualTypeOf<"1">();
  });

  it.each([
    "installed-success.example.json",
    "installed-partial.example.json",
    "installed-failure.example.json",
  ])("accepts the %s golden envelope", async (name) => {
    const result = validateInstalledPackageInvestigationV1(await readExample(name));

    expect(result).toEqual({ valid: true, value: expect.any(Object) });
  });

  it("rejects an unknown top-level field", async () => {
    const value = {
      ...((await readExample("installed-success.example.json")) as Record<string, unknown>),
      unexpected: true,
    };

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [{ keyword: "additionalProperties", path: "" }],
    });
  });

  it("rejects an unsupported schema version", async () => {
    const value = {
      ...((await readExample("installed-success.example.json")) as Record<string, unknown>),
      schemaVersion: "2",
    };

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [{ keyword: "const", path: "/schemaVersion" }],
    });
  });

  it("rejects a successful result without normalized context", async () => {
    const value = {
      ...((await readExample("installed-success.example.json")) as Record<string, unknown>),
      context: null,
    };

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [{ keyword: "type", path: "/context" }],
    });
  });

  it("rejects a partial result when every stage is complete", async () => {
    const success = (await readExample("installed-success.example.json")) as Record<
      string,
      unknown
    >;
    const partial = (await readExample("installed-partial.example.json")) as Record<
      string,
      unknown
    >;
    const value = {
      ...structuredClone(success),
      outcome: "partial",
      failures: structuredClone(partial.failures),
    };

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [{ keyword: "contractOutcome", path: "/stages" }],
    });
  });

  it("rejects a stage that references an unknown failure", async () => {
    const value = structuredClone(
      (await readExample("installed-partial.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    stages.typescriptResolution = {
      status: "failed",
      failureId: "missing-failure",
    };

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [
        {
          keyword: "contractReference",
          path: "/stages/typescriptResolution/failureId",
        },
      ],
    });
  });

  it("rejects a stage that references unknown evidence", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const stages = value.stages as Record<string, Record<string, unknown>>;
    const runtimeResolution = stages.runtimeResolution;
    if (runtimeResolution === undefined)
      throw new Error("Missing runtimeResolution fixture stage.");
    runtimeResolution.evidenceRefs = ["missing-evidence"];

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [
        {
          keyword: "contractReference",
          path: "/stages/runtimeResolution/evidenceRefs/0",
        },
      ],
    });
  });

  it("rejects duplicate evidence IDs", async () => {
    const value = structuredClone(
      (await readExample("installed-success.example.json")) as Record<string, unknown>,
    );
    const evidence = value.evidence as Array<Record<string, unknown>>;
    const firstEvidence = evidence[0];
    const secondEvidence = evidence[1];
    if (firstEvidence === undefined || secondEvidence === undefined) {
      throw new Error("Expected at least two evidence fixtures.");
    }
    secondEvidence.id = firstEvidence.id;

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: [{ keyword: "contractReference", path: "/evidence/1/id" }],
    });
  });

  it("rejects a raw stack in a normalized failure", async () => {
    const value = structuredClone(
      (await readExample("installed-failure.example.json")) as Record<string, unknown>,
    );
    const failures = value.failures as Array<Record<string, unknown>>;
    failures[0] = { ...failures[0], stack: "sensitive stack" };

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          keyword: "additionalProperties",
          path: "/failures/0",
        }),
      ]),
    });
  });

  it("accepts the normalized unsupported-context failure vocabulary", async () => {
    const value = structuredClone(
      (await readExample("installed-failure.example.json")) as Record<string, unknown>,
    );
    const failures = value.failures as Array<Record<string, unknown>>;
    const failure = failures[0];
    if (failure === undefined) throw new Error("Expected a failure fixture.");
    failure.code = "unsupported_context";
    failure.message = "The selected resolver mode is outside first-slice support.";

    const result = validateInstalledPackageInvestigationV1(value);

    expect(result).toEqual({ valid: true, value });
  });
});
