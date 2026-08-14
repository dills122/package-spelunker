# Handoff: Deterministic Fixture Harness Complete

- Updated: 2026-08-14
- Handoff status: Current
- Product status: Milestone 1 implementation; ready for safe snapshot construction
- Active branch: `codex/deterministic-fixture-harness`

## Objective And Boundary

Continue Package Spelunker with Task M1.3, safe installed/workspace snapshot construction. Task M1.2
now provides deterministic positive controls and adversarial filesystem cases for containment,
symlinks, cycles, malformed manifests, and byte limits.

The fixture harness is test infrastructure. It does not implement approved-root enforcement,
bounded production reads, manifest normalization, snapshot hashing, workspace selection, resolution,
compiler analysis, CLI behavior, MCP behavior, registry access, or providers.

## Canonical Sources

- [`product-brief.md`](product-brief.md): product scope and first-release outcome.
- [`architecture.md`](architecture.md): package ownership, dependency direction, and lifecycle.
- [`security-model.md`](security-model.md): trust model and path/read invariants.
- [`roadmap.md`](roadmap.md): milestone outcomes and exit gates.
- [`implementation-plan.md`](implementation-plan.md): active task status and ordered work.
- ADR [0003](decisions/0003-versioned-contract-envelopes.md): result vocabulary and compatibility.
- ADR [0004](decisions/0004-first-slice-resource-policy.md): `first-slice-v1` budgets and compiler
  isolation.
- [`../fixtures/matrix.md`](../fixtures/matrix.md): stable acceptance IDs and remaining cases.
- [`../packages/test-fixtures/`](../packages/test-fixtures/): executable fixture catalog,
  materializers, and tests.

## Current Repository State

- Remote/default branch: `origin`, `main`.
- Base: merged `main` commit `3d85927` from PR #4 plus the GitHub Actions dependency updates merged
  before it.
- Active branch: `codex/deterministic-fixture-harness`.
- Implementation commits preceding this handoff:
  - `c727d7d` — `test: add deterministic fixture catalog`
  - `475c8ad` — `test: add deterministic workspace fixtures`
  - `1ac2b12` — `test: materialize adversarial filesystem fixtures`
  - `67f22a0` — `test: cover inclusive manifest byte limit`
  - `650f7a9` — `test: assert commonjs fixtures remain inert`
  - `58a7429` — `fix: reject non-empty fixture destinations`
  - `db9f896` — `style: format fixture tests`
- Root metadata remains private, version `0.0.0`, and `UNLICENSED`.
- Internal package names remain provisional until D1 resolves publication metadata.

## Completed Work And Evidence

### Typed fixture catalog

- Added private package `@package-spelunker/test-fixtures` and a root TypeScript project reference.
- Cataloged implemented paired cases by stable matrix ID with expected outcome, provenance, and
  mandatory no-execution metadata.
- Verified catalog IDs are unique and declared in `fixtures/matrix.md`.

### Checked-in positive layouts

- Added inert `npm-basic`, `pnpm-basic`, and `workspace-linked` workspaces.
- Covered package subpaths, conditional import/require/types targets, a type-only export, and a
  declaration re-export.
- Included minimal npm/pnpm lockfiles without registry downloads or generated install state.
- Package manifests contain no lifecycle scripts. Runtime `.js`/`.cjs` entries throw
  `FIXTURE_RUNTIME_EXECUTED` if accidentally loaded.

### Materialized positive/adversarial cases

- Recreate pnpm virtual-store and admitted workspace package symlinks in caller-owned temporary
  directories.
- `CTX-001`: contained importer versus a `..` path that resolves outside the approved root.
- `FS-001`: admitted workspace package link versus an escaping directory link.
- `FS-002`: contained declaration link versus an escaping file link.
- `FS-003`: short acyclic declaration chain versus a real symlink cycle.
- `CFG-001`: valid manifest exactly at 1 MiB, manifest one byte over, and malformed JSON.
- Materializers return explicit roots, named paths, expected outcomes, and a sentinel path; they do
  not install, import, require, or execute fixture code.

## Decisions And Rationale

- Keep small semantic package layouts checked in for reviewability; generate symlinks and large
  boundary files in temporary directories for portability and repository size.
- Use real filesystem links rather than mocks so later containment tests exercise canonical paths.
- Treat the configured byte ceiling as inclusive: exactly `maxManifestBytes` is the positive
  boundary and one byte above is adversarial.
- Keep fixture expectations separate from production path-policy logic so tests do not prove an
  engine with a duplicate implementation of its own behavior.
- Later matrix cases remain owned by the engine/worker task that can assert their product outcome;
  M1.2 does not create placeholder graphs or workers.

## Blockers And Limitations

- D1 remains open for package scope, license, release intent, and supported platform matrix. It does
  not block local M1.3 work, but it blocks publication and formal foundation closure.
- Symlink fixtures are verified on the current macOS host; GitHub CI supplies Linux evidence when a
  PR is opened. Windows support is not promised while D1 remains open.
- The fixture helpers expose dangerous paths intentionally. Production code must still canonicalize
  and check containment immediately before every read.
- No snapshot identity or manifest-normalization contract has been implemented beyond the existing
  installed-investigation envelope.

## Immediate Next Actions

1. Create `packages/package-snapshot` with a narrow path-policy interface and failing tests using
   `CTX-001` and `FS-001` through `FS-003`.
2. Implement canonical approved-root/artifact-root containment with explicit symlink-hop and path
   limits; recheck containment immediately before reads.
3. Add a bounded file reader and prove inclusive/over-limit/malformed behavior with `CFG-001`.
4. Normalize only the manifest fields required by the first slice and preserve source evidence.
5. Derive deterministic installed/workspace snapshot identity from relevant bytes and normalized
   context, then verify stability and change sensitivity.
6. Extend public contracts only when the snapshot package needs a reviewed cross-package shape;
   do not leak Node filesystem errors or raw manifest objects.

## Verification Commands

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:integration
pnpm build
git diff --check
git status --short --branch
git log --oneline --decorate -10
```

## Delivery Metadata

- Repository: `/Users/dsteele/repos/package-spelunker`
- Branch: `codex/deterministic-fixture-harness`
- Base/checkpoint: `3d85927`
- Pull request: none created
- Date: 2026-08-14 (America/Toronto)
