# Roadmap

The roadmap is vertical-slice oriented. Each milestone should produce a usable investigation path,
not a collection of disconnected framework packages.

Current status: **Milestone 1 implementation is in progress; Milestone 0 has one publication decision
open.** Root tooling, CI, contracts, resource policy, deterministic fixtures, safe snapshot
construction, and npm/pnpm importer-aware package selection are executable. Package scope, license,
release strategy, and supported platforms remain D1. Snapshot-only Node runtime resolution is also
executable. The task-level path through Milestones 0 and 1 is maintained in
[`implementation-plan.md`](implementation-plan.md).

## Milestone 0: Foundation

- [x] Standalone repository, pnpm workspace, strict TypeScript, static checks, test runner, and CI
      configuration.
- [x] Canonical product, architecture, security, research, roadmap, planning, and handoff
      documentation.
- [x] AI Central project steering and relevant skill bundles.
- [x] Configure the GitHub remote and `main` default branch, create the initial commit, and prove the
      clean-clone install/check workflow.
- [x] Define versioned contract vocabulary and first-slice resource budgets with representative
      envelopes and a paired fixture matrix.
- [ ] Decide package scope, license, release strategy, and supported platform matrix.

Exit gate: a clean clone can install and run all checks; no template placeholders or unresolved
publication metadata remain; the first-slice contracts, budgets, and fixture matrix are approved.

## Milestone 1: Installed Package Investigation

- [x] Define versioned request, error, snapshot, evidence, and result contracts.
- [x] Build deterministic positive/adversarial fixture workspaces.
- [x] Discover workspace, importer, package manager, and exact installed package root.
- [x] Normalize package manifest and export metadata without evaluating package code.
- [x] Resolve the Node runtime target from an explicit importer, package subpath, and conditions.
- Resolve the TypeScript declaration target from explicit importer and project configuration.
- Build compiler-backed entrypoint and public-symbol exploration.
- Ship a CLI command and deterministic npm/pnpm/workspace fixtures.

Exit gate: the CLI answers what an importer can use from an installed package with file-level
evidence and passes adversarial path, symlink, cycle, and size fixtures.

## Milestone 2: Exact Registry Snapshots

- Add structured registry name plus exact-version requests through a restricted `pacote` adapter.
- Verify integrity and create bounded immutable tarball snapshots.
- Add safe archive inspection/extraction and snapshot caching.
- Compare installed and registry manifests, exports, engines, and public symbols.

Exit gate: one exact target release can be compared reproducibly without lifecycle scripts, Git,
directories, files, or arbitrary URLs.

## Milestone 3: Specialist Diagnostics

- Add `publint` against supplied snapshot files/tarball with automatic packing disabled.
- Add bounded ATTW isolation with normalized diagnostic contracts.
- Ensure all providers consume the same snapshot and cannot independently refetch.
- Add cancellation, timeout, crash, malformed-output, and resource-limit fixtures.

Exit gate: diagnostics enrich the canonical investigation without becoming authoritative resolution
or destabilizing the host process.

## Milestone 4: Semantic Upgrade Impact

- Normalize semantic API changes and classification rationale.
- Index workspace imports and relevant TypeScript usages.
- Relate changed symbols and signatures to affected and unaffected local code.
- Produce one upgrade report with definite changes, potential changes, diagnostics, and evidence.

Exit gate: representative upgrades identify required source edits with verified local locations.

## Milestone 5: MCP Interface

- Design MCP tools around coherent investigation workflows and evidence pagination.
- Keep tool handlers as adapters over the existing core service.
- Version schemas, errors, capabilities, and server metadata.
- Add MCP transport lifecycle, cancellation, authorization-root, and output-boundary tests.

Exit gate: MCP and CLI produce equivalent normalized results from the same core contracts.

## Later Enrichment

- Version-aware documentation through a Context7-style SDK/API provider.
- Package health and ecosystem intelligence through an optional provider.
- Formal API Extractor reports for compatible declaration entry points.
- Additional loaders, Yarn Plug'n'Play, Bun, bundler-specific conditions, and ecosystem resolvers.

Enrichment cannot block or redefine the correctness of the core local/verified-artifact answer.
