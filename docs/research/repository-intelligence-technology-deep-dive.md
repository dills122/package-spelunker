# Repository Intelligence Technology Deep Dive

- Reviewed: 2026-09-01
- Baseline: Node `>=22.22.1 <23`, TypeScript `7.0.2` build tool,
  `@typescript/typescript6` `6.0.2` analysis compiler, pnpm `10.23.0`
- Decision owner: [provider stack](repository-intelligence-provider-stack.md)
- Scope: reusable packages and tools below workspace discovery, graph construction, indexing,
  retrieval, incremental updates, and delivery

## Executive Decision

Package Spelunker should remain an organizer and linker. Adopt mature tools for mechanics, preserve
provider observations instead of provider objects, and keep project-owned code focused on identity,
evidence, authority, normalization, linking, ranking, budgets, and security boundaries.

Recommended baseline:

```text
workspace roots/packages       @manypkg/get-packages + constrained package-manager-detector
ignore semantics               ignore
module observations            dependency-cruiser
exact TS semantics             existing pinned TypeScript child-process worker
facts + lexical retrieval      better-sqlite3 + SQLite FTS5
bounded graph projection       graphology + selected graphology-* algorithms
repository state               fixed read-only Git CLI
transport                      @modelcontextprotocol/server v2
invariant testing              fast-check + existing Vitest fixtures
```

Promising additions require measured spikes: `@parcel/watcher`, `@vercel/nft`, `oxc-parser` and
`oxc-resolver`, `@ast-grep/napi`, API Extractor, SCIP, and detected monorepo-system providers.
Vectors remain a later capability: isolated Transformers.js or Ollama embeddings plus an exact-pinned
`sqlite-vec`, with LanceDB and USearch retained only as benchmark challengers.

## Evaluation Lens

Every candidate is scored against the same questions:

1. **Authority:** what fact can this provider actually establish, and what remains heuristic?
2. **Containment:** can it consume admitted bytes or bounded paths without executing workspace code?
3. **Compatibility:** does it work with Node 22, TypeScript 7 source/configuration, the pinned
   TypeScript 6 semantic baseline, ESM, native packaging, and target platforms?
4. **Contract stability:** can output be normalized behind a versioned adapter without exposing
   unstable objects?
5. **Incrementality:** can facts be replaced by provider scope and snapshot without stale rows?
6. **Operations:** are cancellation, time, memory, output, cache, and offline behavior controllable?
7. **Exit cost:** can the provider be removed without migrating canonical identities or public APIs?

`adopt` below means preferred after a narrow compatibility spike, not permission to add every
dependency before its implementation slice.

## Workspace and Monorepo Discovery

| Candidate | Verdict | Best use | Boundary or reason |
| --- | --- | --- | --- |
| `@manypkg/get-packages` | adopt | generic npm, pnpm, Yarn, Bun, Lerna, Rush, and single-package enumeration | API searches upward through `@manypkg/find-root`; adapter must require returned root to equal admitted root and contain every result |
| `package-manager-detector` | adopt narrowly | package-manager and lockfile hints | default parent crawl must be disabled or result-root checked; never use its command/install helpers |
| `@npmcli/map-workspaces` | optional fallback | npm `workspaces` pattern expansion | useful npm-specific reference, but duplicates Manypkg for baseline discovery |
| `@npmcli/arborist` | optional | npm installed logical/physical dependency trees | actual-tree loading only; registry, audit, reify, and mutation paths remain outside capability |
| pnpm workspace/lockfile packages | spike only | pnpm-specific lockfile and workspace evidence | packages such as `@pnpm/find-workspace-packages` and `@pnpm/lockfile.fs` track pnpm internals and lockfile formats; isolate behind a pnpm adapter and fixture version matrix |
| Yarn PnP API | opt-in provider | authoritative locators, dependencies, and resolution for PnP installs | `.pnp.cjs` is generated executable JavaScript; loading it is trusted-workspace execution, not default static discovery |
| `@microsoft/rush-lib` | optional provider | authoritative Rush configuration and local dependency projects | use documented `RushConfiguration` APIs; preserve Rush project identity separately from package and TS-project identity |
| `@nx/devkit` | optional provider | Nx project graph and external nodes | project graph can execute Nx plugins/use daemon; disable daemon and require isolated trusted-workspace mode |
| `lerna/utils` | optional provider | Lerna/Nx project graph and file map | use only when Lerna is detected; normalize graph output without making Nx node IDs canonical |
| `turbo query` / `turbo ls --output=json` | optional subprocess provider | Turborepo package/task graph observations | fixed binary/arguments and bounded JSON; do not load arbitrary build tasks or shell through user input |

Provider-specific topology is additive. Package Spelunker must not collapse these entities:

```text
workspace package != package-manager locator != build-system project
                  != TypeScript project != installed package artifact
```

## Parsing, Resolution, and Graph Inputs

| Candidate | Verdict | Best use | Boundary or reason |
| --- | --- | --- | --- |
| dependency-cruiser | adopt | baseline static JS/TS import graph, unresolved edges, cycles, reachability | use programmatic API with explicit options; never import workspace JS config in safe mode |
| `@vercel/nft` | spike | runtime deployment-file and package-reason trace from known entrypoints | strong Node exports/imports/conditions coverage; no incremental invalidation, so treat output as replaceable entrypoint-scoped observation |
| esbuild metafile | optional ingest | actual inputs, outputs, imports, and entrypoints from an existing build | consume bounded JSON only; human analysis text is not a stable machine contract and Package Spelunker must not invoke builds implicitly |
| Knip | enrichment only | framework-aware entrypoints, unused-file/symbol observations | documented programmatic graph API is absent; use bounded JSON/custom reporter only in trusted-workspace mode |
| `oxc-parser` | spike | fast ESTree/TS-ESTree syntax and direct ESM metadata | frequent pre-1.0 releases require exact pin and a narrow project-owned normalization contract |
| `oxc-resolver` | spike | fast Node/webpack-style source resolution for bulk candidate edges | compiler remains authority for exact TypeScript resolution; compare conditions, aliases, extension rules, and project references |
| `@ast-grep/napi` | optional | structural chunks and framework relationship rules | native dependency; matches remain heuristic unless compiler/provider evidence confirms them |
| Tree-sitter + TS grammar | defer | error-tolerant incremental syntax | native grammar/ABI surface and weaker semantic authority do not beat Oxc/ast-grep for the first workflow |
| custom parser/resolver | reject | — | large compatibility surface already covered by maintained ecosystem tools and pinned TypeScript |

Use different graph sources for different questions. Dependency-cruiser describes static source
dependencies; NFT describes runtime deployment reachability; esbuild describes an actual build;
TypeScript describes compiler resolution. Disagreement is evidence, not a reason to overwrite one
graph with another.

## Symbols and Public APIs

| Candidate | Verdict | Best use | Boundary or reason |
| --- | --- | --- | --- |
| existing TypeScript worker | retain authority | exact resolution, symbols, references, types, public API, and focused semantic questions | already has brokered files, closed protocol, heap/time/output limits, and snapshot verification |
| SCIP + `scip-typescript` | high-risk spike | bulk cross-file definitions, references, occurrences, and portable index interchange | upstream documents Node 18/20 and currently depends on TypeScript 5.x; repository uses Node 22, may ingest TypeScript 7 projects, and keeps TypeScript 6 as semantic authority, so runtime, syntax, and semantic drift are hard gates |
| API Extractor + `@microsoft/api-extractor-model` | optional | formal public API reports and normalized `.api.json` consumption | useful secondary API evidence; known config/entrypoints only and cannot replace canonical compiler IDs |
| TypeDoc | optional | documentation/reflection enrichment | good agent-facing symbol cards, but overlaps API Extractor and is not semantic authority |
| ts-morph | defer | ergonomic compiler wrappers | duplicates existing worker authority and adds wrapper identity/memory overhead; adopt only if a measured adapter becomes materially smaller |
| `@typescript-eslint/parser` project service | reject as indexer | — | excellent ESTree/lint integration, but optimized for lint rules rather than durable symbol/reference indexing |

SCIP gets one comparison spike, not an architectural commitment. If its runtime matrix, memory, or
symbol mapping fails, extend the existing worker with bounded `indexProject` and `findReferences`
operations. Do not maintain two canonical semantic engines.

## Persistence, Lexical Search, and Graph Projection

| Candidate | Verdict | Best use | Boundary or reason |
| --- | --- | --- | --- |
| `better-sqlite3` | adopt | transactions, facts, evidence, provider runs, cache metadata, and FTS5 | repository Node 22 baseline matches current package engine floor; run blocking work in dedicated process/worker and test native distribution targets |
| Node `node:sqlite` | defer | possible future first-party SQLite binding | Node 22 API remains active-development stability and synchronous; reevaluate at next runtime baseline |
| SQLite FTS5 `unicode61` | adopt | words, docs, identifiers, prefixes, BM25 | use column weights and selected prefix indexes; tokenize identifiers into project-owned semantic documents |
| SQLite FTS5 `trigram` | adopt | path, filename, and symbol substring lane | keep separate from natural-language lane; validate query length and storage cost |
| Graphology | adopt | bounded in-memory graph projection and algorithms | SQLite/contracts remain persistence; load only scoped nodes/edges with depth/fan-out budgets |
| MiniSearch | benchmark/ephemeral | in-memory lexical oracle or small UI autocomplete | zero-persistence baseline; not durable canonical index |
| `cacache` | defer | large immutable content-addressed provider/model blobs | SQLite is enough for normalized facts; add only when duplicated large blobs justify a second cache |
| Kùzu | reject | — | upstream repository is archived; do not introduce a new graph database dependency |

Use two FTS lanes rather than forcing one tokenizer to serve every query:

```text
semantic_fts: unicode61 + selected prefixes + BM25 column weights
locator_fts:  trigram over normalized path, filename, and symbol lookup text
```

Application code merges candidates with deterministic tie-breaking. SQL/FTS scores nominate
candidates; they never establish evidence authority.

## Embeddings and Vector Search

| Candidate | Verdict | Best use | Boundary or reason |
| --- | --- | --- | --- |
| `@huggingface/transformers` | preferred later embedded provider | local feature extraction through ONNX Runtime | isolate in its own process; pin model revision/files/hashes/license/tokenizer/pooling/normalization and make downloads explicit |
| Ollama `/api/embed` | optional later provider | local external-daemon batch embeddings | normalized vectors and simpler main-process native footprint; requires explicit endpoint capability, model identity, timeout, and availability handling |
| `node-llama-cpp` | optional reranking spike | local embeddings or cross-encoder-like reranking with GGUF models | larger native/model footprint; use only after retrieval corpus identifies a reranking gap |
| `sqlite-vec` | defer behind gate | vector search beside SQLite facts | pre-v1; exact-pin and migration tests required; reported native-runtime conflict with `onnxruntime-node` means embedding and SQLite writer/vector query processes must be separate |
| LanceDB | benchmark challenger | combined vector/FTS/filter/ANN if SQLite vectors fail | capable but introduces second native storage engine and duplicate source-of-truth/invalidation work |
| USearch | benchmark challenger | high-performance vector-only HNSW | separate index complicates metadata joins, transactions, deletion, and recovery |

Vectors do not ship because a package exists. First freeze a versioned corpus and lexical baseline,
then require a statistically and operationally useful gain in recall/MRR/nDCG within context budget.
Model download and remote-daemon access are explicit capabilities; offline indexing must work with
pre-fetched, hash-verified artifacts.

## Watching and Incremental Correctness

| Candidate | Verdict | Best use | Boundary or reason |
| --- | --- | --- | --- |
| `ignore` | adopt | Git-compatible ignore matching over root-relative paths | distinguish directories with trailing slash; exclusion/redaction happens before persistence |
| `@parcel/watcher` | spike | recursive native event stream, coalescing, historical snapshot diff | good cross-platform semantics but adds native install artifacts; validate macOS/Linux/Windows and cancellation/resource behavior |
| chokidar v4 | fallback | portable recursive watch abstraction | mature fallback; initial scans/polling and network filesystems still require reconciliation |
| Node `fs.watch` | reject as sole source | low-level event hint only | platform/network-filesystem inconsistencies and missing-event behavior make it insufficient for correctness |

Watcher events are scheduling hints. Canonical incrementality comes from a persisted manifest of
root-relative path, size, content hash, exclusion identity, and provider scope. Debounce/coalesce,
then reconcile; periodically or on demand perform a bounded manifest diff. A clean rebuild must
equal any incremental history, including simulated lost, duplicate, and reordered events.

## Process Control, Testing, and Observability

| Candidate | Verdict | Best use | Boundary or reason |
| --- | --- | --- | --- |
| existing worker coordinator | retain | closed provider processes with brokered files and strict resource envelopes | extend shared primitives before introducing a generic subprocess abstraction |
| Execa | defer | convenience for fixed third-party CLI processes | useful cancellation/timeout/cleanup, but current worker already owns stronger framed protocols; adopt only if subprocess spikes show repeated missing mechanics |
| Node permission model | defense-in-depth only | extra restriction for compatible pure-JS child processes | Node documents it as a seat belt, not a sandbox; workers do not inherit permissions and native modules/symlinks have caveats |
| fast-check | adopt for development | seeded property tests and shrinking for containment, identity, ordering, and graph invariants | persist failing seeds/examples as deterministic fixtures when they cover a new class |
| OpenTelemetry JS | defer | traces/metrics around provider spans after event schema stabilizes | traces and metrics are stable but SDK/storage complexity is premature; logs remain less mature |

No Node flag turns untrusted project or package execution into a safe indexing capability. Default
mode still avoids executable config and plugins; isolated processes limit blast radius but are not a
security sandbox.

## License, Maintenance, and Distribution Due Diligence

This is technical screening, not legal approval. Record exact installed package metadata, license
files/notices, transitive licenses, checksums, release date, and advisories in each adoption spike.
Embedding model/tokenizer licenses are separate from runtime-library licenses.

| Candidate | Upstream-declared license | Current maintenance/distribution signal | Adoption consequence |
| --- | --- | --- | --- |
| Manypkg | MIT | focused monorepo with supported manager fixtures | low distribution risk; still test upward root search and exact version behavior |
| `package-manager-detector` | MIT | actively covers new managers and exposes command helpers beside detection | import detection subpath only; forbid command capability |
| `ignore` | MIT | mature, zero-native implementation of Git ignore semantics | low dependency risk; property-test directory and root-relative path behavior |
| dependency-cruiser | MIT | maintained programmatic API and broad resolver/config surface | pin adapter output normalization and test supported Node/TS matrix |
| `better-sqlite3` | MIT | active native addon with prebuilt/source-build platform concerns | platform install/load matrix and native ABI upgrade gate required |
| Graphology | MIT | mature JS graph object plus separately versioned algorithms | select only used algorithm packages and keep serialization project-owned |
| MCP TypeScript SDK v2 | Apache-2.0/MIT transition; docs CC-BY-4.0 | active protocol split and licensing transition documented in repository | capture exact package license files/notices; keep transport replaceable |
| fast-check | MIT | maintained pure-JS development dependency | suitable early adoption; no production runtime authority |
| `@parcel/watcher` | MIT | native multi-platform packages; upstream has current install-script and native crash reports | spike install/load/shutdown on each target; retain chokidar/reconcile fallback |
| `@vercel/nft` | MIT | maintained deployment tracer with native/transitive packaging surface | exact-pin; scan install scripts/native artifacts and replace output per entrypoint |
| Oxc parser/resolver | MIT | very active, fast-moving Rust/NAPI projects; JS-facing versions change frequently | exact-pin behind narrow adapter and run native platform matrix |
| ast-grep | MIT | active Rust/NAPI project with stable JS API documentation | optional native provider; syntax observations remain heuristic |
| `scip-typescript` | Apache-2.0 | documented runtime/TypeScript support lags this repository's baselines | one high-risk subprocess spike; worker fallback remains planned path |
| Transformers.js | Apache-2.0 | active ONNX-based runtime; models have independent licenses and artifacts | isolated worker, explicit artifact inventory, no implicit network |
| `sqlite-vec` | MIT/Apache-2.0 | pre-v1 with reported Node native-runtime coexistence and deletion issues | defer, exact-pin, separate process, migration/rebuild and fault tests |
| Ollama | MIT | active external application/API; downloaded models have independent licenses | optional user-managed daemon only; endpoint and model identity explicit |

Maintenance is a moving input. “Active” never waives compatibility fixtures, and repository stars or
release volume are not adoption evidence. An archived repository such as Kùzu is rejected even when
its license is permissive.

## Provider Spike Scorecard

Every spike produces machine-readable measurements plus a short decision note. Minimum gates:

| Area | Required evidence before adoption |
| --- | --- |
| workspace discovery | 100% expected packages and roots across npm/pnpm/Yarn/Bun/Rush fixtures; zero accepted outside-root result; deterministic ordering |
| module/runtime graph | golden edge coverage by edge authority; explicit unresolved/unsupported rate; no config execution sentinel; bounded cyclic/large graph behavior |
| symbols | 100% required golden definitions/references/re-exports on supported fixtures; stable normalized IDs; Node 22, TS 7 input, and pinned TS 6 authority compatibility; bounded output and peak memory |
| persistence | clean rebuild byte-for-byte logical equivalence with incremental state; transactional crash recovery; no stale current rows; private permissions |
| lexical retrieval | frozen corpus precision@k, recall@k, MRR, nDCG, required-context recall, p50/p95, store size, and deterministic ties |
| watcher | incremental state equals forced full scan after dropped, duplicate, reordered, rename, and atomic-save events on every supported platform |
| vectors | statistically useful gain over lexical plus graph expansion; bounded model/index time, peak memory, disk, p95 query; offline and model-identity tests |
| security | no safe-mode project config/plugin execution, no implicit network, symlink containment, bounded diagnostics/output, normalized failures without raw secrets/paths |

Default rejection rule: if two candidates meet quality gates, choose the one with less execution
authority, smaller native/install surface, more stable machine output, and lower replacement cost.

## Recommended Experiment Order

1. Freeze evaluation corpus, provider scorecard schema, and ignored-path policy.
2. Prove Manypkg root containment plus package-manager detection; add `ignore` and fast-check
   invariants.
3. Compare dependency-cruiser alone versus dependency-cruiser plus NFT/Oxc observations.
4. Prototype dual-lane FTS5, transactional provider replacement, and Graphology projection.
5. Compare SCIP with bounded TypeScript-worker indexing across Node 22, TypeScript 7 project input,
   and pinned TypeScript 6 authority fixtures.
6. Prove manifest-diff incrementality, then compare Parcel watcher and chokidar as schedulers.
7. Add detected Nx/Rush/Lerna/Turbo/Yarn PnP providers one at a time in explicit execution modes.
8. Freeze lexical retrieval metrics before benchmarking embeddings and vector engines.

## Primary Sources

Sources were reviewed 2026-09-01. Recheck release, license, runtime, advisory, and native-artifact
metadata at each adoption spike.

### Workspace and graph providers

- [Manypkg `get-packages`](https://github.com/Thinkmill/manypkg/tree/main/packages/get-packages)
- [`package-manager-detector`](https://github.com/antfu-collective/package-manager-detector)
- [npm `map-workspaces`](https://github.com/npm/map-workspaces/blob/main/README.md)
- [npm Arborist](https://github.com/npm/cli/blob/latest/workspaces/arborist/README.md)
- [Yarn PnP API](https://yarnpkg.com/advanced/pnpapi) and
  [PnP specification](https://yarnpkg.com/advanced/pnp-spec)
- [Rush programmatic API](https://api.rushstack.io/pages/rush-lib/)
- [Nx `createProjectGraphAsync`](https://nx.dev/docs/reference/devkit/createProjectGraphAsync)
- [Lerna utilities API](https://lerna.js.org/docs/api-reference/utilities)
- [Turborepo query stabilization](https://github.com/vercel/turborepo/discussions/9170)
- [dependency-cruiser API](https://github.com/sverweij/dependency-cruiser/blob/main/doc/api.md)
- [Knip reporters](https://knip.dev/features/reporters) and
  [API/graph limitations](https://knip.dev/reference/faq)
- [Vercel NFT](https://github.com/vercel/nft)
- [esbuild metafile API](https://esbuild.github.io/api/#metafile)
- [Oxc parser](https://oxc.rs/docs/guide/usage/parser.html) and
  [resolver](https://oxc.rs/docs/guide/usage/resolver.html)
- [ast-grep JavaScript API](https://ast-grep.github.io/guide/api-usage/js-api.html)
- [Tree-sitter](https://github.com/tree-sitter/tree-sitter)

### Symbols and APIs

- [SCIP format](https://github.com/scip-code/scip/blob/main/README.md)
- [`scip-typescript`](https://github.com/sourcegraph/scip-typescript) and its
  [package metadata](https://github.com/sourcegraph/scip-typescript/blob/main/package.json)
- [ts-morph references](https://ts-morph.com/navigation/finding-references)
- [typescript-eslint parser](https://typescript-eslint.io/packages/parser/)
- [API Extractor developer API](https://api-extractor.com/pages/developer/api/)
- [TypeDoc API](https://typedoc.org/api/)

### Storage, retrieval, and operations

- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [Node 22 `node:sqlite`](https://nodejs.org/download/release/v22.22.1/docs/api/sqlite.html)
- [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
- [Graphology](https://graphology.github.io/) and
  [standard library](https://graphology.github.io/standard-library/)
- [MiniSearch](https://lucaong.github.io/minisearch/)
- [`cacache`](https://github.com/npm/cacache/blob/main/README.md)
- [`sqlite-vec`](https://github.com/asg017/sqlite-vec) and reported
  [`onnxruntime-node` coexistence issue](https://github.com/asg017/sqlite-vec/issues/270) and
  [deletion issue](https://github.com/asg017/sqlite-vec/issues/274)
- [LanceDB JavaScript](https://lancedb.github.io/lancedb/js/)
- [USearch](https://github.com/unum-cloud/usearch)
- [Transformers.js pipelines](https://huggingface.co/docs/transformers.js/pipelines)
- [ONNX Runtime JavaScript](https://onnxruntime.ai/docs/get-started/with-javascript/)
- [Ollama embeddings](https://github.com/ollama/ollama/blob/main/docs/capabilities/embeddings.mdx)
- [`node-llama-cpp`](https://github.com/withcatai/node-llama-cpp)
- [`ignore`](https://github.com/kaelzhang/node-ignore)
- [Parcel watcher](https://github.com/parcel-bundler/watcher)
- [Parcel watcher install-script discussion](https://github.com/parcel-bundler/watcher/issues/251)
- [Parcel watcher current shutdown-crash report](https://github.com/parcel-bundler/watcher/issues/258)
- [chokidar](https://github.com/paulmillr/chokidar)
- [Node `fs.watch`](https://nodejs.org/api/fs.html)
- [Node permission model](https://nodejs.org/download/release/v22.22.1/docs/api/permissions.html)
- [Execa](https://github.com/sindresorhus/execa)
- [fast-check](https://fast-check.dev/docs/introduction/why-property-based/)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [MCP TypeScript server SDK v2](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/README.md)
- [MCP TypeScript SDK licensing transition](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/LICENSE)
- [Kùzu archive](https://github.com/kuzudb/kuzu)
