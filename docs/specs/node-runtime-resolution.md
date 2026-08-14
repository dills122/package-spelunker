# Spec: Node Runtime Resolution (M1.5)

- Status: Implemented
- Approved: 2026-08-14
- Runtime baseline: Node.js 22.22.1

## Objective

Resolve the Node runtime file selected for one already-discovered installed/workspace package and
specifier, under an explicit `import` or `require` lookup kind and active conditions. Resolution must
consume the immutable M1.3 snapshot, preserve the exact M1.4 package/importer selection, produce a
bounded deterministic trace, and never import, require, evaluate, or execute package code.

Success means the engine returns one existing snapshot-relative target, its Node module format, the
normalized active conditions, and enough trace evidence to explain subpath, pattern, condition,
fallback, and rejection decisions.

## Contract

The public v1 request remains closed and gains no new field. `runtimeConditions` must contain exactly
one of `import` or `require`; both or neither are invalid. Resolution normalizes the active set to
include `node`, the selected lookup kind, and `default`, plus caller-provided custom conditions.
Condition-set ordering is canonical and does not control branch priority: Node evaluates condition
object keys in manifest order.

The inward-facing resolver input contains:

- the immutable `PackageSnapshot`;
- the normalized package subpath (`.` or `./...`);
- lookup kind `import | require` derived at the request boundary;
- normalized active conditions;
- optional lowered `maxExportMapNodes`, `maxGraphDepth`, and `maxResolverTraceSteps` limits;
- optional cancellation signal.

The success result contains:

- one snapshot-relative target file;
- lookup kind and target `moduleMode: esm | commonjs` as separate facts;
- normalized active conditions;
- immutable structured trace steps and measured step count.

Failures use fixed project-owned values:

- `invalid_request` for invalid lookup conditions or subpaths;
- `resolution_failed` for an unexported or absent target;
- `unsupported_context` for target formats outside the JavaScript first slice;
- `malformed_artifact` for structurally invalid or unsafe export/main metadata;
- `resource_limit_exceeded` with the exact limit name;
- `cancelled` for cooperative cancellation.

## Node 22.22.1 Semantics

The implementation follows the official Node 22.22.1 package rules:

- `exports` takes precedence over `main` and encapsulates all unlisted subpaths;
- main export sugar, exact subpaths, pattern subpaths/trailers, `null`, arrays, conditional objects,
  and nested conditional objects are supported;
- export targets must start with `./` and may not contain traversal, `node_modules`, dot segments,
  NULs, backslashes, absolute paths, URLs, or encoded invalid segments;
- pattern substitution is textual and may include nested `/` segments when the substituted subpath
  remains valid;
- condition objects are evaluated in JSON property order, with `default` always matching;
- when `exports` is absent, `main` applies only to the package root; package subpaths use legacy
  lookup-kind behavior;
- `require` legacy lookup may test `.js`, `.json`, `.node`, and directory forms, but this first slice
  returns only JavaScript targets and reports other formats as unsupported;
- `import` does no extension searching or folder-index resolution;
- `.mjs` is ESM, `.cjs` is CommonJS, and `.js` follows the selected package manifest `type`.

The raw snapshot `package.json` bytes are parsed by the resolver because conditional-object key order
is semantic. The separately normalized manifest remains authoritative for identity and package type,
but its sorted object representation is not used for condition priority.

Official sources:

- <https://nodejs.org/download/release/v22.22.1/docs/api/packages.html#package-entry-points>
- <https://nodejs.org/download/release/v22.22.1/docs/api/packages.html#path-rules-and-validation-for-export-targets>
- <https://nodejs.org/download/release/v22.22.1/docs/api/packages.html#subpath-patterns>
- <https://nodejs.org/download/release/v22.22.1/docs/api/packages.html#conditional-exports>
- <https://nodejs.org/download/release/v22.22.1/docs/api/packages.html#packagejson-and-file-extensions>

## Commands

- Install: `pnpm install --frozen-lockfile --offline`
- Focused tests: `pnpm exec vitest run packages/node-resolution/test`
- Static checks: `pnpm check:static`
- Typecheck: `pnpm typecheck`
- Full tests: `pnpm test`
- Integration tests: `pnpm test:integration`
- Build: `pnpm build`
- Full gate: `pnpm check`

## Project Structure

```text
packages/node-resolution/
├── package.json          package boundary and snapshot dependency
├── tsconfig.json         composite TypeScript build
├── src/
│   ├── index.ts          public inward-facing exports
│   ├── conditions.ts     request-condition normalization
│   └── resolver.ts       snapshot-only Node resolution and traces
└── test/
    ├── conditions.test.ts
    └── resolver.test.ts
```

Existing npm/pnpm/workspace fixtures remain inert. Focused tests may construct immutable snapshots
from materialized fixtures and create additional package metadata/files only inside test-owned
temporary directories.

## Code Style

Use frozen discriminated unions with fixed safe failures:

```ts
type RuntimeResolutionResult =
  | { readonly ok: true; readonly value: RuntimeResolution }
  | { readonly ok: false; readonly failure: RuntimeResolutionFailure };
```

Resolver functions return values rather than throw expected operational failures. Trace and target
paths are package-relative POSIX paths. Export-map traversal is iterative or explicitly depth-counted
and checks cancellation/limits before retaining each trace step.

## Testing Strategy

- Pure unit tests cover condition normalization, exact subpaths, condition priority, nested
  conditions, patterns, arrays, `null`, unsafe targets, module-format classification, and limits.
- Snapshot-backed integration tests cover npm import/require branches, linked workspace selection,
  no-execution sentinels, and target existence.
- Every adversarial case has a nearby positive control.
- Tests assert observable targets, formats, traces, and typed failures rather than private helper
  calls.

## Boundaries

- Always: validate condition mode and package subpath before manifest traversal; resolve only files
  captured in the supplied snapshot; preserve manifest key order; bound graph/trace work; propagate
  cancellation; return safe relative evidence.
- Ask first: changing the serialized v1 field set, adding dependencies, raising first-slice limits,
  or broadening runtime formats beyond JavaScript.
- Never: invoke Node's live resolver as the answer, reread live package files after snapshot creation,
  execute package code, fall back through `main` when `exports` exists, or allow a target outside the
  snapshot.

## Tasks

- [x] Enforce and normalize one `import | require` request mode.
  - Acceptance: both/neither fail; built-ins/custom conditions canonicalize deterministically.
  - Verify: contract and `conditions` tests plus typecheck.
- [x] Resolve main sugar, exact subpaths, and ordered conditional/nested targets.
  - Acceptance: npm fixture import/require branches and unexported paths return expected outcomes.
  - Verify: focused resolver tests against immutable snapshots.
- [x] Add pattern, array, `null`, target-validation, cancellation, and graph/trace limits.
  - Acceptance: paired positive/adversarial tests return exact target or typed failure.
  - Verify: focused resolver tests and static checks.
- [x] Add legacy fallback and module-format classification.
  - Acceptance: exports-absent import/require behavior is explicit; unsupported formats are typed.
  - Verify: focused unit/integration tests.
- [x] Reconcile canonical docs, review, and deliver.
  - Acceptance: M1.5 docs/handoff are current; full local and CI gates pass.
  - Verify: `pnpm check`, `pnpm test:integration`, `pnpm build`, and `git diff --check`.

## Success Criteria

- npm, pnpm, and linked-workspace snapshots resolve expected runtime targets under explicit import
  and require conditions.
- Export maps, exact/pattern subpaths, ordered/nested conditions, arrays, null exclusions, legacy
  fallback, and module format are fixture-backed.
- Unsafe, unexported, missing, unsupported, ambiguous, cancelled, and over-budget cases are typed.
- Every success/failure trace is bounded, deterministic, immutable, and free of absolute paths.
- No inspected package code executes and no resolver stage reads outside the immutable snapshot.
- Full repository checks and Linux CI pass.

## Open Questions

None for M1.5. JSON/native-addon runtime targets, syntax detection for ambiguous extensionless files,
Yarn Plug'n'Play, Bun/bundler modes, package `imports`, self-resolution, and live loader hooks remain
outside this first slice.
