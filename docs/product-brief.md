# Product Brief

## Product Statement

Package Spelunker is a package-investigation orchestrator with a canonical package model. It turns
the exact dependency graph, selected package artifacts, resolver context, semantic TypeScript API,
specialist diagnostics, documentation, and local usages into one coherent investigation.

It is not a collection of thin wrappers over unrelated MCP servers, and it does not reimplement
every ecosystem analyzer. Its differentiated value is deterministic orchestration, normalization,
provenance, importer-aware resolution, semantic API modeling, and local impact analysis.

## Problem

Developers and coding agents need reliable answers to questions such as:

- What can I import from the installed version of this package and subpath?
- Which declaration and runtime files does this exact importer receive?
- How do ESM, CommonJS, TypeScript, conditions, and workspace layout change that answer?
- What changed between the installed version and an exact candidate release?
- Which local call sites will need changes?
- Is a discrepancy an authoritative API fact, a publication diagnostic, documentation guidance, or
  only a heuristic?

Today those answers require manual, error-prone reconciliation across `node_modules`, manifests,
lockfiles, `tsconfig`, declaration graphs, registry artifacts, quality tools, documentation, and
source usage.

## Primary Users

- Coding agents that need a bounded, machine-readable dependency investigation interface.
- Node and TypeScript experts who validate whether agent-facing answers are correct, complete, and
  supported by the cited evidence.
- Developers integrating or upgrading Node and TypeScript dependencies through direct CLI use.
- Maintainers diagnosing package publication and compatibility problems.

## Goals

1. Resolve the exact installed package instance and requested subpath from a chosen importer.
2. Build immutable installed and registry package snapshots with content identity and evidence.
3. Model public APIs with the TypeScript compiler rather than regex-only parsing.
4. Compare entry points, symbols, signatures, members, manifests, runtime constraints, and
   diagnostics across exact versions.
5. Relate package changes to local project usages.
6. Present provider results with explicit authority, provenance, limits, warnings, and uncertainty.
7. Support stable agent-facing MCP tools and secondary human-friendly CLI workflows through the
   same core APIs.

## Non-Goals for the First Release

- Executing package code to discover runtime exports.
- Installing arbitrary package specifications or running package-manager pack/build scripts.
- Acting as a general vulnerability scanner, documentation crawler, or package popularity service.
- Supporting every loader, bundler, Plug'n'Play mode, or runtime before the core Node/TypeScript path
  is correct and fixture-backed.
- Replacing `publint`, Are the Types Wrong, API Extractor, Context7, or ecosystem health tools.
- Allowing nested MCP orchestration when a stable library or HTTP/SDK integration exists.

## Initial User Workflows

### Inspect an installed API

Given a workspace root, importer, and package specifier, report the exact package instance, export
condition path, declaration/runtime targets, public symbols, signatures, source locations, and
evidence.

### Evaluate an upgrade

Resolve the installed artifact, retrieve one exact target version, create comparable snapshots,
run semantic and diagnostic analyses, classify changes, find affected usages, and return one report.

### Explain a resolution discrepancy

Show how Node and TypeScript resolve the same specifier from an importer, including active config,
conditions, package instance, selected files, and conflicting publication diagnostics.

## Alpha 1 Delivery Slice

Alpha 1 is a local, network-free installed-package investigation for AI coding agents, with Node and
TypeScript experts evaluating answer correctness. Given an approved workspace root, importer, and
package specifier, it identifies the exact installed artifact, Node runtime target, TypeScript
declaration target, and compiler-backed public API with bounded evidence and without executing
package code.

The primary alpha interface is one coherent MCP investigation tool. A secondary CLI exposes the
same core result for direct questions, debugging, and transport-equivalence testing. Registry
retrieval, specialist diagnostics, semantic comparison, local usage impact, and remote enrichment
remain later roadmap milestones.

### Alpha 1 Success Criteria

- An agent can inspect one locally installed package from an explicit importer through MCP.
- MCP and CLI return equivalent normalized results from the same application service.
- npm, pnpm, and linked-workspace fixtures produce exact artifact, runtime, declaration, public API,
  and evidence results without network access or package execution.
- Expert evaluators can reproduce and report an incorrect, incomplete, or misleading answer from a
  versioned request/result pair and bounded evidence.

Alpha 1 does not replace the broader first release described below. It validates the authoritative
installed-package foundation before registry comparison, diagnostics, semantic impact, and the
expanded MCP surface freeze additional behavior.

## Success Criteria for the First Release

- Correctly discovers representative npm, pnpm, and workspace fixture layouts.
- Resolves an exact installed package from an importer under Node and TypeScript contexts.
- Produces a stable snapshot and evidence manifest without executing package code.
- Enumerates compiler-backed exports and signatures from selected declaration entry points.
- Fetches one exact registry version through a registry-only interface.
- Runs bounded `publint` and ATTW diagnostics against the same snapshot bytes.
- Compares two snapshots and emits a normalized report through both CLI and MCP adapters.
- Passes deterministic compatibility and adversarial security fixtures.

## Open Product Questions

- Which MCP tool granularity best balances discoverability with coherent investigations?
- How deep should local usage indexing go in the first release versus later expansion?
- Which documentation provider, if any, should be the first optional enrichment integration?
- What project name, package scope, license, and public distribution model should be finalized?
