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

- Developers integrating or upgrading Node and TypeScript dependencies.
- Coding agents that need a bounded, machine-readable dependency investigation interface.
- Maintainers diagnosing package publication and compatibility problems.

## Goals

1. Resolve the exact installed package instance and requested subpath from a chosen importer.
2. Build immutable installed and registry package snapshots with content identity and evidence.
3. Model public APIs with the TypeScript compiler rather than regex-only parsing.
4. Compare entry points, symbols, signatures, members, manifests, runtime constraints, and
   diagnostics across exact versions.
5. Relate package changes to local project usages.
6. Present provider results with explicit authority, provenance, limits, warnings, and uncertainty.
7. Support both human-friendly CLI workflows and stable MCP tools through the same core APIs.

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

## First Delivery Slice

The first delivery slice is a local, network-free installed-package investigation through the CLI.
Given an approved workspace root, importer, and package specifier, it identifies the exact installed
artifact, Node runtime target, TypeScript declaration target, and compiler-backed public API with
bounded evidence and without executing package code.

Registry retrieval, specialist diagnostics, semantic comparison, local usage impact, and MCP build
on that proven core in later roadmap milestones.

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
