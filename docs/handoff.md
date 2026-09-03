# Handoff: Organizer-First Repository Intelligence Plan

- Updated: 2026-09-02
- Handoff status: Current
- Product status: installed-package Milestone 1 plus repository-intelligence expansion planning
- Active branch: `codex/public-api-symbol-engine`

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
- [`research/repository-intelligence-technology-deep-dive.md`](research/repository-intelligence-technology-deep-dive.md)
  owns candidate comparisons, rejection rules, process/native risks, and experiment order.

## Existing Executable Foundation

- Closed installed-package v1 contracts, validators, golden examples, and resource vocabulary.
- Deterministic npm/pnpm/linked positive and adversarial fixtures.
- Containment-aware immutable installed/workspace package snapshots.
- Importer-aware npm/pnpm package selection.
- Snapshot-only Node 22 runtime resolution.
- Pinned TypeScript 6 declaration resolution in bounded child with brokered filesystem; TypeScript
  7 remains the repository build tool.
- Approved/executable public API v1 contract and bounded modeling specification.
- Deterministic pure TypeScript symbol engine with aliases/re-exports, merged declarations,
  `export =`, recursive namespaces, signatures, members, heritage, documentation/deprecation,
  M1.6 project semantics, exact traversal limits, package/compiler-lib provenance, nested-package
  authority, partial external results, cyclic traversal, and physical-layout-independent output.

Worker public-API operation, application composition, CLI, and MCP remain pending. Do not mark
Milestone 1 complete from pure-engine work alone.

## Planned Provider Stack

Immediate adoption after focused spikes:

- `@manypkg/get-packages` for generic workspace packages;
- `ignore` for Git-compatible exclusion semantics;
- dependency-cruiser for module graph;
- SQLite through `better-sqlite3` plus FTS5 for facts and lexical retrieval;
- Graphology for bounded in-memory traversal;
- Git CLI with fixed safe arguments for repository identity/change context;
- `@modelcontextprotocol/server` v2 for thin MCP transport.

Compatibility spikes:

- SCIP/`scip-typescript` for bulk symbols/references versus extending TypeScript worker;
- API Extractor for secondary API reports/model;
- package-manager-detector for generic package-manager hints.
- `@parcel/watcher`, `@vercel/nft`, Oxc, and ast-grep for measured capability-specific additions;
- Yarn PnP, Rush, Nx, Lerna, and Turborepo for detected topology enrichment.

Optional later providers:

- Knip, esbuild metafiles, CCE, and Ollama;
- isolated Transformers.js embeddings and exact-pinned `sqlite-vec` only after lexical baseline
  evaluation;
- existing `pacote`, `publint`, and ATTW package providers for unified upgrade impact.

Orama, LanceDB, USearch, LangChain, Mastra, Kùzu, ts-morph, TSQuery, and custom
parser/search/vector systems are not current foundations. Reconsider non-archived challengers only
from a measured gap.

## Key Security Decisions

- Default safe mode never executes package code, project config/plugins, build tools, or Git hooks.
- Nx/Knip and similar tools require explicit isolated trusted-workspace capability.
- Yarn `.pnp.cjs` is executable project code; Node permissions are defense in depth, not a sandbox.
- Provider output and retrieved text are untrusted data, not instructions.
- SQLite rows bind to snapshot/provider/schema/normalizer/exclusion identities; embeddings also bind
  model/revision/hash/dimensions/pooling/normalization/tokenizer identity.
- Cache location, permissions, retention, redaction, and recovery require decision before Slice R3.
- Vector extension/model download remain disabled until explicit compatibility/security/evaluation
  gates pass.
- Embedding inference remains in a different process from SQLite writing/vector querying.

## Immediate Next Actions

1. Complete independent review instance 3 of 3 for remediated M1.7 head.
2. Extend the existing bounded TypeScript worker with a `model-public-api` operation.
3. Compose the installed public-symbol workflow through the shared application service.
4. Specify `WorkspaceSnapshot`, first semantic entities/edges, and `ContextPackV1`.
5. Create the versioned retrieval/context evaluation corpus before ranking implementation.
6. Run workspace/module, symbol/API, and SQLite/FTS/graph provider spikes.
7. Implement immutable workspace inventory as the first expanded vertical slice.

## Worktree Note

At start of this planning change, `.gitignore`, `AGENTS.md`, `.claude/`, and `CLAUDE.md` already had
user-owned changes/untracked files. Preserve them and exclude them from this branch's deliverable
unless user explicitly requests otherwise.

## Verification

Latest pre-final-review pure-symbol-engine evidence:

- `pnpm typecheck` passed.
- `pnpm test` passed: 23 files, 235 tests.
- `pnpm build` passed.
- symbol-engine source, tests, fixtures, and changed project files passed targeted Biome check.
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
- Branch: `codex/public-api-symbol-engine`
- Base: `a30e219`
- Date: 2026-09-02 (America/Toronto)
