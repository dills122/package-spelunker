# Handoff: TypeScript Declaration Resolution Complete

- Updated: 2026-08-14
- Handoff status: Current
- Product status: Milestone 1 implementation; ready for public TypeScript API modeling
- Active branch: `codex/typescript-declaration-resolution`

## Objective And Boundary

Continue Package Spelunker with Task M1.7, compiler-backed public TypeScript API modeling. Task M1.6
now resolves one declaration target for the exact M1.4 selection and M1.3 immutable snapshot under
an explicit importer, TypeScript import/require lookup kind, and applicable `tsconfig.json` or
`jsconfig.json`. It uses the pinned TypeScript 6.0.3 compiler only inside a terminable child with a
brokered virtual filesystem.

M1.6 does not traverse or normalize public symbols, compose the public investigation workflow,
expose CLI/MCP transports, download packages, load workspace compilers/plugins, or broaden the first
slice beyond Node16/NodeNext and a single selected package artifact.

## Canonical Sources

- [`specs/typescript-declaration-resolution.md`](specs/typescript-declaration-resolution.md):
  approved and implemented M1.6 behavior, sources, gates, and verification.
- [`research/typescript-declaration-resolution.md`](research/typescript-declaration-resolution.md):
  compiler/version research and rejected alternatives.
- [`architecture.md`](architecture.md): package ownership, dependency direction, and lifecycle.
- [`security-model.md`](security-model.md): compiler-process, broker, snapshot, and containment
  invariants.
- [`implementation-plan.md`](implementation-plan.md): M1.6 completion and active M1.7 task.
- ADR [0004](decisions/0004-first-slice-resource-policy.md): compiler/process budgets.
- [`../fixtures/matrix.md`](../fixtures/matrix.md): M1.6 resolver and worker evidence.

## Current Repository State

- Remote/default branch: `origin`, `main`.
- Base: merged `main` commit `fc824e3` from PR #8.
- Active branch: `codex/typescript-declaration-resolution`.
- Pull request: pending final review and packaging.
- Root metadata remains private, version `0.0.0`, and `UNLICENSED`; D1 remains open.

## Completed Work And Evidence

### Contract and compiler policy

- The unreleased v1 request now requires exactly one TypeScript `import` or `require` condition.
- TypeScript success serializes the selected target, exact compiler version, nullable config path,
  Node16/NodeNext mode, lookup kind, and normalized conditions.
- `@typescript/typescript6@6.0.2` is pinned exactly; the lock resolves its trusted compiler
  implementation to TypeScript 6.0.3. Workspace compiler code and plugins are never loaded.

### Compiler-backed declaration resolution

- `packages/typescript-resolution` delegates conditional `types`, `types`/`typings`,
  `typesVersions`, extension substitution, module suffixes, and package exports to the official
  compiler API through an explicit host—never `ts.sys`.
- JSONC project config, contained `extends`, custom conditions, paths/baseUrl, Node16/NodeNext, and a
  fixed no-config NodeNext baseline are represented. Bundler/legacy modes and successful redirects
  outside the selected artifact are typed unsupported contexts.
- A result succeeds only for a `.d.ts`, `.d.mts`, or `.d.cts` file present in the admitted snapshot
  and returns bounded package-relative trace evidence.

### Isolated worker and local-first broker

- `packages/worker-typescript` owns a closed v1 protocol, bounded length-prefixed broker frames,
  synchronous child host calls, asynchronous parent service, and strict response validation.
- The child starts at `/` with an empty environment and lowered V8 heap ceiling. Wall time,
  cancellation/grace, output, crash, OOM, malformed frames/output, and snapshot mismatch fail
  closed without raw stderr, stacks, or absolute evidence paths.
- The production adapter maps npm logical roots, pnpm store roots, and linked-workspace roots to the
  same immutable snapshot bytes. It never reopens live selected-package files.
- Workspace config/inheritance, importer metadata, topology, source-existence probes, and absences
  are contained, bounded, and memoized for one operation. Parent and child independently hash every
  broker observation; success requires the same project-context hash.

### Integration behavior

- Workspace discovery now checks explicit config first and otherwise searches importer ancestors,
  preferring `tsconfig.json` over `jsconfig.json` at each level.
- Checked-in npm, pnpm, and linked-workspace fixtures run through discovery, snapshot construction,
  Node runtime resolution, broker preparation, and the real compiler child.
- Runtime `.js` targets and declaration `.d.ts` targets remain independent authoritative answers
  with separate traces. Execution sentinels remain absent.
- Final local verification passes: frozen offline install, `pnpm check` (22 files/200 tests),
  `pnpm test:integration` (22 files/200 tests), build, and `git diff --check`.

## Decisions And Rationale

- The owner approved four gates: pinned TypeScript 6, minimum M1.8 process isolation brought
  forward, unreleased v1 contract correction, and single-artifact declaration success.
- Local installed state is authoritative and network-free. The compiler reads selected package
  content only through the immutable snapshot and project metadata only through the capability
  broker.
- Paths aliases, `@types`, and other external declaration providers are detected but cannot be
  mislabeled as part of the selected package until a multi-artifact provenance contract exists.
- M1.7 should reuse this worker and broker rather than introducing another compiler process or
  filesystem authority.

## Blockers And Limitations

- D1 remains open for package scope, license, release intent, and supported platform matrix. It does
  not block local M1.7 work but blocks publication and formal foundation closure.
- Package-based config inheritance is permitted only when broker policy admits its bounded JSON
  metadata; workspace plugins are ignored and never executed.
- Yarn Plug'n'Play, Bun-specific resolution, bundler/Node10/classic modes, remote fallback, and
  multi-artifact declaration success are deferred.
- The inward declaration stage is not yet composed into the public result envelope; M1.9 owns that
  workflow. Public symbols and graph limits remain M1.7.
- An in-session five-axis review found and fixed config-default, protocol-consistency, directory,
  snapshot-identity, and tainted-output defects. A truly fresh-context independent review remains a
  pull-request review step because it must run outside the authoring task.

## Immediate Next Actions

1. Specify M1.7 public symbol normalization against the M1.6 declaration result and existing v1
   symbol contracts.
2. Reuse the pinned compiler child and memoized context broker for aliases, re-exports, merged
   declarations, signatures, members, JSDoc, deprecations, and stable relative locations.
3. Decide partial-result behavior for declaration cycles and public-symbol/signature limits before
   implementation.
4. Add golden symbol fixtures without changing M1.6 single-artifact or no-execution gates.
5. Keep workflow composition in M1.9 and transports outside the engine packages.

## Verification Commands

Run before delivery and again when continuing from a clean branch:

```sh
pnpm install --frozen-lockfile --offline
pnpm check
pnpm test:integration
pnpm build
git diff --check
git status --short --branch
git log --oneline --decorate -15
```

## Delivery Metadata

- Repository: `/Users/dsteele/repos/package-spelunker`
- Branch: `codex/typescript-declaration-resolution`
- Base: `fc824e3`
- Pull request: pending
- Date: 2026-08-14 (America/Toronto)
