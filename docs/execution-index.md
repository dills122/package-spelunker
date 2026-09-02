# Active Execution Index: Installed Foundation and Repository Intelligence

- Status: Active
- Updated: 2026-09-01
- Active branch: `codex/rag-architecture-plan`
- Installed foundation plan: [`implementation-plan.md`](implementation-plan.md)
- Expansion plan: [`repository-intelligence-implementation-plan.md`](repository-intelligence-implementation-plan.md)
- Provider plan: [`research/repository-intelligence-provider-stack.md`](research/repository-intelligence-provider-stack.md)
- Candidate research: [`research/repository-intelligence-technology-deep-dive.md`](research/repository-intelligence-technology-deep-dive.md)

## Objective and Completion Boundary

Complete installed-package foundation without discarding it, then deliver one evidence-backed,
budgeted `ContextPack` for a TypeScript/JavaScript monorepo. Current cycle records product/technical
contracts, validates provider choices, and orders implementation slices before dependencies or
public workspace contracts are added.

## Work Items

| ID | Work item | Status | Completion evidence |
| --- | --- | --- | --- |
| DIR-001 | Accept organizer-first repository-intelligence direction | complete | ADR 0006 |
| STACK-001 | Validate and classify provider technologies | complete for planning | provider stack plus deep-dive comparisons, primary sources, restrictions, spikes, scorecard, and gates |
| PLAN-001 | Reconcile product, architecture, security, roadmap, and implementation slices | complete | canonical docs, repository-intelligence plan, tests/build, links, and diff checks |
| M1-I01 | Implement bounded public TypeScript symbol engine | pending | approved M1.7 spec, fixtures, worker operation, tests |
| M1-I02 | Compose installed investigation and thin CLI/MCP | pending | equivalent core/CLI/MCP contract results |
| R0-C01 | Specify WorkspaceSnapshot, semantic entity/edge, and ContextPack v1 | pending | approved specs, TypeBox schemas, golden success/partial/failure cases |
| R0-E01 | Create retrieval/context evaluation corpus | pending | versioned questions with required/useful/irrelevant/forbidden ranges |
| R0-A01 | Workspace/module provider spike | pending | Manypkg/dependency-cruiser plus detected topology/runtime candidates; coverage, isolation, limits, metrics |
| R0-B01 | Symbol/API provider spike | pending | SCIP/API Extractor comparison against bounded TypeScript worker |
| R0-C02 | SQLite/FTS/Graphology spike | pending | dual FTS lanes, schema, incremental equivalence, retrieval quality, latency, size |
| R0-W01 | Ignore/watcher incrementality spike | pending | manifest truth plus lost/duplicate/reordered event convergence and platform evidence |
| R1-I01 | Implement immutable workspace inventory | blocked on R0 contracts/spikes | Milestone 2 exit gate |

## Coordination Rules

- Installed-package schema version 1 remains stable; workspace/context workflows receive separate
  versioned contracts.
- Provider spike output never becomes public contract directly.
- Add dependency only when owning implementation slice starts and adoption gate passes.
- Safe mode cannot execute package code, project configuration/plugins, builds, or hooks.
- Update canonical docs and cross-session decision/code-area memory with each accepted slice.
- Run `pnpm check`, `pnpm build`, and `git diff --check` before delivery.

## Immediate Sequence

1. Finish and review current documentation realignment.
2. Complete M1 public-symbol/core composition work or explicitly schedule it beside R0 spikes.
3. Write `WorkspaceSnapshot`, semantic entity/edge, and `ContextPack` specifications.
4. Build evaluation corpus before implementing ranking.
5. Run provider Spikes A–C; accept or reject providers with evidence.
6. Implement Milestone 2 workspace inventory as first repository-intelligence vertical slice.
