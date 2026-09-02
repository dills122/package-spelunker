# Repository Intelligence Implementation Plan

- Status: Active planning; implementation begins with contracts and provider spikes
- Updated: 2026-09-01
- Current boundary: finish installed-package composition while proving workspace-RAG providers
- Target outcome: one evidence-backed, budgeted `ContextPack` for a TypeScript/JavaScript monorepo

## Objective

Expand Package Spelunker into a complete local repository-intelligence and retrieval pipeline:

```text
approved workspace
  -> immutable workspace snapshot
  -> normalized projects, packages, files, symbols, and relationships
  -> persistent lexical index and bounded graph
  -> optional semantic candidates
  -> authority-aware fusion and graph expansion
  -> task-specific ContextPack
  -> core library, CLI, and MCP
```

The implementation is organizer-first. Provider mechanics come from the stack in
[`repository-intelligence-provider-stack.md`](research/repository-intelligence-provider-stack.md).
Project code owns only canonical contracts, evidence, identity, linking, ranking, planning, and the
missing behavior proven necessary by spikes.

Existing installed-package contract version 1 remains unchanged. The current Milestone 1 workflow
is completed as reusable foundation; expansion does not strand package resolution or public API
work.

## First Context Workflow

Conceptual request:

```ts
interface BuildContextRequestV1 {
  workspaceRoot: string;
  task: string;
  intent?: "locate" | "understand" | "debug" | "change" | "refactor" | "test" | "upgrade";
  focus?: {
    paths?: string[];
    projects?: string[];
    symbols?: string[];
  };
  budget: {
    maxTokens: number;
    maxItems?: number;
  };
  capabilities: {
    network: false;
    trustedWorkspaceExecution: false;
    embeddings: false;
  };
}
```

Conceptual result:

```ts
interface ContextPackV1 {
  schemaVersion: "1";
  snapshot: WorkspaceSnapshotIdentity;
  task: NormalizedTask;
  scope: ContextScope;
  primary: ContextItem[];
  supporting: {
    contracts: ContextItem[];
    dependencies: ContextItem[];
    tests: ContextItem[];
    configuration: ContextItem[];
    history: ContextItem[];
  };
  relationships: SemanticEdge[];
  unknowns: Unknown[];
  warnings: Warning[];
  evidence: EvidenceReference[];
  budget: ContextBudgetReport;
}
```

These examples guide the specification; they are not accepted public types until the contract slice
approves TypeBox/JSON Schema definitions and golden examples.

## Dependency Order

```text
R0 contracts and evaluation corpus
  -> R1 workspace snapshot and inventory
    -> R2 module graph and lexical semantic documents
      -> R3 persistent FTS retrieval
        -> R4 symbol/reference normalization and package linking
          -> R5 context planner and ContextPack
            -> R6 CLI/MCP delivery
              -> R7 optional vectors and enrichers
```

Provider spikes A–C run during R0/R1 but cannot freeze domain contracts from provider output.

## Slice R0: Contracts, Corpus, and Provider Proofs

**Outcome:** accepted workspace/context vocabulary plus evidence for provider choices.

### R0.1 Workspace snapshot specification

Define repository identity, Git HEAD, dirty-overlay identity, workspace packages, projects,
TypeScript compiler contexts, package-manager context, admitted roots, generation metadata, and
limits. Keep live mutable paths out of stable identity except through normalized evidence.

Acceptance:

- same admitted bytes/configuration produce same snapshot identity;
- dirty worktree changes alter overlay identity without pretending to be a commit;
- package snapshots link to workspace/project entities through typed edges;
- path containment, redaction, and cache permissions are specified before persistence.

### R0.2 Semantic entity and edge specification

Start with only entities required by first workflow:

```text
workspace, workspace-package, project, ts-project, file, module, symbol,
package, package-entrypoint, external-symbol, test, configuration
```

Start with bounded relations:

```text
contains, imports, exports, reexports, resolves-to, defines, references,
calls, implements, extends, constructs, tested-by, depends-on, configured-by
```

Every entity/edge records snapshot identity, provider observation, authority, evidence, and stable
normalization version. Provider-local IDs stay internal.

### R0.3 ContextPack contract and evaluation corpus

Create closed request/result schemas, golden success/partial/failure examples, and a small question
corpus over deterministic monorepo fixtures. Each question declares required, useful, irrelevant,
and forbidden context ranges.

First intents:

- locate a symbol or behavior;
- understand a small subsystem;
- plan a focused change;
- find tests and validation commands;
- explain one local-to-package relationship.

### R0.4 Provider spikes

Run stack Spikes A–C. Produce fixture-backed decision notes for:

- `@manypkg/get-packages` plus dependency-cruiser baseline;
- SCIP versus bounded TypeScript-worker indexing;
- SQLite/FTS5 schema and incremental replacement;
- opt-in isolation requirements for Nx, Knip, API Extractor, and TypeDoc.

Exit gate:

- snapshot/entity/edge/context specs approved;
- evaluation corpus versioned;
- selected providers pass runtime/license/security/normalization review;
- unsupported cases and fallback ownership explicit.

## Slice R1: Immutable Workspace Inventory

**Outcome:** one approved root produces a bounded, content-identified workspace inventory.

Implementation:

- reuse existing containment and bounded-read capabilities;
- add `@manypkg/get-packages` adapter for package enumeration;
- detect package manager and lockfiles without redefining resolver behavior;
- discover TypeScript/JavaScript projects and references from admitted JSON/config bytes;
- record Git commit and dirty overlay through fixed read-only Git commands;
- normalize workspace packages, projects, TS projects, configs, and package links;
- emit evidence and typed partial failures for unsupported workspace regions.

Do not run Nx, Knip, build tools, or project scripts in default safe mode.

Exit gate:

- npm, pnpm, Yarn, Bun, linked workspace, nested package, TS references, dirty Git, and adversarial
  fixtures produce deterministic inventories;
- unchanged re-index returns same snapshot ID;
- path escape, config size, package count, symlink, cancellation, and output limits fail closed.

## Slice R2: Dependency-Aware Lexical Context

**Outcome:** useful task context without embeddings or full compiler indexing.

Implementation:

- normalize files/modules/imports using dependency-cruiser behind a bounded adapter;
- create project-owned semantic documents for files, manifests, configs, docs, tests, and known
  package entrypoints;
- classify tests and configuration using explicit rules with evidence;
- load bounded entity/edge subsets into Graphology for traversal;
- implement lexical candidate generation and one-hop/depth-bounded dependency expansion in memory;
- return an internal context-candidate result for evaluation before public `ContextPack` freeze.

Exit gate:

- corpus locate/understand questions meet agreed lexical recall and latency thresholds;
- module edges are reproducible and carry source-range evidence;
- unresolved imports and provider omissions remain visible;
- no provider config or project code executes in safe mode.

## Slice R3: Persistent Index and Incremental Updates

**Outcome:** SQLite-backed facts, FTS5 retrieval, and snapshot-aware invalidation.

Implementation:

- add storage schema for snapshots, entities, edges, evidence, provider runs, semantic documents,
  source ranges, and FTS rows;
- use `better-sqlite3` behind a dedicated storage worker when operations can block;
- write schema migrations and store schema/normalizer/provider versions;
- replace facts transactionally by provider scope and workspace snapshot;
- implement file/config fingerprint invalidation and deletion handling;
- expose explicit rebuild, inspect, and cleanup operations;
- apply private permissions, redacted metadata, corruption recovery, and bounded WAL/cache policy.

Exit gate:

- clean rebuild equals incremental result for fixtures;
- interrupted update leaves previous complete index readable;
- stale snapshot/provider rows cannot appear as current facts;
- cold/incremental time, store size, p50/p95 query time, and deterministic result ordering are
  measured and recorded.

## Slice R4: Compiler Symbols, References, and Package Links

**Outcome:** local symbols connect through imports to exact workspace and installed-package APIs.

Implementation depends on R0 SCIP spike:

- preferred path: normalize streamed SCIP documents, occurrences, symbols, and relationships;
- fallback path: extend bounded TypeScript worker with `indexProject`, `findReferences`, and focused
  inspection operations;
- map provider symbols to stable workspace/project/file identities;
- reconcile module imports with compiler resolution;
- link external symbols to exact package snapshot, entrypoint, and public API symbol when proven;
- generate symbol/test/API semantic documents for FTS;
- keep compiler facts distinct from heuristic call edges or AST patterns.

Exit gate:

- definitions/references across project references and workspace packages are fixture-backed;
- local-to-external package symbol path is explainable end to end;
- rename/overload/re-export/merged declaration and JS-with-types cases are explicit;
- large/cyclic project, crash, timeout, memory, and malformed-index cases are bounded.

## Slice R5: Candidate Fusion and ContextPack v1

**Outcome:** stable task-to-context workflow over lexical, graph, compiler, and package facts.

Implementation:

- normalize query/task intent without requiring an LLM;
- fuse lexical, focus-path, compiler, graph, and optional CCE candidates;
- link duplicates to canonical entities and source ranges;
- weight authority, exact identifier matches, graph proximity, project/focus scope, tests,
  configuration, and package relevance;
- diversify results and suppress redundant ranges;
- allocate token budget across primary context, contracts, dependencies, tests, config, and history;
- record candidate reasons, rejected counts, unknowns, warnings, truncation, and evidence;
- emit closed `ContextPackV1` success/partial/failure envelopes.

Initial ranking stays deterministic and inspectable. Learned reranking is deferred until evaluation
shows a specific gap.

Exit gate:

- versioned corpus meets required-context recall and context-budget targets;
- every item explains why selected and which evidence supports it;
- stable tie-breaking produces deterministic output;
- missing indexes/providers produce useful partial packs, not invented certainty.

## Slice R6: CLI and MCP Delivery

**Outcome:** one core workflow available identically through CLI and MCP.

Implementation:

- add CLI operations to index, inspect index status, build context, and rebuild/clean explicit cache;
- add thin MCP v2 tools/resources using `@modelcontextprotocol/server`;
- stream progress through application events without leaking provider details;
- support cancellation, evidence pagination/handles, and bounded result delivery;
- prove CLI JSON and MCP structured output validate against same contracts.

Exit gate:

- agent can build a context pack for deterministic monorepo fixture through MCP;
- CLI and MCP results are semantically equivalent;
- transport tests cover authorization root, cancellation, stale index, partial provider failure,
  pagination, and oversized output.

## Slice R7: Optional Semantic and Ecosystem Enrichment

**Outcome:** measurable improvements without weakening deterministic core.

Add one provider at a time behind its own evaluation gate:

1. Transformers.js embeddings plus `sqlite-vec` hybrid retrieval;
2. Nx project graph in isolated trusted-workspace mode;
3. Knip framework entrypoints in isolated trusted-workspace mode;
4. ast-grep framework relationship enrichers;
5. API Extractor and TypeDoc secondary API/documentation cards;
6. existing esbuild metafile ingestion;
7. optional CCE retrieval provider;
8. version-matched remote documentation.

Each addition must improve named corpus/workflow metrics, identify authority class, and demonstrate
cancellation/resource behavior. Remove providers whose value does not justify complexity.

## Slice R8: Unified Package and Upgrade Impact

**Outcome:** exact package changes map to affected local code and task context.

Implementation:

- complete exact registry snapshot and package comparison workflow;
- normalize changed public package symbols;
- traverse external-symbol links into local imports, references, calls, tests, and projects;
- produce definite, potential, unaffected, and unknown impact sets with evidence;
- build migration `ContextPack` values containing exact package API, local usages, tests,
  configuration, and validation commands;
- add bounded `publint`/ATTW diagnostics as labeled supporting evidence.

Exit gate:

- representative upgrade fixtures identify required local edits and unaffected usages;
- package/runtime/declaration facts remain separate from diagnostics and retrieval scores;
- migration context fits explicit budgets and is reproducible from snapshot identities.

## Cross-Cutting Test Matrix

Every slice adds:

- npm, pnpm, Yarn, Bun, linked-package, and mixed monorepo positives where supported;
- Linux/macOS path behavior and Windows coverage when platform policy is accepted;
- path/symlink escapes, oversized inputs, graph bombs, cycles, malformed configs, binary files,
  generated/vendor exclusions, Unicode, cancellation, crash, and stale-cache cases;
- deterministic normalization and ordering tests;
- provider disagreement and unsupported-case fixtures;
- no-execution sentinels for package code, project config, plugins, builds, and hooks;
- retrieval relevance cases with forbidden secret/generated/out-of-scope ranges.

## Required Decisions Before Public Context Alpha

- cache location, permissions, retention, redaction, and recovery policy;
- supported platforms and native dependency distribution for `better-sqlite3`;
- workspace snapshot dirty-overlay and exclusion semantics;
- provider safe-mode versus trusted-workspace capability UX;
- first evaluation corpus and minimum retrieval/context thresholds;
- MCP tool names, pagination, index lifecycle, and evidence-handle policy;
- whether model artifacts may download automatically or require explicit installation.

