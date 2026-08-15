# Research: TypeScript Declaration Resolution

- Captured: 2026-08-14
- Status: Decision-ready; implementation requires approval of the material gates below
- Scope: M1.6 declaration-target resolution and the minimum compiler-isolation dependency it needs

## Question

How should Package Spelunker resolve the TypeScript declaration selected for one exact installed or
workspace package, importer, and project configuration without executing project dependencies,
reading outside the approved workspace, or coupling the product to a short-lived compiler API?

## Recommendation

Use the installed package selected by M1.4 and captured by M1.3 as the authoritative artifact, but
run resolution with a Package Spelunker-owned, exactly pinned TypeScript 6 compiler in the accepted
ADR 0004 child-process boundary. Do not import the workspace's `typescript` package and do not build
against TypeScript 7's `typescript/unstable/*` API.

Bring the minimum M1.8 worker and brokered-filesystem work forward into the M1.6 delivery sequence.
The compiler child receives no ambient workspace filesystem authority. Package probes are served
from the immutable `PackageSnapshot`; project-configuration probes are served on demand by the
coordinator through a containment-aware, budgeted, memoizing broker. Once a path or directory has
been observed, its bytes or absence are fixed for the operation and contribute to a context hash.

Keep the first result package-bound. A compiler result must normalize back to the selected package
snapshot. A matching `paths` alias, `@types` fallback, or other project redirect outside that
artifact is important evidence, but the current single-artifact v1 result cannot represent it as a
successful package-relative target. Return a typed `unsupported_context` result with bounded trace
evidence instead of silently switching artifacts.

## Evidence

### Confirmed facts

- TypeScript 7.0 is the new native compiler. Its package root exposes version information rather
  than the traditional compiler API; the installed 7.0.2 package exposes current programmatic APIs
  under `typescript/unstable/*`.
- The TypeScript team states that 7.0 does not yet expose a stable programmatic API, expects 7.1 to
  ship a new and different API, and recommends TypeScript 6 for tools that need programmatic compiler
  access. Source: [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
- Microsoft's `@typescript/typescript6` compatibility package re-exports the TypeScript 6 API and
  provides a distinct `tsc6` command for side-by-side use. Source:
  [`@typescript/typescript6`](https://www.npmjs.com/package/@typescript/typescript6).
- TypeScript's official compiler-API guidance supports a custom `CompilerHost` and
  `resolveModuleName`, which lets a tool provide its own file-existence and read capabilities.
  Source: [Using the Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API).
- In `node16`, `nodenext`, and `bundler` modes, TypeScript reads package `exports`, always considers
  `types` and `default`, chooses `import` or `require` according to resolution context, and applies
  additional custom conditions. It does not apply `typesVersions` when `exports` is used. Source:
  [TypeScript module resolution reference](https://www.typescriptlang.org/docs/handbook/modules/reference).
- `customConditions` adds caller/project conditions to the resolver's built-in conditions and is
  valid only for modern Node/bundler resolution modes. Source:
  [TSConfig `customConditions`](https://www.typescriptlang.org/tsconfig/customConditions.html).
- `resolvePackageJsonExports` defaults to true for `node16`, `nodenext`, and `bundler`. Source:
  [TSConfig `resolvePackageJsonExports`](https://www.typescriptlang.org/tsconfig/resolvePackageJsonExports.html).
- ADR 0004 already requires compiler-backed TypeScript resolution to run in a terminable child
  process with a containment-aware, budgeted file host. The current implementation plan places the
  general isolation task after M1.6 and M1.7, so the task order does not currently satisfy that
  accepted decision.
- The current public v1 TypeScript success shape records `target`, `compilerVersion`, and a required
  `tsconfigPath`. It does not serialize active conditions or module-resolution mode, and it cannot
  represent a valid inferred/no-config JavaScript project.

### Inferences

- Loading a workspace-selected compiler would execute code from the same untrusted dependency tree
  the product is inspecting. Static discovery of that package's version is safe; importing it is
  outside the security model.
- Adopting `typescript/unstable/*` now would make a temporary upstream API part of our implementation
  at the moment upstream has announced an incompatible replacement. A pinned TypeScript 6 adapter
  is the lower-risk first-slice baseline.
- A compiler process with direct access to the live workspace would reintroduce time-of-check/time-
  of-use drift and broaden its authority beyond the selected snapshot. A brokered, memoized file
  capability preserves local-first behavior while keeping reads bounded and reviewable.
- A `paths` or `@types` redirect can point at a different artifact. Reporting that file as though it
  belonged to the selected package would break snapshot identity and evidence authority.

## Options Considered

| Option | Benefits | Costs and risks | Decision |
| --- | --- | --- | --- |
| TypeScript 7 `unstable/sync` | Matches the root build compiler; native performance | API explicitly temporary; API client spawns a native server; filesystem fallback must be perfectly blocked | Reject for the durable first-slice adapter |
| Workspace-local compiler | Closest to the user's configured version | Imports and executes an untrusted project dependency; version/API matrix becomes open-ended | Reject under the security model |
| Hand-written TypeScript resolver | Snapshot-only and dependency-free | Likely semantic drift across exports, `typesVersions`, modes, suffixes, and config behavior; cannot claim compiler authority | Reject as the authoritative answer |
| Pinned TypeScript 6 compiler in a child process | Official programmatic surface; custom host; deterministic reported version; compatible with M1.7 | Adds a dedicated compiler dependency and requires the worker boundary earlier | Recommend |
| Shell out to `tsc --traceResolution` | Uses an official executable | Text parsing is unstable; difficult virtual filesystem and structured trace control; unnecessary project-wide work | Reject |

## Proposed First-Slice Boundary

### Compiler selection

- Pin the Package Spelunker analysis compiler to `@typescript/typescript6@6.0.2` exactly. Revalidate
  and change that version only through an intentional dependency/semantic update.
- Keep the root TypeScript 7 build tool independent from the compatibility package, which is owned
  only by the compiler worker.
- Record the exact analysis compiler version in every successful result and failure evidence.
- Statically detect a workspace compiler version only for a future mismatch warning; never import
  it. This warning is not required to complete M1.6.

### Resolution inputs

- Exact M1.4 selection, including logical `entryPath`, canonical `relativeRoot`, importer, package
  manager, and selected source.
- Exact immutable M1.3 `PackageSnapshot`.
- Explicit TypeScript lookup kind: exactly one of `import` or `require`.
- Nearest or explicitly supplied `tsconfig.json`/`jsconfig.json`, or a documented inferred config.
- Workspace-contained configuration inheritance and importer-adjacent package metadata admitted
  through the broker; compiler plugins are data only and are never loaded.
- Request custom conditions plus project `customConditions`. Exact built-ins such as `types`,
  `default`, `node`, `import`, and `require` are normalized by the adapter instead of being passed as
  custom conditions; other names remain explicit compiler input.

### Supported semantics

- `node16` and `nodenext` resolution in the first slice.
- Package `exports` type branches, `types`/`typings`, extension substitution, `typesVersions` when
  applicable, `moduleSuffixes`, package subpaths, and package-relative declaration targets.
- npm, pnpm, and linked-workspace logical-to-canonical package mapping.
- Relative or package-based config inheritance when every read is approved and budgeted.
- Recognition of `paths`/`baseUrl`: normal package lookup proceeds when no mapping matches; a
  matching redirect outside the selected snapshot returns `unsupported_context` with trace.

### Explicitly unsupported in M1.6

- Bundler, Yarn Plug'n'Play, Bun-specific resolution, TypeScript plugins, arbitrary compiler
  binaries, remote files, registry fallback, and runtime loader hooks.
- Successful targets supplied by a second artifact such as `@types/*` or a workspace `paths` alias;
  these require a future multi-artifact result contract.
- Public symbol traversal and type checking, which remain M1.7 work.

## Material Approval Gates

1. **Compiler trust:** use a Package Spelunker-pinned TypeScript 6 analysis compiler, not the
   workspace compiler or TypeScript 7's unstable API.
2. **Task sequence:** deliver the minimum M1.8 child-process/filesystem broker as a prerequisite
   within the M1.6 workstream, then reuse it for M1.7.
3. **Contract correction:** require one TypeScript `import | require` lookup kind; add serialized
   conditions and module-resolution mode; allow `tsconfigPath: null` for inferred/no-config JS.
4. **Single-artifact result:** treat `paths`, `@types`, and other redirects outside the selected
   snapshot as explainable unsupported contexts until a multi-artifact contract is designed.

## Revalidation Triggers

- TypeScript 7.1 publishes a stable programmatic API.
- The project chooses exact workspace-compiler emulation as a product requirement.
- The result contract gains multi-artifact provenance.
- Bundler/Yarn/Bun resolution enters the supported first slice.
