# Product Brief

## Product Statement

Package Spelunker is an evidence-backed repository-intelligence and retrieval engine for
TypeScript, JavaScript, Node.js, and monorepos. It organizes existing ecosystem analyzers into one
canonical model of workspaces, projects, files, symbols, packages, tests, configuration, and their
relationships, then compiles that model into task-specific context for coding agents.

Installed-package investigation remains a first-class workflow. Its exact artifact, importer,
runtime, declaration, and public API facts connect to local workspace symbols and usages rather than
living in a separate product.

Package Spelunker is not a collection of thin wrappers and does not reimplement mature analyzers.
Its differentiated value is canonical identity, deterministic orchestration, normalization,
evidence and authority, cross-provider entity linking, candidate fusion, graph expansion, context
budgeting, and importer-aware package truth.

## Problem

Developers and coding agents need reliable answers to questions such as:

- Which files, symbols, tests, configuration, and dependency contracts matter for this task?
- How does this subsystem work across packages and projects in a monorepo?
- What will a proposed change affect, and which validation commands should run?
- What can I import from the installed version of this package and subpath?
- Which declaration and runtime files does this exact importer receive?
- How do ESM, CommonJS, TypeScript, conditions, and workspace layout change that answer?
- What changed between the installed version and an exact candidate release?
- Which local call sites will need changes?
- Is a discrepancy an authoritative API fact, a publication diagnostic, documentation guidance, or
  only a heuristic?

Today those answers require manual, error-prone reconciliation across source search, project graphs,
compiler symbols, references, tests, configuration, Git state, `node_modules`, manifests, lockfiles,
registry artifacts, quality tools, and documentation. Generic chunk retrieval finds related text but
does not reliably establish what a symbol means, which package instance an importer receives, or
why a context item belongs in the answer.

## Primary Users

- Coding agents that need bounded, machine-readable repository and dependency context.
- Node and TypeScript experts who validate whether agent-facing answers are correct, complete, and
  supported by the cited evidence.
- Developers understanding, changing, debugging, testing, and upgrading TypeScript/JavaScript
  monorepos through direct CLI use.
- Maintainers diagnosing package publication and compatibility problems.

## Goals

1. Build immutable workspace and package snapshots with explicit identity and evidence.
2. Normalize workspace packages, projects, TypeScript projects, files, modules, symbols, tests,
   configuration, and package APIs without leaking provider-specific objects.
3. Reuse mature analyzers for bulk mechanics and retain bounded compiler/resolver paths for exact
   semantic questions.
4. Link local code through workspace packages and imports to exact installed package entrypoints and
   external symbols.
5. Retrieve candidates lexically and optionally semantically, then enrich and verify them through
   deterministic graph, compiler, resolver, and snapshot facts.
6. Produce task-specific, evidence-backed `ContextPack` values within explicit token/item budgets.
7. Compare package/workspace changes and relate them to affected and unaffected local usages.
8. Present provider results with explicit authority, provenance, limits, warnings, and uncertainty.
9. Support stable agent-facing MCP tools and human-friendly CLI workflows through the same core APIs.

## Non-Goals for the First Release

- Executing package code to discover runtime exports.
- Installing arbitrary package specifications or running package-manager pack/build scripts.
- Acting as a general vulnerability scanner, documentation crawler, package popularity service, or
  autonomous coding agent.
- Supporting every loader, bundler, Plug'n'Play mode, or runtime before the core Node/TypeScript path
  is correct and fixture-backed.
- Replacing `publint`, Are the Types Wrong, API Extractor, Context7, or ecosystem health tools.
- Allowing nested MCP orchestration when a stable library or HTTP/SDK integration exists.
- Treating embeddings, retrieval scores, LLM output, framework patterns, or provider consensus as
  authoritative compiler/resolver facts.
- Building custom workspace discovery, module graphs, symbol interchange, search engines, vector
  stores, or graph algorithms when a safe maintained tool satisfies the accepted contract.

## Initial User Workflows

### Build task context

Given an approved workspace, task, optional focus, and context budget, identify primary code plus
supporting contracts, dependencies, tests, configuration, history, package APIs, relationships,
unknowns, and evidence. Explain why each item was selected and which candidates were rejected or
truncated.

### Understand or trace workspace behavior

Locate relevant projects and symbols using lexical retrieval, then traverse compiler-backed and
workspace/package relationships to explain definitions, references, callers, implementations,
tests, configuration, and exact dependency APIs.

### Analyze local change impact

Given changed paths or symbols, identify affected projects, files, callers, tests, package
boundaries, and validation commands while keeping definite, potential, unaffected, and unknown
results distinct.

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

## Repository Context Alpha Delivery Slice

The next product alpha after the installed-package foundation is local, network-free context
construction for a TypeScript/JavaScript monorepo. Given an approved root, task, optional focus, and
budget, it creates a workspace snapshot, indexes project/module/symbol facts, retrieves and expands
candidates, links applicable package facts, and returns one versioned `ContextPack` through the core
library, CLI, and MCP.

Lexical retrieval ships first. Embeddings, vectors, Nx/Knip trusted-workspace analysis, framework
enrichers, registry access, and remote documentation are separately enabled later capabilities.

### Repository Context Alpha Success Criteria

- Agent receives required primary code, contracts, tests, configuration, and dependency context for
  versioned fixture tasks within configured budget.
- Every context item has selection reasons, normalized identity, snapshot binding, and evidence.
- npm, pnpm, Yarn, Bun, linked-package, and TypeScript project-reference layouts are represented or
  return explicit unsupported partial results.
- Incremental indexing equals clean rebuild for unchanged logical input.
- Safe mode never executes package code, project configuration, plugins, builds, or Git hooks.
- CLI JSON and MCP structured output validate against same versioned contracts.

## Broader Product Success Criteria

- Creates deterministic workspace snapshots and normalized project/file/symbol/package graphs.
- Retrieves and expands task context within explicit budgets with measurable quality.
- Links local symbols/usages through workspace packages to exact installed package APIs.
- Persists/rebuilds/indexes incrementally without stale fact leakage.
- Produces equivalent versioned `ContextPack` results through core, CLI, and MCP.
- Correctly discovers representative npm, pnpm, and workspace fixture layouts.
- Resolves an exact installed package from an importer under Node and TypeScript contexts.
- Produces a stable snapshot and evidence manifest without executing package code.
- Enumerates compiler-backed exports and signatures from selected declaration entry points.
- Fetches one exact registry version through a registry-only interface.
- Runs bounded `publint` and ATTW diagnostics against the same snapshot bytes.
- Compares two snapshots and emits a normalized report through both CLI and MCP adapters.
- Passes deterministic compatibility and adversarial security fixtures.

## Open Product Questions

- Which first evaluation corpus and thresholds define acceptable retrieval/context quality?
- Which MCP tool granularity best balances indexing lifecycle with coherent context workflows?
- Which cache, exclusion, dirty-overlay, redaction, and trusted-workspace policies should ship?
- Which embedding model, if any, improves the lexical-plus-graph baseline enough to justify cost?
- Which documentation provider, if any, should be the first optional enrichment integration?
- What project name, package scope, license, and public distribution model should be finalized?
