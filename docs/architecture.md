# Architecture

## Decision Summary

Package Spelunker is a standalone TypeScript monorepo. The semantic engine is a normal library; the
CLI and MCP server are thin adapters. All analysis is anchored to immutable package snapshots and
normalized evidence. Existing ecosystem tools are integrated behind capability-specific providers
rather than becoming the system's data model.

See ADRs `0001` and `0002` for the foundational decisions.

## Current Implementation Status

This document describes the target architecture, not completed behavior. As of 2026-08-14, the
repository contains root tooling, CI, canonical documentation, and empty `apps/`, `packages/`, and
`fixtures/` ownership areas. No domain package, application, resolver, snapshot builder, provider,
fixture, or test has been implemented.

The active build order and acceptance gates are maintained in
[`implementation-plan.md`](implementation-plan.md). This architecture remains the contract that the
implementation plan must satisfy.

## System Boundaries

```text
apps/cli ─────────┐
                  ├── investigation application service
apps/mcp-server ──┘             │
                                ├── workspace model
                                ├── Node and TypeScript resolution
                                ├── package snapshot and evidence stores
                                ├── TypeScript symbol graph
                                ├── semantic API diff and local usage index
                                └── provider coordinator
                                     ├── in-process safe libraries
                                     ├── isolated workers
                                     └── optional remote providers
```

Transport packages may parse, validate, invoke, cancel, map errors, and present results. They may
not own resolution, snapshot, symbol, diff, provider, or security policy.

## Planned Monorepo Packages

```text
apps/
├── cli
└── mcp-server

packages/
├── contracts
├── core
├── workspace-model
├── package-snapshot
├── node-resolution
├── typescript-resolution
├── typescript-symbols
├── worker-typescript
├── api-diff
├── local-usage-index
├── evidence
├── provider-pacote
├── provider-publint
├── worker-attw
└── test-fixtures
```

Names are provisional. Create a package only when its contract and dependency direction justify the
boundary; do not create empty abstractions merely to match this diagram.

## First Vertical Slice

The first slice implements installed-package investigation through the CLI only. It deliberately
starts with the smallest package set that enforces meaningful boundaries:

| Package | Owns in the first slice | Does not own |
| --- | --- | --- |
| `contracts` | versioned requests, results, errors, snapshots, evidence, traces, limits, and public API shapes | filesystem access, compiler objects, CLI formatting |
| `package-snapshot` | approved-root containment, bounded artifact reads, manifest normalization, content identity | workspace selection, runtime or type resolution |
| `workspace-model` | workspace/importer/package-manager context and exact installed package selection | export-map or TypeScript target semantics |
| `node-resolution` | Node runtime target and structured selection trace | TypeScript declaration selection or code execution |
| `typescript-resolution` | project-aware declaration target and compiler resolution trace | public symbol presentation |
| `typescript-symbols` | compiler-backed public symbol graph and normalized source evidence | semantic version classification or local usage impact |
| `worker-typescript` | child-process protocol, compiler memory/time limits, cancellation, termination, and response validation | resolver or symbol semantics |
| `core` | workflow coordination, cancellation, limit application, evidence assembly, and partial-failure policy | transport parsing or presentation |
| `apps/cli` | argument validation, lifecycle, exit mapping, and human/JSON presentation | domain analysis |

Evidence types begin in `contracts`; evidence assembly belongs in `core` and snapshot construction.
Create a separate `evidence` package only when persistence, pagination, or cross-workflow reuse gives
it an independent contract. Likewise, provider, diff, usage-index, and MCP packages are not created
until their roadmap milestone enters scope.

### First-slice dependency graph

```text
apps/cli
  -> core
       -> workspace-model
       -> package-snapshot
       -> node-resolution
       -> worker-typescript
            -> typescript-resolution
            -> typescript-symbols

all packages -> contracts
typescript-symbols -> typescript-resolution contract outputs
engines do not depend on core, apps, or third-party provider adapters
```

Cycles between engines are prohibited. When two engines need the same value, move the narrow value
contract inward rather than adding a reverse dependency.

## Dependency Direction

1. `contracts` defines stable domain types and errors without transport or provider dependencies.
2. Pure engines depend on contracts and narrow platform abstractions.
3. Snapshot and evidence orchestration composes engines and stores.
4. Provider adapters translate external libraries into normalized contracts.
5. `core` composes capabilities into investigation workflows.
6. CLI, MCP, and workers depend inward on contracts/core; core never depends on a transport.

Provider output types and third-party library objects must not leak into public domain contracts.

## Investigation Lifecycle

An installed investigation advances through explicit stages:

```text
request validated
  -> approved context discovered
  -> installed package selected
  -> immutable snapshot constructed
  -> runtime target resolved
  -> declaration target resolved
  -> public API modeled
  -> evidence-bound report assembled
```

Each stage consumes immutable outputs from the previous stage and returns either a typed result or a
typed failure with safe, bounded evidence. Later-stage failure may yield a partial report, but it
must not rewrite a prior authoritative fact. For example, a compiler graph limit does not invalidate
the already established package identity, and a TypeScript resolution discrepancy does not change
the separately selected Node runtime target.

The first-slice application service should expose one primary operation conceptually equivalent to:

```ts
interface InvestigationService {
  inspectInstalledPackage(
    request: InspectInstalledPackageRequest,
    options: { signal?: AbortSignal },
  ): Promise<InvestigationResult>;
}
```

The exact names and schema representation are decided before implementation. The important boundary
is one coherent workflow with versioned domain input/output; the CLI must not orchestrate individual
engines itself.

## Execution and Data Policy

- Installed inspection is local and network-free by default.
- Package files are read statically through bounded, containment-aware abstractions.
- The TypeScript compiler may parse and analyze declarations but may not load package runtime code.
  Compiler-backed resolution and public API modeling run in a terminable child process under ADR
  [0004](decisions/0004-first-slice-resource-policy.md); a custom compiler host applies the same
  containment and read budgets as the main process.
- In-memory immutable results are sufficient for the first slice; persistent caches are deferred
  until cache permissions, eviction, and redaction receive an accepted decision.
- Absolute local paths may appear only when needed as local evidence and allowed by the selected
  presentation policy. Serialized output must support deterministic path normalization or redaction.
- Cancellation and resource limits enter at the application boundary and are propagated through
  every traversal and compiler operation that can honor them.

## Canonical Package Snapshot

Every analyzer receives the same immutable artifact identity:

```ts
interface PackageSnapshot {
  id: string;
  identity: {
    name: string;
    version: string;
    source: "installed" | "workspace" | "registry";
  };
  artifact: {
    root?: string;
    tarballPath?: string;
    tarballIntegrity?: string;
    contentHash: string;
  };
  context?: {
    workspaceRoot: string;
    importer: string;
    requestedSpecifier: string;
    tsconfigPath?: string;
    conditions: string[];
  };
  manifest: NormalizedPackageManifest;
}
```

Snapshot identity prevents one provider inspecting the installed package while another silently
uses `latest`, a source default branch, or different fetched bytes.

## Evidence and Authority

Every result records provider identity/version, snapshot identity, evidence, warnings, generation
time, limits, and one authority class:

- `authoritative`: exact artifact, manifest, resolver, or compiler fact
- `diagnostic`: specialist interpretation such as `publint` or ATTW
- `enrichment`: version-matched documentation or ecosystem context
- `heuristic`: syntax, popularity, inferred health, or incomplete matching

Default evidence preference:

1. Exact installed artifact selected in the user's workspace.
2. Exact verified registry tarball for the selected version.
3. Node or TypeScript resolver output under the explicit importer context.
4. Exact registry metadata.
5. Version-matched documentation.
6. Source repository tag.
7. Source repository default branch.
8. Heuristic or ecosystem-derived information.

For public API shape, the declaration selected by the project's TypeScript resolution is more
authoritative than a general publication diagnostic.

## Custom Engines

### Workspace model

Discover workspace root and packages, package manager, lockfile context, dependency relationships,
overrides, resolutions, patches, workspace protocols, pnpm catalogs, `tsconfig` references, and
configuration that materially affects resolution.

### Importer-specific resolution

Resolve from the exact importer, installed package instance, active workspace package, Node/TS
module mode, active conditions, `tsconfig`, pnpm symlink graph, aliases, and project references.
Package-isolation diagnostics do not replace this answer.

### TypeScript symbol exploration

Use the TypeScript compiler or Language Service to model aliases, re-export chains, merged
declarations, type/value exports, members, inheritance, overloads, generics, call/construct
signatures, JSDoc, deprecations, and declaration locations.

### Semantic API diff

Normalize symbols into stable identities and classify entrypoint, symbol, signature, parameter,
return type, member, generic constraint, runtime requirement, and documentation changes as
breaking, potentially breaking, additive, documentation-only, or unclassified.

### Local usage impact

Relate changed symbols and signatures to imports, call sites, construction, property access, type
references, and configuration in the actual workspace. Report affected and explicitly unaffected
usages with source evidence.

## Provider Strategy

Preferred integration order:

1. Stable programmatic library.
2. Stable HTTP or SDK integration.
3. Isolated worker around a programmatic library.
4. External MCP provider.
5. CLI subprocess only as a last resort.

| Capability | Candidate | Integration | Role |
| --- | --- | --- | --- |
| Registry artifact | `pacote` | in-process behind registry-only adapter | metadata, exact manifest, tarball, integrity, cache |
| Workspace discovery | `@manypkg/get-packages` | in-process | workspace root and packages |
| Package manager | `package-manager-detector` | in-process | package manager and lockfile context |
| Publication lint | `publint` | supplied files/tarball; worker if needed | diagnostics, never automatic packing |
| Type publication | `@arethetypeswrong/core` | isolated bounded worker | TS/module publication diagnostics |
| Formal API reports | API Extractor | optional later worker | reviewable API reports and secondary diff evidence |
| Documentation | Context7 SDK/API | optional remote enrichment | examples, migrations, and configuration guidance |
| Package health | npm Sentinel-compatible provider | optional external provider | ecosystem, maintenance, adoption, vulnerability context |
| Export comparison | `resolve.exports` | test oracle only | disagreement fixtures, not sole authority |

`ts-docs-mcp` is reference material for interaction and caching ideas, not the semantic parser.

## Example Upgrade Flow

```text
discover workspace and package manager
  → resolve installed package from importer
  → create installed immutable snapshot
  → retrieve and verify exact target registry version
  → create target immutable snapshot
  → run bounded diagnostics against the same bytes
  → build compiler-backed public API models
  → compare manifests, entry points, APIs, and requirements
  → find local usage impact
  → optionally add version-matched docs and health context
  → normalize one report with evidence and uncertainty
```

## Contract Versioning

Snapshot, evidence, public symbol, API change, CLI JSON, and MCP tool schemas are compatibility
surfaces. Before publishing them, define stable discriminants and schema versions, maintain fixture
goldens, and document migration policy. Human-readable text is presentation; machine-readable JSON
must not be parsed from prose.
