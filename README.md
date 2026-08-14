# Package Spelunker

Package Spelunker is a workspace-aware Node package investigation engine. It will resolve the exact
package artifact and entry point used by a project, model its public TypeScript API, compare package
versions, relate changes to local usages, and combine specialist diagnostics into one evidence-backed
report.

The project is intentionally core-first: a normal TypeScript library owns the analysis, while the
CLI and MCP server remain thin interfaces over the same contracts.

> Status: Milestone 0 closure and Milestone 1 implementation. The first executable domain package
> defines versioned request/result contracts, and the deterministic fixture harness now constrains
> the first analysis engines. Package-analysis engines and applications remain planned.

## Why This Exists

Understanding a dependency currently requires manual searches through `node_modules`, manifests,
conditional exports, declaration re-exports, lockfiles, documentation, and package-quality tools.
Those sources often inspect different versions or answer different questions.

Package Spelunker anchors an investigation to one immutable package snapshot and one importer
context, then preserves evidence and authority as results move through the system.

## Planned Capabilities

- Discover npm, pnpm, Yarn, and Bun workspace context.
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

## Architecture at a Glance

```text
CLI ───────┐
           ├── application service ── canonical snapshots and evidence
MCP ───────┘              │
                          ├── workspace and resolution engines
                          ├── TypeScript symbol and usage engines
                          ├── semantic API diff
                          └── isolated provider adapters
                              ├── pacote
                              ├── publint
                              ├── @arethetypeswrong/core
                              └── optional external enrichment
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
- application, snapshot, resolver, and compiler packages remain planned;
- package scope, license, release intent, and supported platform matrix remain open.

The next implementation task is safe installed snapshot construction using the containment,
symlink, malformed-manifest, and byte-boundary fixtures. The broader delivery target remains an
installed-package CLI investigation: from an approved workspace, importer, and package specifier,
identify the exact artifact, runtime target, declaration target, and compiler-backed public API with
bounded evidence and without executing package code.

See the [initial implementation plan](docs/implementation-plan.md) for task order, acceptance
criteria, decision checkpoints, and milestone gates.

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
