# Package Spelunker

Package Spelunker is an evidence-backed repository-intelligence and retrieval engine for
TypeScript, JavaScript, Node.js, and monorepos. It organizes existing ecosystem analyzers into one
canonical model, links workspace code to exact package APIs, and compiles task-specific context for
coding agents.

The project is intentionally core-first: a normal TypeScript library owns the analysis, while the
CLI and MCP server remain thin interfaces over the same contracts.

> Status: installed-package Milestone 1 implementation plus repository-intelligence contract and
> provider planning. Package contracts, fixtures, snapshots, importer-aware selection, Node/TypeScript
> resolution, and deterministic public-API symbol modeling are executable. Bounded public-API worker
> integration, application composition, workspace index, retrieval, context planner, CLI, and MCP
> remain planned.

## Why This Exists

Understanding or changing a monorepo currently requires manual reconciliation across text search,
project/module graphs, compiler symbols, references, tests, configuration, Git state,
`node_modules`, lockfiles, documentation, and package tools. Those sources expose different
identities, authority, and incomplete views.

Package Spelunker anchors analysis to explicit workspace and package snapshots, normalizes provider
observations, preserves evidence/authority, links local code to exact dependency APIs, and returns
only context relevant to task and budget.

## Planned Capabilities

- Snapshot and index npm, pnpm, Yarn, and Bun monorepos without executing project/package code.
- Normalize workspace packages, projects, TypeScript projects, files, modules, symbols, tests,
  configuration, package APIs, and relationships.
- Use existing workspace/module/symbol/API/search/graph tools behind bounded provider adapters.
- Retrieve lexically first, optionally add semantic candidates, and verify/expand through
  deterministic graphs, compiler facts, and exact package resolution.
- Produce versioned, evidence-backed `ContextPack` values within explicit token/item budgets.
- Resolve an installed package from an exact importer under Node and TypeScript semantics.
- Enumerate public entry points, exports, symbols, signatures, members, overloads, and JSDoc.
- Retrieve and verify exact registry artifacts without accepting Git, directory, file, or arbitrary
  URL package specifications.
- Compare normalized export maps, public APIs, manifests, runtime requirements, and diagnostics.
- Find affected local usages for package upgrades.
- Normalize optional `publint`, Are the Types Wrong, documentation, and package-health results.
- Expose the same engine through a CLI and an MCP server.

## Non-Negotiable Principles

1. Never import, require, or execute inspected package code.
2. Tie every conclusion to an exact installed artifact or verified registry tarball.
3. Resolve from the actual importer and project configuration when answering project-specific
   questions.
4. Keep authoritative facts, diagnostics, enrichment, and heuristics visibly distinct.
5. Bound filesystem, archive, network, memory, worker, and output consumption.
6. Treat MCP as a transport, not the domain architecture.
7. Wrap proven analyzers first; own only canonical model, evidence, linking, fusion, and planning.
8. Treat retrieval/model output as candidates, never authoritative compiler or resolver facts.

## Architecture at a Glance

```text
CLI ───────┐
           ├── application service ── workspace/package snapshots + evidence
MCP ───────┘              │
                          ├── normalized semantic graph and exact resolvers
                          ├── SQLite facts/FTS + bounded graph traversal
                          ├── candidate fusion and context planner
                          └── provider adapters
                              ├── workspace/module/symbol/API analyzers
                              ├── package/diagnostic analyzers
                              └── optional vectors, frameworks, and remote enrichment
```

See [Architecture](docs/architecture.md), [Security model](docs/security-model.md), and
[Roadmap](docs/roadmap.md) for the current design.

## Repository Layout

```text
apps/       Thin CLI and MCP process/transport packages
packages/   Domain contracts, engines, providers, and worker adapters
fixtures/   Deterministic compatibility and adversarial package fixtures
docs/       Product, architecture, decisions, research, and handoff context
```

## Current Phase

The repository is at the boundary between architecture and implementation:

- the product brief, architecture, security model, roadmap, and five foundation ADRs are established;
- Node 22.22.1, pnpm 10.23.0, strict TypeScript, Biome, Vitest, and CI are configured;
- the GitHub remote, `main` default branch, initial commit, and clean-clone check are established;
- versioned result envelopes and the first-slice resource/fixture policy are accepted in ADRs 0003
  and 0004;
- `packages/contracts` implements the installed-package v1 request/result schemas, schema-derived
  types, normalized validators, and first-slice resource vocabulary;
- golden and adversarial contract tests prove the current serialized boundary;
- `packages/test-fixtures` provides inert npm, pnpm, workspace-link, and generated security cases;
- `packages/package-snapshot` enforces approved/artifact-root containment, bounded descriptor reads,
  normalized manifests, and deterministic in-memory content identity without executing package code;
- `packages/workspace-model` validates safe package specifiers, discovers npm/pnpm importer and
  configuration context, and selects the exact importer-nearest installed or linked package root;
- `packages/node-resolution` resolves Node 22 export maps and legacy runtime targets from immutable
  snapshots under explicit import/require conditions, with bounded traces and no package execution;
- `packages/typescript-resolution` uses the pinned TypeScript 6 compiler to resolve declaration
  targets under Node16/NodeNext project configuration without ambient filesystem access;
- `packages/worker-typescript` runs that compiler in a bounded child and brokers immutable snapshot
  bytes plus memoized, contained workspace metadata for npm, pnpm, and linked packages;
- `packages/typescript-symbols` implements the accepted public API v1 model with deterministic
  exports, aliases, declarations, signatures, members, documentation, partial results, and limits;
- bounded worker integration for public API modeling and application composition remain planned;
- package scope, license, release intent, and supported platform matrix remain open.

Near-term work moves public TypeScript API modeling into the existing bounded worker and composes the
installed-investigation workflow while running provider/storage spikes for repository intelligence.
First new vertical slice produces deterministic workspace inventory; following slices add
dependency-aware lexical context, persistent FTS, compiler symbol/package links, and budgeted
`ContextPack` delivery.

See the [initial implementation plan](docs/implementation-plan.md) for task order, acceptance
criteria, decision checkpoints, and installed-package gates. See the
[repository-intelligence implementation plan](docs/repository-intelligence-implementation-plan.md)
for expanded slices and the [provider stack](docs/research/repository-intelligence-provider-stack.md)
for planned technologies and adoption gates. See the
[technology deep dive](docs/research/repository-intelligence-technology-deep-dive.md) for candidate
comparisons and experiment scorecards.

## Development Setup

Requirements:

- Node.js 22.22.1 or newer within Node 22
- pnpm 10.23.0

```sh
corepack enable
pnpm install
pnpm check
```

Common commands:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Documentation

- [Product brief](docs/product-brief.md)
- [Architecture](docs/architecture.md)
- [Security model](docs/security-model.md)
- [Roadmap](docs/roadmap.md)
- [Initial implementation plan](docs/implementation-plan.md)
- [Repository-intelligence implementation plan](docs/repository-intelligence-implementation-plan.md)
- [Repository-intelligence provider stack](docs/research/repository-intelligence-provider-stack.md)
- [Repository-intelligence technology deep dive](docs/research/repository-intelligence-technology-deep-dive.md)
- [Current handoff](docs/handoff.md)
- [Architecture decisions](docs/decisions/)
- [Initial ecosystem research](docs/research/ecosystem-and-provider-research.md)

## Relationship to `inspect-node-package-api`

The lightweight `inspect-node-package-api` skill in AI Central remains the small, dependency-free
installed-package inspector. Package Spelunker is a separate product for importer-aware semantic
analysis, registry snapshots, diagnostics, API comparison, and local usage impact. AI Central can
eventually provide a thin skill that teaches agents when to use this CLI or MCP server.

## License

No public license has been selected. The package is currently private and marked `UNLICENSED`.
