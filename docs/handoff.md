# Handoff: Executable Contracts Complete

- Updated: 2026-08-14
- Handoff status: Current
- Product status: Milestone 0 closure and Milestone 1 implementation
- Active branch: `codex/foundation-contract-decisions`

## Objective And Boundary

Continue Package Spelunker with Task M1.2, the deterministic fixture harness. Task M1.1 now provides
the executable request/result and resource-policy boundary that fixture expectations must use.

This branch does not yet implement fixture workspaces, filesystem access, snapshot construction,
resolution, compiler analysis, CLI behavior, MCP behavior, registry access, or providers.

## Canonical Sources

- [`product-brief.md`](product-brief.md): product scope and first-release outcome.
- [`architecture.md`](architecture.md): package ownership, dependency direction, and lifecycle.
- [`security-model.md`](security-model.md): trust model, invariants, and resource enforcement.
- [`roadmap.md`](roadmap.md): milestone outcomes and exit gates.
- [`implementation-plan.md`](implementation-plan.md): active task status and ordered work.
- ADR [0003](decisions/0003-versioned-contract-envelopes.md): closed version 1 workflow
  envelopes and compatibility policy.
- ADR [0004](decisions/0004-first-slice-resource-policy.md): `first-slice-v1` budgets and compiler
  process isolation.
- ADR [0005](decisions/0005-typebox-contract-authoring.md): executable schema/type/validator
  tooling.
- [`contracts/v1/`](contracts/v1/): reviewable result examples validated by executable tests.
- [`../fixtures/matrix.md`](../fixtures/matrix.md): 28 stable positive/adversarial acceptance cases.

## Current Repository State

- Remote/default branch: `origin`, `main`.
- Branch: `codex/foundation-contract-decisions`, based on initial checkpoint `a6ff0f5`.
- Decision/status commits already on the branch:
  - `b677efb` — `docs: define versioned contract envelopes`
  - `2347f61` — `docs: set first-slice resource policy`
  - `323caee` — `docs: refresh foundation delivery state`
  - `ed893ae` — `feat: add versioned contracts package`
- Root metadata remains private, version `0.0.0`, and `UNLICENSED`.
- The internal package name `@package-spelunker/contracts` is provisional until D1 resolves the
  public package scope and release intent.

## Completed Work

### Repository and foundation decisions

- Verified the configured remote, `main` default branch, and clean-clone install/check workflow.
- Accepted JSON Schema Draft 2020-12, closed per-workflow major-version contracts, normalized
  outcomes/failures/evidence, and strict post-publication compatibility in ADR 0003.
- Accepted named defaults/ceilings and a terminable TypeScript compiler child process in ADR 0004.
- Added success, partial-limit, and failure result examples plus the paired fixture matrix.

### Task M1.1: executable contracts

- Added `packages/contracts` as the first implemented domain package.
- Added a closed installed-package request schema that accepts package names/subpaths and only the
  caller-lowerable resource budgets. URL, file, absolute-package, and relative-package specifiers
  are rejected.
- Added closed success/partial/failure result variants with fixed stages, normalized failures,
  bounded evidence/warnings/usage, and applied limit metadata.
- Derived TypeScript value types from the schema declarations and compiled runtime validators from
  the same declarations.
- Added project-owned normalized validation errors and semantic checks for duplicate/dangling IDs,
  evidence references, normalized context, and genuine partial outcomes.
- Exact-pinned `typebox@1.3.14`; ADR 0005 records the decision and insulation rules. Production
  dependency audit reports no known vulnerabilities.
- Added focused golden/adversarial contract tests and made the root TypeScript build reference the
  package.
- Excluded generated `dist`/`build`/`coverage` trees from Biome while keeping source checks strict.

## Decisions And Rationale

- TypeBox is one executable schema/type/validator declaration seam. TypeBox errors, validators, and
  internal metadata are not public contract types.
- Serialized version 1 results are installed/workspace-only; registry snapshot vocabulary remains a
  later workflow/version decision.
- Structural JSON Schema validation runs before semantic reference/outcome validation.
- The request rejects arbitrary artifact locations at the first boundary. Later path logic must
  still canonicalize the approved workspace root and selected paths before reads.
- D4 cache policy and D5 third-party provider isolation remain deferred until those capabilities
  enter scope.

## Remaining Decisions And Limits

- D1 remains open for package scope, license, release intent, and supported platform matrix. It does
  not block local M1.2 work, but it blocks formal foundation closure and publication.
- The resource values are conservative starting policy values, not measured ecosystem percentiles.
- Fixture files and a fixture harness do not exist yet. The matrix is an acceptance inventory, not
  test evidence.
- No snapshot, resolver, compiler, core workflow, or transport behavior exists yet.

## Immediate Next Actions

1. Implement Task M1.2 with a small `packages/test-fixtures` harness and deterministic checked-in or
   generated npm, pnpm, and workspace-link layouts.
2. Start with the positive/adversarial pairs that constrain Task M1.3: normal containment versus
   traversal, internal workspace symlink versus escaping symlink, acyclic versus cyclic paths, and
   within-budget versus oversized manifest/file cases.
3. Give every fixture a stable ID from `fixtures/matrix.md`, explicit expected outcome, provenance,
   and a no-execution assertion.
4. Keep fixtures free of mutable registry state and lifecycle dependence; use inert sentinel package
   code to prove it was not loaded.
5. Resolve D1 with the owner before declaring Milestone 0 closed or publishing any package.

## Verification Commands

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm audit --prod
node --input-type=module -e 'import fs from "node:fs"; for (const file of process.argv.slice(1)) JSON.parse(fs.readFileSync(file, "utf8"));' docs/contracts/v1/*.json
git diff --check
git status --short --branch
git log --oneline --decorate -8
```

## Delivery Metadata

- Repository: `/Users/dsteele/repos/package-spelunker`
- Branch: `codex/foundation-contract-decisions`
- Base/checkpoint: `a6ff0f59b3d92403c4ed11b695675419da55095f`
- Pull request: none created
- Date: 2026-08-14 (America/Toronto)
