# Handoff: Safe Installed Snapshot Complete

- Updated: 2026-08-14
- Handoff status: Current
- Product status: Milestone 1 implementation; ready for workspace/importer discovery
- Active branch: `codex/safe-installed-snapshot`

## Objective And Boundary

Continue Package Spelunker with Task M1.4, workspace and importer-context discovery. Task M1.3 now
provides the filesystem capability that later discovery and resolver packages must use: contained
path selection, bounded regular-file reads, normalized manifests, and immutable installed/workspace
snapshots.

M1.3 does not discover a workspace, interpret lockfiles/workspace configuration, validate package
specifiers, select an installed package instance, implement Node or TypeScript resolution, analyze
declarations, expose a CLI/MCP surface, access the registry, or execute package code.

## Canonical Sources

- [`product-brief.md`](product-brief.md): product scope and first-release outcome.
- [`architecture.md`](architecture.md): package ownership, dependency direction, and snapshot model.
- [`security-model.md`](security-model.md): trust model and filesystem/read invariants.
- [`roadmap.md`](roadmap.md): milestone outcomes and exit gates.
- [`implementation-plan.md`](implementation-plan.md): M1.3 completion and active M1.4 task.
- ADR [0002](decisions/0002-canonical-snapshots-and-provider-boundaries.md): one immutable,
  content-identified snapshot per investigation.
- ADR [0004](decisions/0004-first-slice-resource-policy.md): fixed path/read/traversal budgets and
  normalized limit outcomes.
- [`../fixtures/matrix.md`](../fixtures/matrix.md): stable acceptance IDs and implemented controls.
- [`../packages/package-snapshot/`](../packages/package-snapshot/): executable M1.3 boundary.

## Current Repository State

- Remote/default branch: `origin`, `main`.
- Base: merged `main` commit `4b9ff99` from PR #5.
- Active branch: `codex/safe-installed-snapshot`.
- M1.3 commits:
  - `d64f8d7` — `feat: enforce canonical package path containment`
  - `672ebdd` — `feat: add bounded manifest reads`
  - `a647666` — `feat: construct immutable package snapshots`
  - `0c25f11` — `fix: require stable approved root directories`
  - `53a2882` — `fix: recheck canonical root after symlink walks`
- Documentation/status reconciliation is the only expected work after those behavior commits and
  the pre-PR containment review fix.
- Root metadata remains private, version `0.0.0`, and `UNLICENSED`; D1 remains open.

## Completed Work And Evidence

### Contained path policy

- Canonicalizes explicit approved roots and optional artifact roots without exposing raw Node errors.
- Rejects lexical traversal before touching the outside target and re-walks contained symlinks with
  cycle detection.
- Applies inclusive `maxRelativePathBytes`, `maxPathSegments`, and `maxSymlinkHops` safeguards that
  internal tests may lower but never raise.
- Exercises `CTX-001`, `FS-001` through `FS-003`, and focused `FS-004` byte/segment boundaries.

### Bounded reads and manifest normalization

- Rechecks containment immediately before `O_NOFOLLOW` file opens, requires regular files, compares
  descriptor/path identity, and reads in capped chunks without allocating from an untrusted size.
- Distinguishes inclusive `maxManifestBytes`, file-byte failures, malformed UTF-8/JSON/metadata,
  filesystem escape, cancellation, and manifest graph limits with project-owned failures.
- Freezes only first-slice package identity and resolution fields; raw manifests and absolute paths
  do not cross the package boundary.

### Immutable installed/workspace snapshots

- Streams directory entries under `maxFilesVisited`, rejects recursive directory symlinks, admits
  only contained file symlinks, and caps per-file plus aggregate artifact bytes.
- Captures regular-file bytes, file-symlink targets, and directory topology in an in-memory snapshot;
  `readFile` returns defensive copies.
- Frames sorted logical paths, topology, and exact bytes into a SHA-256 artifact hash. A separate
  SHA-256 snapshot ID binds content to normalized importer context, package identity, and source
  without including machine-specific absolute roots.
- Tests prove cross-temp-root stability, byte and empty-directory sensitivity, context sensitivity,
  admitted workspace links, escaping-root rejection, immutable reads, exact budget names,
  cancellation, and no-execution sentinels.

## Decisions And Rationale

- No new ADR was added: M1.3 implements accepted ADRs 0002 and 0004 without changing the public v1
  serialized envelope.
- Snapshot package contracts remain inward-facing TypeScript discriminated unions. Core will map
  them into the already accepted versioned workflow envelope instead of leaking filesystem objects.
- Capture all bounded package regular files and directory topology so later analyzers share the same
  immutable bytes and path existence, rather than independently rereading a mutable package tree.
- Hash length-framed fields and use code-unit ordering so filenames and bytes cannot create ambiguous
  concatenations or locale-dependent identity.
- Reject directory symlinks during recursive capture. Legitimate package-root links are canonicalized
  once; contained file links remain supported and topology-sensitive.

## Blockers And Limitations

- D1 remains open for package scope, license, release intent, and supported platform matrix. It does
  not block local M1.4 work but blocks publication and formal foundation closure.
- The current host evidence is macOS. CI supplies Linux evidence after the PR opens; Windows support
  remains undecided under D1.
- Portable Node APIs do not expose a complete `openat`-style capability walk. Immediate rechecks,
  final-link refusal, and descriptor/path comparison reduce time-of-check/time-of-use exposure, but a
  hostile concurrent parent-directory mutator remains a residual platform risk.
- Snapshot capture is deliberately in-memory and limited to 128 MiB by `first-slice-v1`; persistent
  caches and registry tarballs remain deferred.
- M1.4 must validate package specifiers and choose the exact package root before calling snapshot
  construction. M1.3 intentionally accepts an already selected root.

## Immediate Next Actions

1. Create `packages/workspace-model` with a narrow context/selection result and failing tests against
   npm, pnpm, and workspace-linked fixtures.
2. Validate bare/scoped package specifiers and optional subpaths before any filesystem mapping,
   including the `CTX-002` traversal/NUL/URL adversarial cases.
3. Discover the explicit importer's workspace package, package-manager/config evidence, and exact
   installed or linked package root without implementing export-map semantics.
4. Return only approved canonical roots and normalized workspace-relative evidence, then hand the
   selected package root/context to `constructPackageSnapshot`.
5. Preserve unsupported or ambiguous contexts as typed failures rather than guessed resolution.

## Verification Commands

Executed on the macOS development host after the final review fix:

- `pnpm install --frozen-lockfile --offline`
- `pnpm check` — 9 test files and 70 tests passed
- `pnpm test:integration` — 9 test files and 70 tests passed
- `pnpm build`
- `git diff --check`

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
- Branch: `codex/safe-installed-snapshot`
- Base/checkpoint: `4b9ff99`
- Retained implementation commits: `d64f8d7`, `672ebdd`, `a647666`, `0c25f11`, `53a2882`
- Pull request: draft [#6](https://github.com/dills122/package-spelunker/pull/6)
- Date: 2026-08-14 (America/Toronto)
