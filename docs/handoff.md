# Handoff: Node Runtime Resolution Complete

- Updated: 2026-08-14
- Handoff status: Current
- Product status: Milestone 1 implementation; ready for TypeScript declaration resolution
- Active branch: `codex/node-runtime-resolution`

## Objective And Boundary

Continue Package Spelunker with Task M1.6, TypeScript declaration-target resolution. Task M1.5 now
consumes the exact M1.4 package selection and M1.3 immutable snapshot to resolve the Node 22 runtime
target under one explicit `import` or `require` lookup kind. It returns a snapshot-relative
JavaScript target, independent module format, normalized conditions, bounded structured trace, and
typed failure without reading the live package or executing code.

M1.5 does not select TypeScript declarations, run the compiler, model public symbols, compose the
public investigation envelope, expose CLI/MCP transports, access the network, or broaden the first
slice to JSON/native targets, Yarn Plug'n'Play, Bun, bundlers, package imports, or loader hooks.

## Canonical Sources

- [`specs/node-runtime-resolution.md`](specs/node-runtime-resolution.md): approved and implemented
  M1.5 behavior, sources, boundaries, and success criteria.
- [`architecture.md`](architecture.md): package ownership, dependency direction, and lifecycle.
- [`security-model.md`](security-model.md): snapshot-only resolution and target-validation
  invariants.
- [`implementation-plan.md`](implementation-plan.md): M1.5 completion and active M1.6 task.
- ADR [0004](decisions/0004-first-slice-resource-policy.md): graph and trace budgets.
- [`../fixtures/matrix.md`](../fixtures/matrix.md): stable acceptance IDs and implemented controls.
- [`../packages/node-resolution/`](../packages/node-resolution/): executable M1.5 boundary.

## Current Repository State

- Remote/default branch: `origin`, `main`.
- Base: merged `main` commit `80ab0fc` from PR #7.
- Active branch: `codex/node-runtime-resolution`.
- Retained M1.5 commits:
  - `ea429a7` — `docs: specify Node runtime resolution`
  - `d59ae7f` — `feat: require one runtime lookup condition`
  - `b521c55` — `feat: normalize runtime resolution conditions`
  - `a1d9ced` — `feat: resolve conditional package exports`
  - `3ffe5b7` — `feat: bound export map resolution`
  - `60c19ba` — `feat: resolve legacy runtime targets`
  - `c8fd10f` — `test: verify snapshot runtime resolution`
  - `9dfab5d` — `docs: record runtime resolution handoff`
  - `c48e3c5` — `fix: harden runtime resolution boundaries`
  - `30cdc64` — `fix: preserve malformed export failures`
- Pull request: draft [#8](https://github.com/dills122/package-spelunker/pull/8).
- Root metadata remains private, version `0.0.0`, and `UNLICENSED`; D1 remains open.

## Completed Work And Evidence

### Lookup-condition contract

- The public v1 request shape remains closed and unchanged.
- `runtimeConditions` now requires exactly one of `import` or `require` in the executable Draft
  2020-12 schema.
- The inward normalization API derives the lookup kind, restores `node`/kind/`default`, deduplicates
  custom conditions, sorts evidence deterministically, and freezes the result.

### Snapshot-only Node resolution

- Supports main export sugar, exact and pattern subpaths/trailers, ordered/nested conditional
  objects, arrays, and `null` exclusions.
- Parses raw retained manifest bytes for condition-key order and uses the normalized snapshot
  manifest for package `type` and identity.
- Enforces `exports` precedence/encapsulation and validates target containment before snapshot
  lookup.
- Keeps lookup kind separate from `.js`/`.mjs`/`.cjs` module-format classification.
- Supports explicit exports-absent import lookup and require file/directory fallbacks. JSON/native
  selections return `unsupported_context` in the JavaScript-only first slice.
- Returns fixed project-owned invalid, missing, unsupported, malformed, limit, and cancellation
  failures; successful traces and usage are immutable and package-relative.

### Security and integration evidence

- Unsafe relative/absolute/URL, traversal, encoded separator/dot-segment, `node_modules`, NUL, and
  backslash targets fail before file selection.
- `maxExportMapNodes`, `maxGraphDepth`, and `maxResolverTraceSteps` are enforced by exact name and
  can only be lowered.
- Focused tests cover positive controls beside patterns, arrays, exclusions, unsafe targets,
  cancellation, limits, legacy behavior, and unsupported formats.
- Snapshot-backed npm import/require, pnpm, and linked-workspace tests traverse the complete M1.4 →
  M1.3 → M1.5 chain and prove execution sentinels remain absent.
- Local verification passes: frozen offline install, `pnpm check` (14 files/144 tests), integration
  tests (14 files/144 tests), build, and `git diff --check`.

## Decisions And Rationale

- No new ADR was required. M1.5 implements the accepted architecture, security model, Node 22.22.1
  runtime baseline, and ADR 0004 limits without adding a dependency or changing the public v1 field
  set.
- Conditional branch priority must use raw JSON property order. The normalized manifest sorts
  objects for deterministic identity and therefore cannot answer this semantic question.
- `import`/`require` describe lookup conditions, not output format. The selected target and package
  `type` separately determine ESM versus CommonJS.
- The resolver depends on the immutable snapshot API instead of filesystem paths so no resolution
  decision can race or escape into uncaptured package state.
- Node runtime and TypeScript declaration resolution remain separate authoritative facts; their
  divergence is expected evidence, not an error to collapse.

## Blockers And Limitations

- D1 remains open for package scope, license, release intent, and supported platform matrix. It does
  not block local M1.6 work but blocks publication and formal foundation closure.
- The resolver is an inward engine API and is not yet composed into the serialized investigation
  envelope; M1.9 owns that workflow integration.
- JSON and native-addon targets are detected but intentionally unsupported. Yarn Plug'n'Play, Bun,
  bundler modes, package `imports`, self-resolution, syntax detection, and loader hooks are deferred.
- Runtime traces are retained on success. Fixed failures currently expose the typed outcome without
  a partial failure trace; core/result-envelope policy remains owned by M1.9 and the v1 contract.
- M1.5 follows the explicit Node 22.22.1 specification. A later Node baseline change requires
  source revalidation and compatibility fixtures rather than silent semantic drift.

## Immediate Next Actions

1. Specify M1.6 TypeScript declaration resolution against the existing v1
   `typescriptConditions`/`tsconfigPath` request fields and immutable snapshot boundary.
2. Decide compiler-version selection, applicable `tsconfig` options, package `types`/conditional
   `types`/`typesVersions` precedence, and how project-aware resolution consumes importer context.
3. Create `packages/typescript-resolution` only after the specification and acceptance fixtures are
   approved.
4. Preserve runtime/declaration divergence as two results with separate traces and authority.
5. Keep compiler execution/isolation work assigned to M1.8; M1.6 must not execute package runtime
   code or gain unbounded live-filesystem authority.

## Verification Commands

Run before delivery and again when continuing from a clean branch:

```sh
pnpm install --frozen-lockfile --offline
pnpm check
pnpm test:integration
pnpm build
git diff --check
git status --short --branch
git log --oneline --decorate -12
```

## Delivery Metadata

- Repository: `/Users/dsteele/repos/package-spelunker`
- Branch: `codex/node-runtime-resolution`
- Base: `80ab0fc`
- Pull request: draft [#8](https://github.com/dills122/package-spelunker/pull/8)
- Date: 2026-08-14 (America/Toronto)
