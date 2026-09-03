# Architecture

## Decision Summary

Package Spelunker is a standalone TypeScript monorepo and an organizer-first repository-intelligence
engine. The semantic/retrieval engine is a normal library; CLI and MCP remain thin adapters. All
analysis is anchored to explicit workspace/package snapshots and normalized evidence. Existing
ecosystem tools perform bulk workspace, graph, symbol, API, documentation, search, and build
analysis behind capability-specific providers rather than becoming system data model.

Package Spelunker owns canonical identity, normalized entities/edges, authority, cross-provider
linking, conflict handling, candidate fusion, bounded graph expansion, context planning, and
versioned workflow contracts. Retrieval finds candidates; compiler/resolver/snapshot facts establish
meaning. See ADRs `0001` through `0006` for foundational decisions.

## Current Implementation Status

This document primarily describes target architecture. As of 2026-09-01, executable
`packages/contracts` boundary implements version 1 installed-package request/result schemas,
schema-derived types, normalized runtime validation, and first-slice limit vocabulary.
`packages/test-fixtures` implements deterministic workspace layouts and initial security-boundary
pairs. `packages/package-snapshot` implements approved-root containment, bounded reads, normalized
manifest metadata, and immutable installed/workspace artifact identity. `packages/workspace-model`
implements safe package-specifier parsing, explicit importer/workspace discovery, npm/pnpm context,
and exact installed or linked package selection. `packages/node-resolution` implements snapshot-only
Node 22 export-map and legacy runtime target selection under explicit conditions, with bounded
traces and fixed failures. `packages/typescript-resolution` implements compiler-backed declaration
target selection under importer-specific TypeScript context. `packages/worker-typescript` runs that
compiler work in a bounded, terminable child over a brokered virtual filesystem.
`packages/typescript-symbols` implements deterministic public API modeling with TypeDoc over an
explicit virtual host and contained TypeScript program configured from normalized M1.6 project
options and conditions; its worker operation, application
composition, workspace indexing, retrieval providers, and app packages remain planned.

The active build order and acceptance gates are maintained in
[`implementation-plan.md`](implementation-plan.md). This architecture remains the contract that the
implementation plan must satisfy.

## System Boundaries

```text
apps/cli ─────────┐
                  ├── application service
apps/mcp-server ──┘        │
                           ├── snapshot and evidence coordination
                           ├── workspace/package/compiler truth
                           ├── normalized semantic graph
                           ├── persistent lexical/optional vector retrieval
                           ├── candidate fusion and context planner
                           └── provider coordinator
                                ├── in-process safe libraries
                                ├── isolated static analyzers
                                ├── trusted-workspace opt-in analyzers
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
├── workspace-snapshot
├── semantic-graph
├── repository-index
├── retrieval
├── context-planner
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

The logical domains do not require one package each. Begin repository intelligence with the fewest
packages that enforce public contracts, storage ownership, provider isolation, or dependency
direction. Split only after behavior proves an independent boundary.

## Alpha Installed-Package Slice

The alpha slice implements installed-package investigation through one primary MCP tool and a
secondary CLI. It deliberately starts with the smallest package set that enforces meaningful
boundaries:

| Package | Owns in the first slice | Does not own |
| --- | --- | --- |
| `contracts` | versioned requests, results, errors, snapshots, evidence, traces, limits, and public API shapes | filesystem access, compiler objects, CLI formatting |
| `package-snapshot` | approved-root containment, bounded artifact reads, manifest normalization, content identity | workspace selection, runtime or type resolution |
| `workspace-model` | workspace/importer/package-manager context and exact installed package selection | export-map or TypeScript target semantics |
| `node-resolution` | Node runtime target and structured selection trace | TypeScript declaration selection or code execution |
| `typescript-resolution` | project-aware declaration target and compiler resolution trace | public symbol presentation |
| `typescript-symbols` | TypeDoc-backed public symbol graph plus normalized source evidence over a contained TypeScript program | semantic version classification or local usage impact |
| `worker-typescript` | child-process protocol, compiler memory/time limits, cancellation, termination, and response validation | resolver or symbol semantics |
| `core` | workflow coordination, cancellation, limit application, evidence assembly, and partial-failure policy | transport parsing or presentation |
| `apps/cli` | argument validation, lifecycle, exit mapping, and human/JSON presentation | domain analysis |
| `apps/mcp-server` | MCP lifecycle, authorization-root validation, cancellation, capabilities, bounded result delivery, and evidence pagination | domain analysis or low-level engine orchestration |

Evidence types begin in `contracts`; evidence assembly belongs in `core` and snapshot construction.
Create a separate `evidence` package only when persistence, pagination, or cross-workflow reuse gives
it an independent contract. The narrow alpha MCP adapter is created only after the core installed
workflow is stable; expanded MCP workflows, provider, diff, and usage-index packages remain deferred
until their roadmap milestones enter scope.

### First-slice dependency graph

```text
apps/cli ────────┐
                 ├-> core
apps/mcp-server ─┘
                    -> workspace-model
                         -> package-snapshot containment/read capabilities
                    -> package-snapshot
                    -> node-resolution
                         -> package-snapshot immutable bytes and manifest identity
                    -> worker-typescript
                         -> typescript-resolution
                         -> typescript-symbols

all packages -> contracts
typescript-symbols -> typescript-resolution contract outputs
engines do not depend on core, apps, or third-party provider adapters
```

`workspace-model` uses only the narrow containment, bounded-file, and manifest capabilities owned by
`package-snapshot`; it does not construct snapshots or reverse the engine direction. `core` remains
responsible for handing the selected root and normalized context into snapshot construction.
`node-resolution` then consumes only that completed snapshot; it has no live filesystem authority.

Cycles between engines are prohibited. When two engines need the same value, move the narrow value
contract inward rather than adding a reverse dependency.

## Repository Intelligence Expansion

### Snapshot model

Package and workspace state have different identity rules:

```text
WorkspaceSnapshot
  ├── repository + Git HEAD + dirty overlay identity
  ├── admitted roots and exclusions
  ├── workspace packages
  ├── build-system projects
  ├── TypeScript/JavaScript projects
  └── depends-on ──> PackageSnapshot

PackageSnapshot
  ├── exact artifact bytes and content hash
  ├── package name/version/source
  ├── export/runtime/declaration surface
  └── importer/resolver context
```

`WorkspaceSnapshot` is not a generalized package snapshot. It records repository state, project and
compiler contexts, provider inputs, and dirty overlay. `PackageSnapshot` retains exact artifact and
importer semantics. Typed semantic edges link them.

### Canonical semantic model

First repository-intelligence contracts normalize only entities required by a complete context
workflow:

```text
workspace          workspace-package    project
typescript-project file                 module
symbol             test                 configuration
package            package-entrypoint   external-symbol
```

Initial relations are:

```text
contains       imports       exports        reexports
resolves-to    defines       references     calls
implements     extends       constructs     tested-by
depends-on     configured-by
```

Every entity and edge records stable project identity, snapshot identity, provider observation,
authority, evidence, normalization version, and warnings. Provider-local IDs and objects remain
internal. A fact may have multiple observations; disagreement is retained instead of overwritten.

Workspace package, Nx project, TypeScript project, module, and installed package are distinct
entities. Many may map to same path, but path equality alone does not collapse their semantics.

### Index and retrieval lifecycle

```text
approved root
  -> workspace snapshot
  -> provider observations
  -> normalized entities, edges, and semantic documents
  -> SQLite facts/evidence + FTS5
  -> lexical candidates
  -> optional semantic/CCE candidates
  -> canonical linking and deduplication
  -> authority-aware score fusion
  -> bounded graph/compiler/package expansion
  -> token-budgeted ContextPack
```

SQLite is canonical local persistence for snapshot metadata, facts, evidence, provider runs,
semantic documents, and FTS5. Graphology loads bounded subgraphs for traversal and ranking; it is not
the persistence contract. Vector columns/search remain optional until evaluation proves benefit.

Index updates are transactional and snapshot-scoped. A failed update leaves previous complete
snapshot readable. Provider, schema, normalizer, embedding, and exclusion versions participate in
index/cache identity. Clean rebuild and incremental update must produce equivalent logical facts.

### Context planner

The context planner is product-owned. It accepts task, optional focus, capability flags, and explicit
budget. It merges retrieval and exact semantic candidates, adds required contracts/tests/config and
package context, suppresses redundancy, and returns primary/supporting items, relationships,
unknowns, warnings, evidence, and budget accounting.

Selection remains deterministic and inspectable before learned reranking. Each included item carries
selection reasons; rejected/truncated counts remain visible. Final natural-language answer generation
belongs to the consuming agent, not the authoritative core.

### Provider execution modes

Providers declare one mode:

- `safe-static`: consumes admitted bytes or bounded file lists without executing project/package
  code or configuration;
- `isolated-static`: subprocess/worker with fixed protocol, empty/minimal environment, approved
  filesystem capabilities, and time/memory/output limits;
- `trusted-workspace`: explicit opt-in for tools such as Nx/Knip that may load workspace plugins or
  executable configuration;
- `remote-enrichment`: explicit network capability whose output cannot override local facts.

Safe mode never silently promotes a trusted-workspace provider. Missing provider capability yields
partial evidence and named unknowns.

## Dependency Direction

1. `contracts` defines stable domain types and errors without transport or provider dependencies.
2. Pure engines depend on contracts and narrow platform abstractions.
3. Snapshot, evidence, semantic graph, and repository index capabilities depend inward on contracts.
4. Provider adapters translate external libraries into normalized observations.
5. Retrieval and context planning consume normalized stores/engines, never provider objects.
6. `core` composes capabilities into investigation workflows.
7. CLI, MCP, and workers depend inward on contracts/core; core never depends on a transport.

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
is one coherent workflow with versioned domain input/output; neither transport may orchestrate
individual engines itself.

## Execution and Data Policy

- Installed inspection is local and network-free by default.
- Package files are read statically through bounded, containment-aware abstractions.
- The TypeScript compiler may parse and analyze declarations but may not load package runtime code.
  Compiler-backed resolution and public API modeling run in a terminable child process under ADR
  [0004](decisions/0004-first-slice-resource-policy.md); a custom compiler host applies the same
  containment and read budgets as the main process. Public API authority additionally rejects
  reachable declarations across nested `package.json` or `node_modules` ownership boundaries even
  when those bytes are physically stored below the selected package root.
- In-memory immutable results remain sufficient for installed-package Alpha 1. Repository indexing
  uses a local SQLite store only after cache location, permissions, retention, recovery, exclusion,
  and redaction policy receive an accepted decision.
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

The implemented first-slice installed/workspace snapshot stores bounded file bytes in memory,
records regular-file, directory, and contained file-symlink topology, and returns defensive byte
copies to analyzers. Its artifact hash excludes machine-specific absolute roots; its snapshot ID
binds that content hash to package identity, source, and normalized importer context. Registry
tarball fields in the target interface remain deferred to Milestone 2.

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

The implemented first slice accepts an explicit root and importer, supports npm lockfile/workspace
arrays and pnpm lockfile/workspace files, records workspace-relative configuration evidence, and
selects the importer-nearest installed package entry. Rich lockfile semantics, overrides, patches,
catalogs, Yarn, and Bun remain later extensions; unsupported or ambiguous contexts are not guessed.

### Importer-specific resolution

Resolve from the exact importer, installed package instance, active workspace package, Node/TS
module mode, active conditions, `tsconfig`, pnpm symlink graph, aliases, and project references.
Package-isolation diagnostics do not replace this answer.

The implemented Node 22 first slice treats `import` and `require` as lookup conditions rather than
target-format labels. It supports main export sugar, exact/pattern subpaths, ordered and nested
conditions, arrays, `null` exclusions, exports-absent legacy lookup, and `.js`/`.mjs`/`.cjs` module
classification. Conditional key order comes from raw retained manifest bytes; target existence
comes only from the immutable snapshot.

The implemented TypeScript first slice keeps declaration selection separate from runtime
resolution. A pinned TypeScript 6 compiler supports Node16/NodeNext config, conditional type
branches, `typesVersions`, module suffixes, and custom conditions through a virtual host. Production
calls run in a terminable child; the coordinator maps logical and canonical package paths to the
same immutable snapshot, admits bounded contained project metadata, memoizes observations, and
validates the snapshot identity, project-context hash, and normalized result.

### TypeScript symbol exploration

Use TypeDoc reflections over the contained pinned TypeScript program to model declarations,
members, inheritance, overloads, generics, call/construct signatures, JSDoc, deprecations, and
locations. Keep direct compiler use for authoritative exports, alias/re-export provenance,
containment, diagnostics, and bounded gap handling. Recursive namespace exports remain full public
symbols with parent-derived stable IDs; normalized public API shapes are owned by `contracts`, not
duplicated in provider packages. Locations distinguish selected-package authority from explicitly
admitted compiler-library authority; paths remain relative to the named authority root.

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
2. Isolated worker/process around a programmatic library.
3. Stable HTTP or SDK integration.
4. External MCP provider.
5. CLI subprocess only as a last resort.

| Capability | Selected direction | Integration | Authority/role |
| --- | --- | --- | --- |
| Workspace packages | `@manypkg/get-packages` | safe adapter after workspace-pattern validation plus containment checks | structural observation |
| Nx topology | `@nx/devkit` | isolated trusted-workspace provider, daemon disabled | framework project observation |
| npm dependency tree | `@npmcli/arborist` | read-only bounded adapter | package-tree observation |
| Module graph | dependency-cruiser | isolated static adapter with explicit safe options | structural source observation |
| Framework entrypoints | Knip | optional isolated reporter/provider | framework-aware heuristic/diagnostic |
| Bulk symbols/references | SCIP/`scip-typescript` | compatibility spike, then isolated streaming adapter | compiler-backed observation |
| Exact TS semantics | pinned TypeScript and existing worker | brokered bounded process | authoritative compiler fact |
| Public API/docs | TypeDoc primary; API Extractor optional | contained program adapter; optional isolated report provider | normalized API model plus secondary report evidence |
| Framework patterns | ast-grep | admitted bytes/bounded file lists | heuristic until compiler-confirmed |
| Build graph | existing esbuild metafile | JSON ingestion; no implicit build/config execution | build observation |
| Facts and lexical search | SQLite/`better-sqlite3`/FTS5 | local storage worker | project-owned persistence/retrieval |
| Graph algorithms | Graphology | bounded in-memory subgraph | traversal/ranking implementation |
| Embeddings/vectors | Transformers.js plus `sqlite-vec` | deferred optional providers | semantic candidate generation |
| Generic retrieval | CCE | optional provider | fuzzy candidate generation |
| MCP transport | `@modelcontextprotocol/server` v2 | thin app adapter | transport only |
| Registry/diagnostics | `pacote`, `publint`, ATTW | existing planned restricted adapters | exact artifact plus labeled diagnostics |

Current adoption status, restrictions, rejected alternatives, evaluation gates, and primary sources
are maintained in
[`research/repository-intelligence-provider-stack.md`](research/repository-intelligence-provider-stack.md).
Provider dependencies are added only when their implementation slice begins and its spike passes.

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

ADR [0003](decisions/0003-versioned-contract-envelopes.md) defines JSON Schema Draft 2020-12 as the
canonical serialized representation. Each workflow has a closed, major-versioned schema and stable
discriminants; installed-package investigation begins at schema version `"1"`. Core TypeScript
types and runtime validators must be derived from, generated from, or mechanically checked against
that schema rather than maintained as an independent wire model.

Snapshot, evidence, semantic entity/edge, context pack, public symbol, API change, CLI JSON, and MCP
tool schemas are compatibility surfaces. Installed-package v1 remains unchanged; workspace indexing
and `ContextPack` begin as separate v1 workflows. Maintain golden success, partial, and failure
fixtures and follow ADR 0003 for migration. Human-readable text is presentation; machine-readable
JSON must not be parsed from prose.
