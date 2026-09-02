# Alpha 1 Release Plan

- Status: Active; alpha direction and WG1 gates owner-approved
- Updated: 2026-08-15
- Active work group: WG1.4 — deterministic public API fixtures
- Execution index: [`execution-index.md`](execution-index.md)

## Confirmed Alpha Direction

Alpha 1 is an expert-validation release for an agent-first product.

- AI coding agents are the primary consumers.
- Node and TypeScript experts are the primary evaluators because they can identify incorrect,
  incomplete, or misleading answers.
- MCP is the primary product interface; the CLI remains a secondary expert, debugging, and direct
  questioning interface.
- Alpha 1 inspects one locally installed package from an explicit importer and reports the exact
  package, Node runtime target, TypeScript declaration target, compiler-backed public API, and
  bounded evidence.
- Alpha 1 is local and network-free. Registry retrieval, version comparison, upgrade impact,
  specialist diagnostics, and local usage analysis remain post-alpha work.

The intended alpha promise is:

> From an approved local workspace and explicit importer, an AI agent can ask Package Spelunker what
> one installed Node/TypeScript package exposes and receive a bounded, evidence-backed answer without
> executing package code or using the network.

Alpha 1 remains the authoritative installed-package foundation after the repository-intelligence
expansion accepted on 2026-09-01. It is not the full RAG alpha. Workspace indexing, retrieval,
semantic linking, and `ContextPack` delivery follow the slices in
[`repository-intelligence-implementation-plan.md`](repository-intelligence-implementation-plan.md).

## Remaining Release Decisions

These decisions do not block writing WG1 specifications, but they must be closed before alpha
packaging begins.

| ID | Decision | Recommended starting point | Needed before |
| --- | --- | --- | --- |
| A1 | Distribution | one public npm prerelease package under an `alpha` dist-tag | WG3 packaging |
| A2 | Package scope and name | publish one MCP/CLI application package; keep internal libraries private | WG3 packaging |
| A3 | License | choose an explicit public license before any public package | public alpha |
| A4 | Supported platforms | Node 22 on Linux and macOS; defer Windows until path semantics are fixture- and CI-backed | WG2 integration gate |
| A5 | Compatibility | freeze the completed v1 investigation schema at alpha publication; treat MCP/CLI presentation as prerelease | WG2 transport specs |
| A6 | Feedback and security | GitHub issues for correctness reports plus a real private vulnerability contact | public alpha |

## Release Dependency Graph

```text
alpha intent and compatibility decisions
  -> M1.7 public API specification and v1 contract correction
    -> deterministic symbol fixtures
      -> TypeScript symbol engine
        -> bounded worker integration
          -> installed-investigation core workflow
            -> CLI adapter ─┐
            -> MCP adapter ─┴-> packaged alpha, smoke tests, evaluator guide
```

Contract and engine work is sequential. Once the core workflow is stable, CLI and MCP transport
work can proceed in parallel because both remain thin adapters over the same operation.

## Work Group 1: Public API Modeling And Alpha Interface Contracts

### WG1.1: Align Canonical Alpha Intent

**Description:** Update canonical product and roadmap language so the agent-first, installed-only
alpha is distinct from the broader multi-milestone product release.

**Acceptance criteria:**

- AI agents are named as the primary alpha consumer and expert humans as validators.
- MCP is primary and CLI secondary for alpha, without changing their inward dependency direction.
- Registry, comparison, diagnostics, usage impact, and remote enrichment are explicitly post-alpha.

**Verification:** `pnpm check:static && git diff --check`

**Dependencies:** Owner-confirmed direction above.

**Files likely touched:** `docs/product-brief.md`, `docs/roadmap.md`, `docs/architecture.md`.

**Estimated scope:** Medium.

### WG1.2: Approve The M1.7 Contract And Limit Semantics

**Description:** Write the public TypeScript API modeling specification and correct the pre-alpha
v1 stage contract before implementation.

**Acceptance criteria:**

- The owner approves an explicit `partial` stage carrying bounded data, a normalized failure, and
  omission metadata.
- The spec defines shallow inspection-oriented symbols, stable entrypoint/export identities,
  deterministic ordering, and artifact-relative locations without prematurely designing the later
  semantic diff graph.
- The spec defines exact behavior for declaration, graph-depth, public-symbol, signature, worker,
  cancellation, and output limits.

**Verification:** Review the spec against ADR 0003, ADR 0004, `API-001`, `API-002`, `DECL-002`, and
`DECL-003`; then run `pnpm check:static`.

**Dependencies:** WG1.1.

**Files likely touched:** `docs/specs/typescript-public-api-modeling.md`,
`docs/decisions/0003-versioned-contract-envelopes.md`, and optionally ADR 0004 if clarification is
required.

**Estimated scope:** Medium.

### Checkpoint 1: Contract Approval

- [x] The owner approves WG1.1 and WG1.2.
- [x] The single-artifact authority boundary is retained: selected package snapshot plus explicitly
      admitted pinned TypeScript libraries; other package declarations are typed unsupported or
      partial.
- [x] JSDoc scope is limited to summary and deprecation for alpha.
- [x] `pnpm check:static` passes.

No public-symbol implementation begins before this checkpoint.

### WG1.3: Make The Public API Contract Executable

**Status:** Complete on `codex/m17-contract-spec`.

**Description:** Extend the closed v1 schema and golden examples through a red-green TDD increment.

**Acceptance criteria:**

- Closed schemas represent symbol meanings and declaration kinds, aliases, locations, type
  parameters, signatures, members, heritage, documentation, deprecation, and omission metadata.
- Success, partial, failed, and skipped stages validate; malformed or path-tainted data fails.
- Golden examples contain no absolute machine paths, physical pnpm store paths, timestamps, or
  snapshot-dependent symbol identities.

**Verification:** Focused contract tests, `pnpm typecheck`, and `pnpm test:unit`.

**Dependencies:** Checkpoint 1.

**Files likely touched:** the installed-investigation schema and test plus focused v1 golden
examples under `docs/contracts/v1/`.

**Estimated scope:** Medium, split into separate schema and golden commits if it exceeds five files.

### WG1.4: Add Deterministic Symbol Fixtures

**Status:** Next implementation slice.

**Description:** Add the smallest fixture set that can prove compiler semantics and exact resource
boundaries without mutable registry data.

**Acceptance criteria:**

- Fixtures cover simple/default exports, aliases and star re-exports, merged declarations,
  overloads, generics, members and inheritance, documentation, deprecation, and cycles.
- Separate generated cases exercise below/at/above graph, declaration, symbol, and signature
  limits.
- The same fixture modeled under npm, pnpm, and linked-workspace roots can produce identical
  normalized output.

**Verification:** Focused fixture integrity tests and `pnpm test:integration`.

**Dependencies:** WG1.3.

**Files likely touched:** `packages/test-fixtures/` catalog/materializer/tests and focused inert
declaration fixtures.

**Estimated scope:** Medium; split semantic and limit fixtures into two commits.

### WG1.5: Model Stable Entrypoint Exports

**Description:** Create `packages/typescript-symbols` with a one-shot compiler program that models
simple exports, locations, meanings, deterministic ordering, and stable identities.

**Acceptance criteria:**

- Export IDs are based on normalized entrypoint plus encoded export name, never absolute paths,
  versions, or snapshot IDs.
- The engine uses the selected declaration entrypoint and an explicit virtual compiler host; it
  never calls ambient filesystem APIs or executes package code.
- Simple/default export goldens pass under multiple physical layouts.

**Verification:** Focused red-green unit tests, `pnpm typecheck`, and `pnpm build`.

**Dependencies:** WG1.4.

**Files likely touched:** new package manifest/config, one modeler module, one public index, and one
focused test file; add the root project reference as a separate small commit if needed.

**Estimated scope:** Medium.

### WG1.6: Expand Symbol Semantics In Focused Slices

**Description:** Add the remaining approved symbol semantics without creating a semantic diff AST.

**Acceptance criteria:**

- Slice A handles aliases, re-exports, merges, and cycles.
- Slice B handles signatures, generics, members, heritage, JSDoc summary, and deprecation.
- Slice C enforces exact declaration, depth, symbol, and signature boundaries with deterministic
  partial or failed results.

**Verification:** Focused golden tests after each slice; then `pnpm typecheck && pnpm test`.

**Dependencies:** WG1.5.

**Files likely touched:** the symbol modeler and its focused tests; fixture changes remain in the
fixture package.

**Estimated scope:** Three medium commits, one per slice.

### Checkpoint 2: Pure Symbol Engine

- [ ] All M1.7 golden and exact-boundary tests pass.
- [ ] Output is byte-stable across npm, pnpm, and linked-workspace physical layouts.
- [ ] No compiler object or absolute path leaks into domain contracts.
- [ ] `pnpm check && pnpm build` pass.

### WG1.7: Extend The Bounded TypeScript Worker

**Description:** Add an operation-specific `model-public-api` request/response to the existing
worker rather than creating a second compiler process boundary.

**Acceptance criteria:**

- Resolution and modeling remain separate operations so a modeling failure cannot rewrite a valid
  declaration-resolution result.
- The worker admits only snapshot declarations, bounded workspace metadata, and allowlisted pinned
  TypeScript `lib.*.d.ts` files through the broker.
- Timeout, cancellation, memory exhaustion, malformed output, crash, context/snapshot mismatch,
  and output limits fail closed without tainted diagnostics.

**Verification:** Protocol tests first, then lifecycle/adversarial tests and
`pnpm test:integration`.

**Dependencies:** Checkpoint 2.

**Files likely touched:** focused worker protocol/child/coordinator modules and matching tests, split
into protocol, compiler-host, and lifecycle commits.

**Estimated scope:** Three medium commits.

### WG1.8: Specify The Narrow Alpha MCP Surface

**Description:** Define the agent-facing contract now, while deferring transport code until the
core application service exists.

**Acceptance criteria:**

- Alpha exposes one coherent installed-package investigation tool, conceptually
  `inspect_installed_package`, rather than low-level resolver orchestration tools.
- Input authority root, importer, package specifier, conditions/config selection, cancellation,
  errors, capabilities, response bounds, and evidence pagination are explicit.
- The tool returns the same versioned domain result as the core and owns no resolution, snapshot,
  compiler, or evidence authority.

**Verification:** Contract review against architecture/security boundaries and
`pnpm check:static`.

**Dependencies:** WG1.1. This specification can proceed in parallel with WG1.3 through WG1.7 after
Checkpoint 1.

**Files likely touched:** `docs/specs/mcp-installed-investigation-alpha.md`, `docs/architecture.md`,
and `docs/security-model.md`.

**Estimated scope:** Medium.

### Checkpoint 3: Work Group 1 Complete

- [ ] M1.7 is complete through the bounded production worker.
- [ ] The alpha MCP tool contract is approved but transport code has not been prematurely added.
- [ ] Fixture matrix, implementation plan, roadmap status, README, and handoff match reality.
- [ ] `pnpm check && pnpm test:integration && pnpm build && git diff --check` pass.
- [ ] A fresh-context review finds no unresolved correctness or security issue.

## Following Work Groups

### WG2: One Installed Investigation Through Both Transports

1. Compose the installed-investigation application service in `packages/core`.
2. Add the secondary CLI adapter with human and versioned JSON output.
3. Add the primary MCP server with the approved coherent tool and evidence pagination.
4. Prove CLI/MCP result equivalence, cancellation, authorization-root, and output boundaries.

WG2 finishes when an agent can call the MCP tool against npm, pnpm, and linked-workspace fixtures
and receive the same authoritative result as the CLI.

### WG3: Package And Validate Alpha 1

1. Close distribution, package name/scope, license, supported-platform, and compatibility decisions.
2. Produce the installable MCP/CLI artifact and clean-environment smoke tests.
3. Add agent setup/usage guidance, evaluator correctness cases, known limitations, privacy/network
   statement, release notes, support path, and private security contact.
4. Add the claimed OS CI matrix and publish a prerelease tag only from a fully passing commit.

WG3 finishes when an expert evaluator can install the actual artifact, configure an AI agent, run
representative investigations, inspect the evidence, and report a reproducible correctness defect.

## Explicitly Post-Alpha

- Workspace snapshots, repository indexing, lexical/vector retrieval, semantic graph, and
  `ContextPack` workflows.
- Registry or arbitrary network access.
- Installed-versus-target comparison and upgrade recommendations.
- `publint`, ATTW, API diffing, and local usage impact.
- Multi-package declaration authority, Yarn Plug'n'Play, Bun, or bundler-specific resolution.
- Broad human-oriented CLI polish, native installers, telemetry, or automatic updates.

## Principal Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Agent-first alpha quietly inherits the broader first-release scope | alpha feedback arrives too late | keep Alpha 1 installed-only and move only the narrow MCP adapter forward |
| The unpublished v1 schema freezes before partial semantics are coherent | permanent compatibility debt | approve the partial-stage correction before WG1.3 |
| Public-symbol modeling becomes a premature API-diff engine | excessive complexity and unstable output | keep alpha records shallow, display-oriented, bounded, and single-artifact |
| MCP transport starts owning workflow semantics | CLI/MCP divergence and duplicated policy | require one core operation and transport equivalence tests |
| Expert feedback is anecdotal and unreproducible | correctness work cannot be prioritized | ship evaluator cases and require request, normalized result, evidence, and environment in reports |

## Approval Gate

Approved on 2026-08-15 for WG1 specification work:

1. [x] This alpha direction and three-work-group release path are correct.
2. [x] WG1 should approve and add the explicit partial-stage contract variant.
3. [x] The alpha public API model should remain shallow and inspection-oriented rather than
       diff-ready.
4. [x] Selected-artifact declarations plus pinned TypeScript libraries are the complete alpha
       compiler authority boundary.
