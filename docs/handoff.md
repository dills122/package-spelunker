# Handoff: Workspace And Importer Context Complete

- Updated: 2026-08-14
- Handoff status: Current
- Product status: Milestone 1 implementation; ready for Node runtime resolution
- Active branch: `codex/workspace-importer-context`

## Objective And Boundary

Continue Package Spelunker with Task M1.5, Node runtime-target resolution. Task M1.4 now provides the
approved importer/workspace context and exact installed or linked package root that the runtime
resolver must consume. It validates package specifiers before filesystem mapping, records bounded
npm/pnpm configuration evidence, and composes safely with M1.3 snapshot construction.

M1.4 does not interpret export maps, choose runtime conditions, determine ESM/CommonJS behavior,
apply TypeScript resolution, analyze declarations, expose a CLI/MCP surface, access the network, or
execute package code.

## Canonical Sources

- [`product-brief.md`](product-brief.md): product scope and first-release outcome.
- [`architecture.md`](architecture.md): package ownership, dependency direction, and lifecycle.
- [`security-model.md`](security-model.md): package-specifier and filesystem/read invariants.
- [`implementation-plan.md`](implementation-plan.md): M1.4 completion and active M1.5 task.
- ADR [0002](decisions/0002-canonical-snapshots-and-provider-boundaries.md): immutable snapshots.
- ADR [0004](decisions/0004-first-slice-resource-policy.md): path, config, and lockfile budgets.
- [`../fixtures/matrix.md`](../fixtures/matrix.md): stable acceptance IDs and implemented controls.
- [`../packages/workspace-model/`](../packages/workspace-model/): executable M1.4 boundary.

## Current Repository State

- Remote/default branch: `origin`, `main`.
- Base: merged `main` commit `88e7e65` from PR #6.
- Active branch: `codex/workspace-importer-context`.
- M1.4 commits:
  - `7346995` — `feat: validate installed package specifiers`
  - `8d833ab` — `feat: discover workspace importer context`
  - `3b97ab0` — `test: verify exact workspace package selection`
- Pull request: draft [#7](https://github.com/dills122/package-spelunker/pull/7).
- Root metadata remains private, version `0.0.0`, and `UNLICENSED`; D1 remains open.

## Completed Work And Evidence

### Safe package-specifier boundary

- Parses bare and scoped names with optional subpaths without selecting runtime targets.
- Rejects traversal, encoded paths, NULs, absolute/relative filesystem paths, backslashes,
  protocols, URLs, malformed scopes, empty segments, and over-budget inputs as `invalid_request`.
- Validation precedes root canonicalization and every filesystem lookup.

### Workspace and importer discovery

- Canonicalizes one explicit approved workspace root and contained importer file.
- Supports npm `package-lock.json` plus workspace arrays and pnpm lock/workspace files.
- Finds the importer's nearest declared workspace package and nearest/explicit bounded `tsconfig`.
- Reads manifests/workspace configs under `maxManifestBytes` and lockfiles under
  `maxLockfileBytes`, propagating cancellation and fixed failures.
- Returns canonical roots only for internal filesystem capabilities and workspace-relative evidence
  for manifests, lockfiles, workspace config, `tsconfig`, and the selected package manifest.

### Exact installed or linked selection

- Searches ancestor `node_modules` entries from the importer package to the workspace root and
  chooses the nearest exact instance.
- Canonicalizes pnpm store links and workspace links, validates the selected manifest identity, and
  classifies the source as `installed` or `workspace`.
- Preserves missing, ambiguous, unsupported, malformed, cancelled, resource-limit, and
  outside-root outcomes as typed failures rather than guessed resolution.
- npm, pnpm, workspace-link, nearer-version, escaping-link, lockfile-budget, and no-execution tests
  pass; the selected root/context constructs an immutable M1.3 snapshot successfully.

## Decisions And Rationale

- No new ADR was required. M1.4 implements accepted architecture and ADR 0004 budgets without
  changing the serialized v1 investigation envelope.
- `workspace-model` depends only on `package-snapshot` containment, bounded-read, and manifest
  capabilities. This avoids duplicating security-sensitive filesystem policy; `core` still owns
  snapshot construction and workflow composition.
- The first slice supports simple exact workspace paths and one-level `*` membership patterns.
  Complex globs and unknown managers return `unsupported_context` instead of approximated answers.
- Lockfiles establish bounded package-manager evidence in M1.4 but are not yet interpreted for
  dependency overrides, patches, catalogs, or target semantics.

## Blockers And Limitations

- D1 remains open for package scope, license, release intent, and supported platform matrix. It does
  not block local M1.5 work but blocks publication and formal foundation closure.
- npm and pnpm are the implemented first-slice managers. Yarn, Bun, Plug'n'Play, rich pnpm catalogs,
  patches, aliases, overrides, and complex workspace globs remain unsupported.
- Package selection is filesystem/importer aware but intentionally stops before `exports`, runtime
  conditions, module mode, and target-file semantics.
- Workspace config parsing is deliberately narrow and deterministic. Full package-manager config
  semantics should be added only with fixture-backed contracts.
- The M1.3 residual `openat`-style parent-mutation risk also applies to discovery probes; immediate
  canonicalization and bounded descriptor reads reduce but cannot eliminate it with portable Node.

## Immediate Next Actions

1. Create `packages/node-resolution` with a narrow input consuming the M1.4 selection and M1.3
   immutable snapshot.
2. Resolve the requested package root/subpath under explicit conditions and importer module context,
   without importing or executing the target.
3. Implement fixture-backed `exports` selection, CommonJS/ESM branches, unexported subpaths, and
   structured selection/rejection traces.
4. Enforce export-map depth/breadth and trace-step budgets with exact typed outcomes.
5. Keep the runtime answer separate from the later TypeScript declaration answer.

## Verification Commands

Run before delivery and again when continuing from a clean branch:

```sh
pnpm install --frozen-lockfile --offline
pnpm check
pnpm test:integration
pnpm build
git diff --check
git status --short --branch
git log --oneline --decorate -10
```

## Delivery Metadata

- Repository: `/Users/dsteele/repos/package-spelunker`
- Branch: `codex/workspace-importer-context`
- Base: `88e7e65`
- Pull request: draft [#7](https://github.com/dills122/package-spelunker/pull/7)
- Date: 2026-08-14 (America/Toronto)
