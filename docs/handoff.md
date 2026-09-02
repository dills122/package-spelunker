# Handoff: Organizer-First Repository Intelligence Plan

- Updated: 2026-09-01
- Handoff status: Current
- Product status: installed-package Milestone 1 plus repository-intelligence expansion planning
- Active branch: `codex/rag-architecture-plan`

## Objective and Boundary

Continue Package Spelunker as an evidence-backed retrieval and repository-intelligence engine for
TypeScript, JavaScript, Node.js, and monorepos. Preserve installed-package investigation as a
first-class workflow and reuse existing tools for mechanical analysis. Project-owned differentiation
is canonical identity/model, evidence/authority, provider normalization, cross-tool linking,
candidate fusion, bounded graph expansion, and task-specific context planning.

## Accepted Direction

- [ADR 0006](decisions/0006-organizer-first-repository-intelligence.md) owns organizer-first product
  boundary.
- [`product-brief.md`](product-brief.md) owns workspace/package/context workflows and alpha outcomes.
- [`architecture.md`](architecture.md) owns snapshots, semantic model, provider modes, index, and
  context-planner boundaries.
- [`security-model.md`](security-model.md) owns safe-static, isolated-static, trusted-workspace,
  persistent-index, retrieval, and model-artifact controls.
- [`roadmap.md`](roadmap.md) owns vertical milestones.
- [`repository-intelligence-implementation-plan.md`](repository-intelligence-implementation-plan.md)
  owns R0–R8 ordered slices and exit gates.
- [`research/repository-intelligence-provider-stack.md`](research/repository-intelligence-provider-stack.md)
  owns technology status, restrictions, spikes, metrics, and primary sources.

## Existing Executable Foundation

- Closed installed-package v1 contracts, validators, golden examples, and resource vocabulary.
- Deterministic npm/pnpm/linked positive and adversarial fixtures.
- Containment-aware immutable installed/workspace package snapshots.
- Importer-aware npm/pnpm package selection.
- Snapshot-only Node 22 runtime resolution.
- Pinned TypeScript 6 declaration resolution in bounded child with brokered filesystem.
- Approved/executable public API v1 contract and bounded modeling specification.

Public-symbol engine, worker public-API operation, application composition, CLI, and MCP remain
pending. Do not mark Milestone 1 complete from contract work alone.

## Planned Provider Stack

Immediate adoption after focused spikes:

- `@manypkg/get-packages` for generic workspace packages;
- dependency-cruiser for module graph;
- SQLite through `better-sqlite3` plus FTS5 for facts and lexical retrieval;
- Graphology for bounded in-memory traversal;
- Git CLI with fixed safe arguments for repository identity/change context;
- `@modelcontextprotocol/server` v2 for thin MCP transport.

Compatibility spikes:

- SCIP/`scip-typescript` for bulk symbols/references versus extending TypeScript worker;
- API Extractor for secondary API reports/model;
- package-manager-detector for generic package-manager hints.

Optional later providers:

- Nx, Knip, ast-grep, TypeDoc, esbuild metafiles, CCE;
- Transformers.js embeddings and `sqlite-vec` only after lexical baseline evaluation;
- existing `pacote`, `publint`, and ATTW package providers for unified upgrade impact.

Orama, LanceDB, LangChain, Mastra, ts-morph, TSQuery, and custom parser/search/vector systems are not
current foundations. Reconsider only from measured gap.

## Key Security Decisions

- Default safe mode never executes package code, project config/plugins, build tools, or Git hooks.
- Nx/Knip and similar tools require explicit isolated trusted-workspace capability.
- Provider output and retrieved text are untrusted data, not instructions.
- SQLite rows bind to snapshot/provider/schema/normalizer/exclusion identities; embeddings also bind
  model/revision/hash/dimensions/pooling/normalization/tokenizer identity.
- Cache location, permissions, retention, redaction, and recovery require decision before Slice R3.
- Vector extension/model download remain disabled until explicit compatibility/security/evaluation
  gates pass.

## Immediate Next Actions

1. Review and commit documentation realignment after checks.
2. Specify `WorkspaceSnapshot`, first semantic entities/edges, and `ContextPackV1`.
3. Create versioned retrieval/context evaluation corpus before ranking implementation.
4. Run workspace/module, symbol/API, and SQLite/FTS/graph provider spikes.
5. Complete installed public-symbol/core workflow or schedule it explicitly beside R0 spikes.
6. Implement immutable workspace inventory as first expanded vertical slice.

## Worktree Note

At start of this planning change, `.gitignore`, `AGENTS.md`, `.claude/`, and `CLAUDE.md` already had
user-owned changes/untracked files. Preserve them and exclude them from this branch's deliverable
unless user explicitly requests otherwise.

## Verification

Latest planning-change evidence:

- `pnpm typecheck` passed.
- `pnpm test` passed: 22 files, 207 tests.
- `pnpm build` passed.
- changed `package.json` passed targeted Biome check.
- 29 local Markdown files passed local `.md` link resolution check.
- `git diff --check` passed.
- full `pnpm check:static` remains blocked by pre-existing `.mcp.json` formatting outside this
  change; file is unmodified by this branch.

```sh
pnpm check
pnpm build
git diff --check
git status --short --branch
```

## Delivery Metadata

- Repository: `/Users/dsteele/repos/package-spelunker`
- Branch: `codex/rag-architecture-plan`
- Base: `5673b00`
- Date: 2026-09-01 (America/Toronto)
