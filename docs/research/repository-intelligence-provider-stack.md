# Repository Intelligence Provider Stack

- Reviewed: 2026-09-01
- Status: Accepted direction; each dependency still requires a fixture-backed adoption spike
- Decision: [ADR 0006](../decisions/0006-organizer-first-repository-intelligence.md)
- Candidate comparison:
  [technology deep dive](repository-intelligence-technology-deep-dive.md)

## Selection Rules

Package Spelunker organizes and links existing analyzers. It does not reimplement mechanics merely
to avoid dependencies.

Every provider must:

- accept an explicit capability and approved scope;
- produce versioned, bounded output that can be normalized without leaking provider objects;
- record provider name/version, input snapshot identity, authority, warnings, and evidence;
- run without installing packages or executing lifecycle scripts;
- support cancellation, time, memory, input, and output limits appropriate to its execution model;
- pass positive, adversarial, compatibility, and disagreement fixtures;
- remain replaceable behind a capability-specific adapter.

Statuses in this document mean:

- **adopt** — preferred implementation after a small compatibility spike;
- **retain** — existing project-owned capability remains authoritative;
- **spike** — promising, but compatibility or coverage must be proven before commitment;
- **optional** — useful enrichment for a later workflow, not core correctness;
- **defer** — deliberately excluded until an evaluation gate is met;
- **not selected** — overlaps project-owned differentiation or adds avoidable architecture.

## Version and Dependency Policy

Do not add all planned tools up front. Each slice adds only its accepted provider after spike. At
adoption:

- pin direct provider version according to repository dependency policy and commit lockfile;
- record upstream license, supported Node/TypeScript/platform matrix, native artifacts, transitive
  execution surfaces, and relevant advisories;
- record provider/protocol/schema version in normalized observations and cache identity;
- keep optional/native/model dependencies out of default install until capability requires them;
- upgrade one provider independently with its normalization, disagreement, resource, and retrieval
  fixtures;
- never infer public compatibility from provider semantic version alone.

## Planned Stack

| Layer | Technology | Status | Intended role | Main gate or restriction |
| --- | --- | --- | --- | --- |
| Workspace packages | `@manypkg/get-packages` | adopt | generic npm, pnpm, Yarn, Bun, Lerna, and Rush package discovery | require detected root to equal admitted root; prevalidate workspace patterns; normalize/contain results; exact importer selection remains authoritative |
| Package-manager detection | `package-manager-detector` | spike | lockfile and package-manager hints | explicit admitted root only; disable/default parent crawl; detection is evidence, never resolver truth |
| Ignore semantics | `ignore` | adopt | Git-compatible exclusions over normalized root-relative paths | distinguish directory paths; exclusion/redaction occurs before persistence |
| Package-manager topology | Yarn PnP, Rush, Lerna, Turborepo, pnpm APIs | optional | detected manager/build-system locators, projects, and edges | separate adapters and entity kinds; executable config or CLIs require declared execution mode |
| Nx topology | `@nx/devkit` `createProjectGraphAsync` | optional | Nx projects, external nodes, and dependencies | isolated trusted-workspace mode; disable daemon; Nx plugins may execute workspace code |
| npm dependency tree | `@npmcli/arborist` | optional | npm physical tree plus logical prod/dev/peer/optional edges | read-only actual-tree load; reject network/reify operations and escaping links |
| Module graph | `dependency-cruiser` | adopt | static JS/TS imports, unresolved edges, cycles, and reachability | explicit options and roots; do not import arbitrary JS config; bounded isolated provider |
| Framework entrypoints | Knip | optional | framework/config entrypoint and unused/reachable observations | no stable general graph API; use JSON/custom reporter in isolated trusted-workspace mode |
| Bulk symbols/references | SCIP plus `scip-typescript` | spike | definitions, references, occurrences, relationships, and docs | current Node/TypeScript baseline differs from repository; subprocess and normalization spike required |
| Exact TypeScript semantics | pinned TypeScript compiler and existing worker | retain | authoritative resolution, public API, symbol inspection, references, and type questions | brokered filesystem, pinned compiler, closed worker protocol, hard resource limits |
| TypeScript ergonomics | `ts-morph` | defer | possible high-level AST convenience | add only if it removes substantial adapter code without creating a second semantic authority |
| Public API reports | API Extractor and `@microsoft/api-extractor-model` | optional | formal reports, doc model, and secondary API evidence | compare with existing public-API contract; known entries only; isolated worker |
| Documentation model | TypeDoc JSON/reflections | optional | agent-friendly symbol documentation cards | enrichment only; cannot redefine compiler identity or signatures |
| Framework patterns | `@ast-grep/napi` | optional | declarative Angular, React, Nest, NgRx, Formly, and config enrichers | parse admitted bytes or bounded file lists; matches remain heuristic unless compiler-confirmed |
| Build graph | esbuild metafile | optional | actual bundled inputs, outputs, imports, and entrypoints | prefer consuming existing JSON; never load project build config/plugins or run project builds implicitly |
| Runtime file trace | `@vercel/nft` | spike | Node deployment reachability and per-file reasons from admitted entrypoints | replace observations by entrypoint scope; no implicit build/config execution |
| Git context | Git CLI | adopt | repository identity, HEAD, changed paths, and bounded diff evidence | fixed read-only arguments; disable external diff/text conversion; never run hooks |
| Persistent facts/search | SQLite through `better-sqlite3` | adopt | entities, edges, evidence, snapshots, provider runs, cache metadata, and FTS5 | private cache permissions, schema migrations, WAL/cleanup policy, bounded queries |
| Lexical retrieval | SQLite FTS5/BM25 | adopt | `unicode61` semantic lane plus `trigram` path/symbol substring lane | retrieval scores are candidates, not authority; measure prefix/trigram storage cost |
| In-memory graph | Graphology plus selected algorithm packages | adopt | bounded traversal, components, paths, and ranking inputs | SQLite/project contracts remain canonical persistence; depth and fan-out budgets required |
| Local embeddings | `@huggingface/transformers` | optional | pinned local feature-extraction provider | model ID, revision, files, dimensions, pooling, normalization, license, and hashes are identity |
| External local embeddings | Ollama | optional | batch embedding provider through an explicitly configured local daemon | endpoint/model identity, availability, timeout, and no-implicit-download policy required |
| Vector retrieval | `sqlite-vec` | defer | local nearest-neighbor search in same store | pre-1.0 maturity and Node-extension compatibility; enable only after lexical baseline evaluation |
| Incremental scheduling | `@parcel/watcher` | spike | recursive change hints and snapshot-diff support | native distribution matrix; events never replace content-manifest reconciliation |
| Invariant tests | fast-check | adopt | seeded property tests and shrinking for roots, identities, graphs, and ordering | persist new failure classes as deterministic fixtures |
| Generic retrieval | CCE provider | optional | fuzzy code chunks and cross-session context | external candidate source only; results normalized and independently linked |
| MCP transport | `@modelcontextprotocol/server` v2 | adopt | thin tool/resource transport over core workflows | no domain orchestration in handlers; versioned contracts, cancellation, pagination |
| Registry/package diagnostics | `pacote`, `publint`, `@arethetypeswrong/core` | retain plan | exact registry snapshots and specialist diagnostics | existing registry-only and isolated-provider restrictions continue |

## Deliberately Not Selected as Foundations

| Technology | Decision | Reason |
| --- | --- | --- |
| Orama | not selected for durable core | SQLite is already needed for facts, evidence, cache metadata, and incremental state; FTS5 avoids a second persistence model. Orama remains a possible benchmark oracle. |
| LanceDB | defer | vector scale does not yet justify another embedded store. Revisit only if SQLite vector performance fails measured workloads. |
| LangChain JS | not selected | retriever interfaces are small; candidate fusion, authority, evidence, and context planning are product differentiation. |
| Mastra | not selected | useful general RAG framework, but owning orchestration would blur domain contracts and provider authority. Reuse isolated utilities only if independently valuable. |
| `@phenomnomnominal/tsquery` | defer | overlaps ast-grep and TypeScript compiler queries. Add only for a concrete rule that neither chosen path expresses cleanly. |
| Custom vector database | not selected | no evidence of need; use SQLite extension or a proven store after evaluation. |
| Custom parser/module resolver | not selected | use dependency-cruiser/SCIP for bulk mechanics and existing TypeScript/Node engines for exact questions. |
| Kùzu | not selected | upstream repository is archived; a second graph persistence engine is unnecessary. |

## Provider Boundaries

### Workspace and project structure

`@manypkg/get-packages` supplies generic package enumeration only after Package Spelunker validates
workspace patterns cannot escape admitted roots. Package Spelunker's existing `workspace-model`
continues to own approved-root containment, importer identity, configuration evidence, and exact
installed-package selection. If the spike cannot guarantee reads stay contained, run it over a
materialized immutable workspace view or reject that context rather than accepting post-read checks.

`package-manager-detector` is limited to explicit admitted roots and selected read-only detection
strategies. Its default upward parent crawl is not allowed. Command-resolution helpers are outside
the provider capability; Package Spelunker never turns detection into install/run authority.

Nx, Arborist, and future Turborepo/Yarn providers contribute observations to distinct entity kinds:

```text
workspace package != build-system project != TypeScript project != installed package
```

Adapters link these identities rather than collapsing them.

### Module and entrypoint structure

Dependency-cruiser is preferred for the baseline source module graph. Knip contributes
framework-aware entrypoints and configuration reachability when trusted-workspace execution is
explicitly enabled. Provider disagreement or missing support is visible in evidence.

No adapter may load arbitrary Babel, Webpack, Vite, Nx, or JavaScript configuration in default safe
mode. A provider that requires project code or plugins moves to an isolated, opt-in capability.

### Symbols and APIs

SCIP is the preferred bulk interchange experiment. The existing bounded TypeScript worker remains
the authoritative path for exact resolution and on-demand semantic questions. The spike must answer:

- Can `scip-typescript` run reliably with Node 22, TypeScript 7 project input, and the repository's
  pinned TypeScript 6 analysis policy?
- Are multi-project npm, pnpm, Yarn, and project-reference indexes complete enough?
- Can SCIP symbols be mapped stably to workspace files, package symbols, and compiler identities?
- Can index output be streamed under memory/output budgets?

If not, extend the TypeScript worker with a bounded `indexProject` operation. Do not build both paths
before the comparison produces evidence.

API Extractor and TypeDoc are secondary views. They may generate API reports and documentation
cards but do not define canonical local symbol IDs or override the existing public API contract.

### Storage and retrieval

SQLite is one local, inspectable persistence boundary:

```text
workspace snapshots
  -> entities and edges
  -> evidence and provider runs
  -> semantic documents and source ranges
  -> FTS5 lexical index
  -> optional vectors
```

`better-sqlite3` is selected for the Node 22 baseline, transaction support, worker compatibility,
and bundled FTS5. Database work that can block the application service runs behind a dedicated
worker boundary.

Use separate FTS5 indexes for natural-language/identifier retrieval (`unicode61`, selected prefix
indexes, BM25 weights) and path/symbol substring lookup (`trigram`). Merge candidate streams in
project code with deterministic tie-breaking.

Lexical retrieval ships first. Vector retrieval is added only when a versioned evaluation corpus
shows statistically and operationally useful improvement over lexical plus graph expansion.

An embedding provider must make these cache-key fields explicit:

```text
provider + model + revision + artifact hashes + dimensions
+ pooling + normalization + input template + tokenizer version
```

Model downloads are explicit network capabilities. Offline operation uses pinned, pre-fetched model
artifacts. Model or embedding changes require a new index identity.

Embedding inference and the SQLite writer/vector-query boundary run in separate processes. This is
required before adopting `sqlite-vec`, both for fault containment and because current
`sqlite-vec`/ONNX Runtime Node combinations have reported native-runtime conflicts.

### Context planning

Package Spelunker owns:

- query/task normalization;
- candidate deduplication and entity linking;
- authority-aware score fusion;
- graph-neighborhood expansion;
- diversity and redundancy control;
- token estimation and budget allocation;
- required contracts, tests, configuration, dependencies, and validation commands;
- rejected-candidate counts, unknowns, warnings, and evidence.

This is why LangChain or Mastra does not own the pipeline. Their generic retriever abstractions do
not model Package Spelunker's artifact identity and evidence rules.

## Adoption Spikes

### Spike A: Workspace structure

Run `@manypkg/get-packages`, dependency-cruiser, and—when detected—Nx/Rush/Lerna/Turborepo/Yarn PnP
providers against small npm, pnpm, Yarn, linked-package, project-reference, and adversarial
fixtures. Measure graph coverage, runtime, memory, determinism, and safe-mode behavior. Loading
`.pnp.cjs` is trusted-workspace execution, never generic discovery.

### Spike B: Symbols and public APIs

Run `scip-typescript` and API Extractor over the same deterministic fixtures as the existing
TypeScript worker. Compare symbol identity, definitions, references, re-exports, overloads,
documentation, multi-project behavior, limits, and failures.

### Spike C: Persistence and retrieval

Prototype SQLite schema, FTS5 semantic documents, incremental replacement by snapshot, and bounded
Graphology loading. Measure cold index time, incremental index time, store size, top-k latency, and
retrieval quality on a versioned question/relevance corpus.

No spike output becomes a public contract. Accepted findings become an ADR/spec and focused package
implementation.

## Evaluation Gates

Record at minimum:

- provider coverage and unsupported cases;
- precision@k, recall@k, MRR, and nDCG for retrieval;
- required-context recall within token budgets;
- duplicate/redundant context ratio;
- unsupported or false relationship rate;
- cold and incremental index latency;
- query p50/p95 latency;
- peak memory, store size, and output size;
- cancellation and resource-limit behavior;
- deterministic re-run identity for unchanged inputs.

Vectors ship only when they improve the agreed corpus enough to justify model size, index time,
native extension risk, and cache invalidation cost.

## Primary Sources

- [Manypkg](https://github.com/Thinkmill/manypkg)
- [Technology deep dive](repository-intelligence-technology-deep-dive.md)
- [Nx `createProjectGraphAsync`](https://nx.dev/docs/reference/devkit/createProjectGraphAsync)
- [npm Arborist](https://github.com/npm/cli/blob/latest/workspaces/arborist/README.md)
- [dependency-cruiser programmatic API](https://github.com/sverweij/dependency-cruiser/blob/main/doc/api.md)
- [Knip reporters and preprocessors](https://knip.dev/features/reporters)
- [Knip API and graph limitations](https://knip.dev/reference/faq)
- [SCIP](https://github.com/scip-code/scip)
- [`scip-typescript`](https://github.com/sourcegraph/scip-typescript)
- [API Extractor](https://api-extractor.com/pages/overview/intro/)
- [API Extractor developer packages](https://api-extractor.com/pages/developer/api/)
- [TypeDoc API](https://typedoc.org/api/)
- [ast-grep JavaScript API](https://ast-grep.github.io/guide/api-usage/js-api)
- [esbuild metafile](https://esbuild.github.io/api/#metafile)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
- [`sqlite-vec` installation](https://github.com/asg017/sqlite-vec/blob/main/site/getting-started/installation.md)
- [Graphology](https://graphology.github.io/)
- [Transformers.js pipelines](https://huggingface.co/docs/transformers.js/pipelines)
- [MCP TypeScript server SDK v2](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/README.md)
