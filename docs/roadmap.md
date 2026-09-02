# Roadmap

Roadmap is vertical-slice oriented. Each milestone must answer a useful developer/agent question,
not merely add provider packages. Provider choices follow
[`repository-intelligence-provider-stack.md`](research/repository-intelligence-provider-stack.md);
task order and gates follow
[`repository-intelligence-implementation-plan.md`](repository-intelligence-implementation-plan.md).

Current status: **installed-package foundation is in Milestone 1; repository-intelligence expansion
is in contract/provider-spike planning.** Contracts, deterministic fixtures, safe package snapshots,
npm/pnpm importer-aware selection, snapshot-only Node resolution, isolated TypeScript declaration
resolution, and public-API v1 contract/specification are executable or approved. Public symbol
modeling is executable as a pure engine; bounded worker integration, core workflow composition,
CLI/MCP apps, workspace index, retrieval, and context planner remain planned. Package scope,
license, release strategy, and supported platforms remain open.

## Milestone 0: Foundation

- [x] Standalone repository, pnpm workspace, strict TypeScript, static checks, tests, and CI.
- [x] Canonical product, architecture, security, research, roadmap, and planning documents.
- [x] Versioned contract vocabulary, resource budgets, deterministic fixtures, and provider boundary.
- [x] Organizer-first repository-intelligence decision and provider-stack plan.
- [ ] Decide package scope, license, release strategy, and supported platform matrix.

Exit gate: clean clone passes checks; no unresolved publication metadata remains; package and
repository-intelligence directions are recorded without contradictory contracts.

## Milestone 1: Installed Package Foundation

- [x] Versioned request, result, snapshot, evidence, failure, and limit contracts.
- [x] Positive/adversarial npm, pnpm, and linked-workspace fixtures.
- [x] Exact importer, installed package, immutable package snapshot, and normalized manifest.
- [x] Snapshot-only Node runtime and isolated TypeScript declaration resolution.
- [x] Public TypeScript API v1 contract and bounded modeling specification.
- [x] Implement deterministic compiler-backed public-symbol model as a pure engine.
- [ ] Expose public-symbol modeling through the existing isolated worker.
- [ ] Compose installed-investigation application service.
- [ ] Expose equivalent CLI and narrow MCP workflows.

Exit gate: approved importer/package request returns exact artifact, runtime target, declaration
target, bounded public API, and evidence through same core result in CLI and MCP, without network or
package execution.

## Milestone 2: Workspace Snapshot and Inventory

- Specify `WorkspaceSnapshot`, repository/Git dirty-overlay identity, exclusions, and evidence.
- Adopt `@manypkg/get-packages` for generic package enumeration behind existing containment model.
- Normalize workspace packages, build-system projects, TypeScript projects, configuration, and links
  without collapsing their distinct identities.
- Add safe read-only Git identity/change provider.
- Prove npm, pnpm, Yarn, Bun, linked, nested, and TypeScript project-reference fixtures.

Exit gate: one approved monorepo root produces deterministic bounded inventory and explicit partial
results for unsupported regions; safe mode executes no project/package/config/plugin code.

## Milestone 3: Dependency-Aware Lexical Context

- Specify first semantic entities, edges, semantic documents, and retrieval evaluation corpus.
- Normalize module/import graph through bounded dependency-cruiser provider.
- Classify source, tests, configuration, docs, manifests, and package entrypoints with evidence.
- Persist snapshots, facts, evidence, provider runs, documents, and FTS5 rows in SQLite.
- Use Graphology for bounded traversal over project-owned entity/edge data.
- Implement deterministic lexical retrieval plus dependency-neighborhood expansion.
- Prove clean rebuild/incremental equivalence and crash-safe transactional updates.

Exit gate: locate/understand fixture questions meet agreed lexical recall, budget, latency, and
determinism thresholds without embeddings.

## Milestone 4: Compiler Semantic Index and Package Links

- Complete SCIP versus bounded TypeScript-worker indexing spike.
- Normalize definitions, references, occurrences, re-exports, implementations, calls where proven,
  documentation, and source locations.
- Link modules/symbols across TypeScript project references and workspace packages.
- Link local imports/usages to exact installed package snapshots, entrypoints, and public symbols.
- Generate symbol/test/package semantic documents and update FTS index incrementally.
- Keep compiler facts separate from structural or heuristic provider observations.

Exit gate: representative local symbol can be traced through workspace libraries to exact external
package symbol with compiler/resolver evidence at each authoritative step.

## Milestone 5: Context Planner and ContextPack v1

- Freeze closed `BuildContextRequestV1` and `ContextPackV1` schemas.
- Fuse lexical, focus-path, graph, compiler, package, and optional CCE candidates.
- Canonically link/deduplicate, weight authority, diversify, and suppress redundant ranges.
- Allocate explicit token/item budgets across primary code, contracts, dependencies, tests,
  configuration, and history.
- Return selection reasons, relationships, unknowns, warnings, rejected/truncated counts, and
  evidence.
- Add CLI indexing/status/context workflows and thin MCP v2 tools/resources.

Exit gate: agent obtains required context for versioned locate/understand/change/test tasks within
budget, and CLI JSON/MCP structured output validate against same deterministic core result.

## Context Alpha: Expert Retrieval Validation

- Package local index, CLI, and MCP for selected platforms.
- Publish safe-mode, cache, exclusions, redaction, rebuild, and known-limit documentation.
- Run blinded expert review over versioned real-repository and fixture tasks.
- Capture false/missing/redundant context reports as reproducible corpus cases.
- Establish quality, latency, index-size, memory, and incremental-index baselines.

Exit gate: expert evaluator can install product, index representative monorepo, build context for a
task, inspect why every item was chosen, and file reproducible quality/security report.

## Milestone 6: Optional Semantic and Ecosystem Providers

Add only providers that improve named workflows and pass security/evaluation gates:

- Transformers.js embeddings plus `sqlite-vec` hybrid retrieval;
- Nx project graph and Knip framework entrypoints in isolated trusted-workspace mode;
- ast-grep framework enrichers;
- API Extractor and TypeDoc secondary API/documentation cards;
- existing esbuild metafile ingestion;
- optional CCE retrieval and version-matched remote documentation.

Exit gate: each provider demonstrates measurable retrieval/context improvement, typed authority,
bounded lifecycle, and a clean disable/fallback path. Providers without sufficient value are
removed rather than becoming permanent complexity.

## Milestone 7: Unified Package Comparison and Upgrade Impact

- Add restricted exact-version registry snapshots through `pacote`.
- Compare installed/target manifests, exports, runtime requirements, and public APIs.
- Normalize changed package symbols and traverse local symbol/reference/test/project links.
- Add bounded `publint` and ATTW diagnostics against same immutable bytes.
- Build migration context containing exact package changes, affected/unaffected local usages, tests,
  configuration, and validation commands.

Exit gate: representative package upgrade produces reproducible definite/potential/unaffected impact
and a budgeted migration `ContextPack` with exact artifact and local-source evidence.

## Milestone 8: Runtime and Framework Evidence

- Ingest existing coverage, test manifests/results, source maps, and build/runtime metadata through
  explicit providers.
- Add framework relationships only when compiler/static evidence and fixtures define semantics.
- Add opt-in runtime observation without granting default indexer arbitrary execution authority.
- Connect runtime/build evidence to static entities without overriding static identity.

Exit gate: selected debug/impact workflows gain reproducible runtime/build evidence under explicit
capabilities, provenance, and resource limits.

## Permanent Product Rules

- Wrap maintained tool first; replace only after measured gap.
- Provider object/schema never becomes public domain contract.
- Search discovers candidates; deterministic ecosystem intelligence establishes facts.
- Package and workspace snapshots remain distinct and linked.
- Lexical path ships before vectors; vectors require measured improvement.
- Safe mode never executes package code, project config/plugins, builds, or hooks.
- Context planner returns evidence-backed context; consuming agent owns final prose generation.
