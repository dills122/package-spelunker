# ADR 0006: Organizer-First Repository Intelligence

- Status: Accepted
- Date: 2026-09-01

## Context

Package Spelunker's importer-aware resolution, immutable package snapshots, evidence model, and
bounded TypeScript worker also form a strong base for TypeScript/JavaScript repository
intelligence. The product is expanding from package investigation into workspace indexing,
retrieval, impact analysis, and task-specific context construction for coding agents.

Mature tools already solve much of the mechanical work: workspace discovery, project and module
graphs, symbol/reference indexing, API extraction, documentation models, full-text search, vector
search, and graph algorithms. Reimplementing those capabilities would enlarge the maintenance
surface without differentiating the product.

At the same time, no single provider owns the exact workspace, compiler, package, evidence, and task
context needed by Package Spelunker. Provider-specific objects and scores cannot become public
contracts, and fuzzy retrieval cannot override compiler or resolver facts.

## Decision

Expand Package Spelunker into an evidence-backed repository-intelligence and retrieval engine for
TypeScript, JavaScript, Node.js, and monorepos. Installed-package investigation remains a first-class
workflow over the same underlying truth.

Adopt an organizer-first boundary:

- existing tools produce workspace, project, module, symbol, reference, API, documentation, search,
  and build-graph observations;
- provider adapters normalize those observations into project-owned entities, edges, evidence,
  authority, warnings, and failures;
- Package Spelunker owns canonical identity, snapshot binding, cross-provider linking, conflict
  handling, candidate fusion, graph expansion, ranking, context budgeting, and versioned workflow
  contracts;
- retrieval discovers candidates; deterministic compiler, resolver, snapshot, and workspace facts
  establish meaning;
- the core returns evidence-backed context and analyses; the consuming coding agent owns final
  natural-language generation.

Keep `WorkspaceSnapshot` and `PackageSnapshot` distinct. A workspace snapshot identifies repository
state, projects, compiler contexts, and a dirty overlay. A package snapshot identifies exact
artifact bytes, package coordinates, and importer context. Typed edges may link them, but neither is
generalized into the other.

Preserve installed-package schema version 1. New workspace indexing and `ContextPack` workflows use
separate closed, major-versioned contracts under ADR 0003.

Prefer integration in this order:

1. stable programmatic library over supplied immutable inputs;
2. isolated programmatic library or process with a normalized protocol;
3. stable SDK or HTTP provider;
4. external MCP provider;
5. CLI-only integration when no safer stable surface exists.

An existing tool is adopted only after a fixture-backed spike proves useful coverage, deterministic
normalization, supported runtime compatibility, acceptable license and security posture, bounded
resource behavior, and a safe execution model. Replace a provider only when measured correctness,
security, performance, or maintenance gaps justify owning the missing behavior.

## Consequences

- Product work concentrates on canonical model, evidence, linking, retrieval quality, and context
  planning instead of generic analyzer implementation.
- Provider versions and schemas remain internal and replaceable.
- Provider disagreement is retained as evidence instead of flattened into false certainty.
- Some useful analyzers require trusted-workspace opt-in because they load project configuration or
  plugins. Default static inspection remains non-executing.
- Persistent workspace indexes, incremental invalidation, retrieval evaluation, and model artifact
  policy become core infrastructure.
- “Full RAG” means ingestion, indexing, lexical and optional semantic retrieval, deterministic graph
  enrichment, candidate fusion, reranking, and budgeted context assembly. It does not make an LLM
  answer authoritative.

