export type FixtureCaseId = "CTX-001" | "FS-001" | "FS-002" | "FS-003" | "CFG-001";

export type FixtureGenerator =
  | "approved-root"
  | "workspace-symlink"
  | "file-symlink"
  | "symlink-cycle"
  | "manifest-boundary";

export interface FixtureVariant {
  readonly kind: "positive" | "adversarial";
  readonly description: string;
  readonly generator: FixtureGenerator;
  readonly expectedOutcome: string;
  readonly prohibitsExecution: true;
}

export interface FixtureCase {
  readonly id: FixtureCaseId;
  readonly area: string;
  readonly provenance: "repository-owned";
  readonly positive: FixtureVariant;
  readonly adversarial: FixtureVariant;
}

export const fixtureCatalog = [
  {
    id: "CTX-001",
    area: "approved-root",
    provenance: "repository-owned",
    positive: {
      kind: "positive",
      description: "Importer nested inside the approved workspace root.",
      generator: "approved-root",
      expectedOutcome: "contained",
      prohibitsExecution: true,
    },
    adversarial: {
      kind: "adversarial",
      description: "Importer traversal canonicalizes outside the approved workspace root.",
      generator: "approved-root",
      expectedOutcome: "outside_approved_root",
      prohibitsExecution: true,
    },
  },
  {
    id: "FS-001",
    area: "workspace-symlink",
    provenance: "repository-owned",
    positive: {
      kind: "positive",
      description: "Workspace package link resolves to an admitted package root.",
      generator: "workspace-symlink",
      expectedOutcome: "contained",
      prohibitsExecution: true,
    },
    adversarial: {
      kind: "adversarial",
      description: "Workspace package link resolves outside the approved roots.",
      generator: "workspace-symlink",
      expectedOutcome: "outside_approved_root",
      prohibitsExecution: true,
    },
  },
  {
    id: "FS-002",
    area: "file-symlink",
    provenance: "repository-owned",
    positive: {
      kind: "positive",
      description: "Declaration link resolves inside the selected package artifact.",
      generator: "file-symlink",
      expectedOutcome: "contained",
      prohibitsExecution: true,
    },
    adversarial: {
      kind: "adversarial",
      description: "Declaration link resolves outside the selected package artifact.",
      generator: "file-symlink",
      expectedOutcome: "outside_approved_root",
      prohibitsExecution: true,
    },
  },
  {
    id: "FS-003",
    area: "symlink-cycle",
    provenance: "repository-owned",
    positive: {
      kind: "positive",
      description: "Short acyclic symlink chain resolves inside the artifact.",
      generator: "symlink-cycle",
      expectedOutcome: "contained",
      prohibitsExecution: true,
    },
    adversarial: {
      kind: "adversarial",
      description: "Symlink chain contains a cycle.",
      generator: "symlink-cycle",
      expectedOutcome: "cycle",
      prohibitsExecution: true,
    },
  },
  {
    id: "CFG-001",
    area: "package-manifest",
    provenance: "repository-owned",
    positive: {
      kind: "positive",
      description: "Valid package manifest is exactly at the configured byte limit.",
      generator: "manifest-boundary",
      expectedOutcome: "valid",
      prohibitsExecution: true,
    },
    adversarial: {
      kind: "adversarial",
      description: "Package manifest exceeds the configured byte limit.",
      generator: "manifest-boundary",
      expectedOutcome: "maxManifestBytes",
      prohibitsExecution: true,
    },
  },
] as const satisfies readonly FixtureCase[];

export function getFixtureCase(id: string): FixtureCase {
  const fixture = fixtureCatalog.find((candidate) => candidate.id === id);
  if (fixture === undefined) throw new Error(`Unknown fixture ID: ${id}`);
  return fixture;
}
