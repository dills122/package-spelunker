import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const checkedInFixtureNames = ["npm-basic", "pnpm-basic", "workspace-linked"] as const;

export type CheckedInFixtureName = (typeof checkedInFixtureNames)[number];

export const checkedInFixtureMatrixIds = {
  "npm-basic": ["CTX-002", "CFG-003", "EXP-001", "DECL-002"],
  "pnpm-basic": ["CFG-002", "CFG-003"],
  "workspace-linked": ["FS-001", "CFG-002"],
} as const satisfies Record<CheckedInFixtureName, readonly string[]>;

const checkedInFixtureRoot = fileURLToPath(
  new URL("../../../fixtures/workspaces/", import.meta.url),
);

export function resolveCheckedInFixture(name: CheckedInFixtureName): string {
  if (!checkedInFixtureNames.includes(name)) {
    throw new Error(`Unknown checked-in fixture: ${name}`);
  }
  return join(checkedInFixtureRoot, name);
}
