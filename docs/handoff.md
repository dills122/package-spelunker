# Handoff: Contract and Resource Foundation Decisions

- Updated: 2026-08-14
- Handoff status: Current
- Product status: Milestone 0 foundation; ready to begin executable contracts

## Objective And Boundary

Continue Package Spelunker from accepted serialized-contract and first-slice security decisions into
Task M1.1, the executable `packages/contracts` boundary. This handoff records continuation state;
canonical product, architecture, security, and decision documents own the design.

This continuation reconciled the merged repository, accepted D2 and D3, added representative
contract envelopes and the security fixture matrix, and updated the compiler architecture to use a
terminable child process. It did not add runtime dependencies, implementation packages, executable
schemas, fixture data, tests, CLI behavior, or product analysis code.

## Canonical Sources

- [`product-brief.md`](product-brief.md): product scope and first-release outcome.
- [`architecture.md`](architecture.md): first-slice packages, dependency direction, lifecycle, and
  compiler worker boundary.
- [`security-model.md`](security-model.md): trust model, invariants, and resource enforcement.
- [`roadmap.md`](roadmap.md): milestone outcomes and exit gates.
- [`implementation-plan.md`](implementation-plan.md): active task status and ordered work.
- ADR [0003](decisions/0003-versioned-contract-envelopes.md): closed, versioned JSON Schema
  workflow contracts.
- ADR [0004](decisions/0004-first-slice-resource-policy.md): `first-slice-v1` budgets, ceilings,
  limit behavior, and compiler child-process isolation.
- [`contracts/v1/`](contracts/v1/): accepted success, partial, and failure design fixtures.
- [`../fixtures/matrix.md`](../fixtures/matrix.md): stable positive/adversarial fixture IDs.

## Current Repository State

- `main` and `origin/main` are at initial checkpoint `a6ff0f5` (`init commit`).
- `origin/HEAD` points to `origin/main`.
- Remote: `https://github.com/dills122/package-spelunker.git`.
- Active branch: `codex/foundation-contract-decisions`, based on `a6ff0f5`.
- The branch contains two retained decision commits:
  - `b677efb` — `docs: define versioned contract envelopes`
  - `2347f61` — `docs: set first-slice resource policy`
- Root tooling remains Node 22.22.1, pnpm 10.23.0, strict TypeScript, Biome, Vitest, and GitHub
  Actions.
- No application/domain package, executable schema, fixture data, or test file exists yet.
- Root metadata remains private, version `0.0.0`, and `UNLICENSED`.

## Completed Work And Evidence

### Repository reconciliation

- Classified the previous handoff as partially stale: its product state remained accurate, while
  its unborn-branch/no-remote claims were superseded by the initial merge.
- Verified a clean worktree on `main` before creating the current feature branch.
- Confirmed the configured remote and default branch.
- Cloned `main` into a fresh temporary directory, ran `pnpm install --frozen-lockfile`, and ran
  `pnpm check` successfully. Vitest still reports no tests by design.

### D2: serialized contract policy

- Accepted JSON Schema Draft 2020-12 as the language-neutral serialized contract source.
- Defined one closed schema per workflow with an independent major, stable `kind`, and explicit
  `success`, `partial`, and `failure` outcomes.
- Defined fixed stage results, normalized coded failures, bounded evidence references, applied
  limits, and safe metadata.
- Added three deterministic JSON examples; all parse successfully.
- Defined strict compatibility: after publication, even optional fields and enum variants require a
  new workflow schema major because public objects are closed.

### D3: resource and isolation policy

- Accepted `first-slice-v1` defaults and non-disableable ceilings for bytes, paths, symlinks,
  filesystem/graph traversal, compiler work, evidence/output, time, memory, cancellation, and
  concurrency.
- Defined failure versus partial-result behavior and a compact emergency envelope for oversized
  output.
- Required TypeScript resolution/public API analysis to run in a terminable child process with a
  bounded custom compiler host.
- Added 28 stable fixture cases pairing legitimate controls with adversarial/boundary cases.
- Updated the architecture, security model, and implementation plan for `worker-typescript`.

## Decisions And Rationale

- Serialized workflows use closed JSON Schema 2020-12 contracts; TypeScript types and runtime
  validators must be derived or mechanically checked, not handwritten as a second wire model.
- Operational failures are data at CLI/MCP boundaries. Raw exceptions and stacks never enter public
  results.
- Completed earlier authority is preserved when later stages fail; absence is never presented as
  successful analysis.
- Resource overrides may lower selected budgets but cannot disable limits or exceed policy ceilings.
- Compiler process isolation is part of the first slice because cooperative in-process cancellation
  cannot enforce hard memory or non-yielding time boundaries.
- D4 cache policy and D5 third-party provider isolation remain deferred until their capabilities
  enter scope.

## Blockers And Limitations

- D1 remains partially open: package scope, license, release intent, and supported platform matrix
  need owner decisions. The remote/default branch/initial checkpoint portions are complete.
- D1 does not block local M1.1 contract implementation, but it blocks formal foundation closure and
  package publication.
- ADR 0003 selects the schema representation but intentionally does not select a schema authoring or
  validation dependency. Revalidate candidates before adding one in M1.1.
- The JSON examples are design fixtures, not yet validated against executable JSON Schema.
- The resource values are conservative starting policy values, not measured ecosystem percentiles.
  Do not relax them silently when real-package fixtures arrive.
- No tests exist yet; current green checks prove tooling and JSON syntax, not product behavior.

## Immediate Next Actions

1. Start Task M1.1 by creating `packages/contracts` as a dependency-light workspace package.
2. Revalidate schema authoring/validation options, then choose one that can make JSON Schema the
   canonical source while mechanically deriving or checking TypeScript types and runtime validators.
3. Implement the installed-investigation v1 schema and turn the three design envelopes into golden
   valid-instance tests; add invalid unknown-field, wrong-version, broken-reference, and unsafe-error
   cases.
4. Define the shared `first-slice-v1` limit-name/policy contract without implementing filesystem or
   compiler behavior.
5. Resolve D1 with the owner before declaring Milestone 0 closed or publishing a package.

The first safe code increment is the package scaffold plus schema-validation test harness. It must
not add resolver, filesystem, compiler, CLI, MCP, registry, or provider behavior.

## Verification Commands

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
node --input-type=module -e 'import fs from "node:fs"; for (const file of process.argv.slice(1)) JSON.parse(fs.readFileSync(file, "utf8"));' docs/contracts/v1/*.json
git status --short --branch
git log --oneline --decorate -5
git diff main...HEAD --check
```

Task M1.1 must add focused contract/schema tests so future verification no longer relies on
`--passWithNoTests`.

## Delivery Metadata

- Repository: `/Users/dsteele/repos/package-spelunker`
- Branch: `codex/foundation-contract-decisions`
- Base/checkpoint: `a6ff0f59b3d92403c4ed11b695675419da55095f`
- Retained commits: `b677efb`, `2347f61`; final status/handoff changes are at branch HEAD
- Remote/default branch: `origin`, `main`
- Pull request: none created
- Dirty files before final delivery commit: `README.md`, `docs/architecture.md`, `docs/handoff.md`,
  `docs/implementation-plan.md`, `docs/product-brief.md`, `docs/roadmap.md`
- Date: 2026-08-14 (America/Toronto)
