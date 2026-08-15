# Spec: TypeScript Declaration Resolution (M1.6)

- Status: Approved; implementation in progress
- Approved: 2026-08-14
- Analysis compiler baseline: `@typescript/typescript6@6.0.2`, lock-resolved to TypeScript 6.0.3

## Objective

Resolve the declaration entry point selected for one already-discovered installed/workspace package
and specifier under an exact importer, explicit TypeScript lookup kind, and applicable project
configuration. The answer remains separate from Node runtime resolution and must explain legitimate
runtime/declaration divergence.

Resolution is local-first and network-free. It consumes the selected immutable package snapshot,
never imports package or workspace dependency code, and runs compiler-backed work only inside the
terminable child-process boundary required by ADR 0004.

## Contract

The public v1 request keeps its existing fields, but `typescriptConditions` must contain exactly one
of `import` or `require`. Compiler-owned conditions are normalized by the engine; remaining request
conditions are merged with applicable project `customConditions` in deterministic order.

The public TypeScript success data changes before its first release to contain:

```ts
interface TypeScriptResolutionDataV1 {
  target: string; // selected-package-relative POSIX path
  compilerVersion: string;
  tsconfigPath: string | null;
  moduleResolution: "node16" | "nodenext";
  lookupKind: "import" | "require";
  conditions: readonly string[];
}
```

`tsconfigPath: null` means the resolver used documented inferred options because no explicit or
discoverable TypeScript/JavaScript project config applied. The structured inward result also carries
an immutable trace, measured usage, selected package snapshot ID, and memoized project-context hash.

Config discovery checks an explicit `tsconfigPath` first; that existing field may identify either a
`tsconfig.json` or `jsconfig.json`. Otherwise it searches importer ancestors toward the workspace
root, preferring `tsconfig.json` over `jsconfig.json` in the same directory. With no config, the
fixed inferred baseline is `module: nodenext`, `moduleResolution: nodenext`,
`resolvePackageJsonExports: true`, `allowJs: true`, and `noEmit: true`; the request still supplies the
explicit import/require resolution mode.

Expected failures are fixed project-owned values:

- `invalid_request` for ambiguous lookup conditions or invalid config input;
- `resolution_failed` when the compiler finds no declaration target for the selected package;
- `unsupported_context` for unsupported resolution modes or a target outside the selected artifact;
- `malformed_artifact` for invalid package/config metadata or an unsafe compiler result;
- `resource_limit_exceeded` with the exact policy limit;
- `cancelled` for cancellation;
- `analysis_failed` for isolated compiler crash, invalid response, or lifecycle failure.

No complete result may contain an absolute path. Compiler errors and traces are normalized before
crossing the worker boundary.

## Authoritative Semantics

The pinned TypeScript 6 compiler is the resolution oracle. The adapter uses its public compiler API
with an explicit resolution mode and a custom host. It does not reimplement `exports`, `types`,
`typings`, `typesVersions`, extension substitution, `moduleSuffixes`, config inheritance, or
`customConditions` precedence.

Supported first-slice project modes are `node16` and `nodenext`. Bundler, Node10/classic, Yarn Plug'n'
Play, and Bun-specific behavior return `unsupported_context`. Project plugins are never loaded.

The active condition model is:

- exactly one explicit lookup kind, `import` or `require`;
- compiler-owned conditions appropriate to the selected module-resolution mode, including `types`;
- project `customConditions`;
- request custom conditions;
- deterministic deduplication for evidence only—manifest property order still controls conditional
  branch priority inside the compiler.

The compiler result succeeds only when it maps through the logical package entry and canonical
package root to a file present in the supplied `PackageSnapshot`. Redirects through `paths`,
`baseUrl`, `@types`, or another artifact are recorded and returned as `unsupported_context` in v1.

Official sources and the compiler-version decision are retained in
[`../research/typescript-declaration-resolution.md`](../research/typescript-declaration-resolution.md).

## Filesystem And Worker Boundary

Production code never runs compiler resolution in the coordinator process. The minimum worker
boundary is delivered before the resolver is exposed:

```text
coordinator
  -> validates request and exact M1.4 selection
  -> supplies immutable PackageSnapshot bytes
  -> starts bounded compiler child
  -> brokers approved fileExists/readFile/directory/realpath requests
  -> memoizes bytes, topology, and absence for one operation
  -> enforces time, memory, cancellation, and output limits
  -> validates snapshot ID and normalized worker response
```

TypeScript 6 host methods are synchronous. The child therefore uses dedicated framed request and
response pipes for synchronous broker calls while the coordinator services them asynchronously;
compiler output and lifecycle control use separate channels. Frames are length-bounded, schema-
validated, and associated with one operation ID. EOF, malformed frames, unexpected message order,
or a broker timeout fails the operation and terminates the child.

Package paths at the logical `entryPath` and canonical `relativeRoot` map to the same immutable
snapshot bytes; pnpm and workspace links retain explicit realpath mappings. Workspace reads are
limited to project configuration, config inheritance, importer-adjacent package metadata, and other
resolution metadata explicitly admitted by the host policy. The worker receives no ambient
filesystem, environment, network, package-manager, or module-loading capability for the inspected
workspace.

Each broker observation is memoized. Repeated reads return the same bytes or absence. Package bytes
come only from the completed M1.3 snapshot and are never reopened from disk.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Focused resolver tests: `pnpm exec vitest run packages/typescript-resolution/test`
- Focused worker tests: `pnpm exec vitest run packages/worker-typescript/test`
- Static checks: `pnpm check:static`
- Typecheck: `pnpm typecheck`
- Full tests: `pnpm test`
- Integration tests: `pnpm test:integration`
- Build: `pnpm build`
- Full gate: `pnpm check`

## Project Structure

```text
packages/typescript-resolution/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 inward-facing domain exports
│   ├── conditions.ts            lookup/custom-condition normalization
│   ├── config.ts                supported config and inferred-option policy
│   └── resolver.ts              compiler-backed resolution semantics
└── test/
    ├── conditions.test.ts
    └── resolver.test.ts

packages/worker-typescript/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 coordinator-facing worker API
│   ├── protocol.ts              versioned request/response and file-broker messages
│   ├── coordinator.ts           process lifecycle, budgets, cancellation, validation
│   └── child.ts                 compiler child entry and brokered host
└── test/
    ├── protocol.test.ts
    └── coordinator.test.ts
```

The exact package split follows the accepted architecture: `typescript-resolution` owns resolver
semantics, while `worker-typescript` owns process and capability enforcement. Production callers use
the worker boundary. Controlled unit tests may call resolver internals only with inert virtual files.

## Code Style

Use frozen discriminated unions and fixed safe failures:

```ts
type TypeScriptResolutionResult =
  | { readonly ok: true; readonly value: TypeScriptResolution }
  | { readonly ok: false; readonly failure: TypeScriptResolutionFailure };
```

All paths crossing package or process boundaries are normalized virtual POSIX paths. Expected
resolution failures return values rather than throw. Protocol parsers validate unknown data before
use. Trace steps use project-owned codes and bounded relative values, not raw compiler log strings.

## Testing Strategy

- Contract tests prove exactly one TypeScript lookup kind, deterministic condition normalization,
  nullable config paths, and serialized configuration evidence.
- Resolver tests cover conditional `types` branches, `types`/`typings`, `typesVersions` precedence,
  subpaths, extension substitution, module suffixes, inferred config, Node16/NodeNext, and missing
  declarations.
- Project-context tests cover explicit and nearest configs, `jsconfig.json`, contained `extends`,
  custom conditions, unmatched `paths`, and matched external redirects.
- Integration tests cover npm, pnpm, and linked-workspace logical/real paths and deliberate
  Node-runtime/TypeScript-declaration divergence.
- Worker tests cover broker containment, immutable repeated reads, missing-path memoization,
  timeout, cancellation, crash, invalid output, snapshot mismatch, and sanitized errors.
- Every unsafe or unsupported case has a nearby positive control; execution sentinels prove no
  inspected package or project dependency code runs.

## Boundaries

- Always: use the exact selected package and immutable snapshot; record compiler version, config,
  mode, lookup kind, conditions, trace, and usage; broker and memoize workspace reads; normalize
  results back to package-relative paths; preserve runtime and declaration answers independently.
- Ask first: changing the material gates below, broadening compiler modes, representing multiple
  artifacts, loading workspace compilers/plugins, or raising resource-policy limits.
- Never: download as fallback, run a package manager, import the workspace compiler, execute package
  code, let the child read the ambient filesystem, trust raw worker output, or report a redirected
  external file as part of the selected package snapshot.

## Delivery Tasks

- [x] Approve the compiler, sequencing, contract, and single-artifact gates.
  - Acceptance: this spec moves from Proposed to Approved and canonical plans agree.
  - Verify: documentation review and `pnpm check:static`.
- [x] Correct the v1 TypeScript request/result contract and fixtures.
  - Acceptance: one lookup kind is enforced; conditions/mode are serialized; no-config is valid.
  - Verify: focused contracts tests and golden examples.
- [x] Establish the minimum versioned compiler worker and brokered filesystem.
  - Acceptance: the child has no ambient workspace authority and all ADR 0004 lifecycle failures
    normalize safely.
  - Verify: protocol, containment, cancellation, timeout, crash, and mismatch tests.
- [x] Implement compiler-backed declaration resolution against the immutable package snapshot.
  - Acceptance: official TypeScript semantics select one package-relative declaration or a typed
    failure without executing project code.
  - Verify: focused resolver tests.
- [x] Expand npm, pnpm, linked-workspace, config, and divergence fixtures.
  - Acceptance: M1.6 acceptance criteria and applicable RES/DECL/RUN matrix IDs are executable.
  - Verify: integration tests and no-execution sentinels.
- [ ] Reconcile canonical docs, independently review, and deliver.
  - Acceptance: architecture, security model, implementation plan, fixture matrix, and handoff are
    current; local and CI gates pass.
  - Verify: `pnpm check`, `pnpm test:integration`, `pnpm build`, and `git diff --check`.

## Success Criteria

- npm, pnpm, and linked-workspace packages resolve expected declaration targets under explicit
  import and require contexts.
- Conditional type branches, package fields, `typesVersions`, modern Node resolution modes, project
  config, custom conditions, and relevant path behavior are fixture-backed.
- Runtime/declaration divergence produces two independent authoritative answers with evidence.
- The exact analysis compiler version and effective config/mode/conditions are serialized.
- Redirects outside the selected artifact, unsupported modes, malformed inputs, missing targets,
  cancellation, and resource limits are typed and explainable.
- No inspected package code executes, no dependency is downloaded, and the compiler child has no
  unbrokered workspace filesystem access.
- Full repository checks and Linux CI pass.

## Approval Gates

Approved by the project owner on 2026-08-14.

1. Use a Package Spelunker-pinned TypeScript 6 compiler rather than workspace code or the unstable
   TypeScript 7 API.
2. Bring the minimum M1.8 isolation boundary forward into the M1.6 delivery sequence.
3. Tighten/extend the unreleased v1 contract as described above.
4. Keep v1 declaration success single-artifact; surface outside-artifact redirects as unsupported.

These gates now govern implementation and require a new explicit decision to change.
