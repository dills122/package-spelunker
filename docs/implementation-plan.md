# Initial Implementation Plan

- Status: Active
- Updated: 2026-08-14
- Current phase: Milestone 0 closure and Milestone 1 implementation
- Target outcome: one evidence-complete installed-package investigation through the CLI

## Objective

Turn the accepted product, architecture, and security direction into a sequence of small,
verifiable implementation tasks. The first delivery boundary is intentionally narrow: given an
approved workspace root, an importer, and a package specifier, the CLI explains the exact installed
package, runtime target, declaration target, and compiler-backed public API without executing
package code.

Registry access, third-party diagnostics, semantic version comparison, local usage impact, and MCP
are later milestones. They must not be pulled into the first slice merely to create their eventual
package boundaries.

## Canonical Inputs

- [`product-brief.md`](product-brief.md) defines the problem, users, goals, and non-goals.
- [`architecture.md`](architecture.md) defines component ownership and dependency direction.
- [`security-model.md`](security-model.md) defines trust boundaries and prohibited behavior.
- [`roadmap.md`](roadmap.md) defines milestone outcomes and release gates.
- ADRs [0001](decisions/0001-separate-repository-and-core-first.md) through
  [0005](decisions/0005-typebox-contract-authoring.md) define the accepted architectural and
  contract-tooling direction.

If this plan conflicts with one of those sources, the canonical source wins and this plan must be
corrected.

## First-Slice Contract

### Input

- canonical approved workspace root;
- explicit importer file or importer package;
- bare or scoped package specifier, optionally with an exported subpath;
- explicit runtime and TypeScript conditions when they differ from defaults;
- optional `tsconfig` selection when discovery would be ambiguous.

### Output

- selected workspace and package-manager context;
- exact installed package root, name, version, and content identity;
- normalized manifest and immutable snapshot identity;
- runtime and TypeScript declaration targets with resolver traces;
- public exports, symbols, signatures, and declaration locations;
- bounded evidence, warnings, partial failures, and limit metadata;
- stable human-readable output and a versioned JSON envelope.

### Explicit exclusions

- no registry or arbitrary network access;
- no package installation, packing, lifecycle scripts, imports, or evaluation;
- no API diff, upgrade recommendation, local usage impact, or MCP surface;
- no promise of Yarn Plug'n'Play, Bun-specific, or bundler-specific resolution in the first slice.

## Dependency Order

```text
contract and schema decisions
  -> deterministic fixtures and safety controls
    -> installed snapshot and workspace discovery
      -> Node and TypeScript resolution
        -> compiler-backed public API model
          -> application workflow
            -> CLI presentation and JSON compatibility gate
```

Contract work precedes engines. Positive and adversarial fixtures precede the code they constrain.
The CLI is last because it is a presentation adapter over the completed workflow.

## Decision Checkpoints

| ID | Decision | Status | Needed before | Deliverable |
| --- | --- | --- | --- | --- |
| D1 | package scope, license, remote, and release intent | Partial: remote/default branch/initial commit complete; scope, license, release, and platforms open | publication | repository metadata update, and ADR if the distribution decision is architectural |
| D2 | JSON schema version and compatibility policy | Accepted by [ADR 0003](decisions/0003-versioned-contract-envelopes.md) | machine-readable CLI output | closed v1 schema plus golden contract fixtures |
| D3 | default file, graph, evidence, and response budgets | Accepted by [ADR 0004](decisions/0004-first-slice-resource-policy.md) | untrusted package fixtures | versioned policy plus paired fixture matrix |
| D4 | cache location, permissions, eviction, and path redaction | Deferred | persistent snapshot caching | ADR and threat-model update |
| D5 | worker thread versus subprocess per provider | Deferred | first specialist provider | provider-specific ADR and termination tests |

D1 should be resolved during foundation closure. D2 and D3 are part of the first slice. D4 and D5
must remain deferred until their capabilities enter scope.

## Phase 0: Close the Foundation

### Task F0.1: Create the initial repository checkpoint

**Status:** In progress. The remote, default branch, initial commit, and clean-clone check are
complete; D1 publication metadata remains open.

**Description:** Make the bootstrap repository reproducible before product code is added. Resolve
the repository identity decisions, verify the clean-clone workflow, and establish the first commit
and remote intentionally.

**Acceptance criteria:**

- [ ] Package scope, license, remote, and release intent are recorded with no contradictory
      placeholders.
- [x] A clean clone with Node 22.22.1 and pnpm 10.23.0 can install and run `pnpm check`.
- [x] The initial commit includes the intended repository-owned files and excludes machine-local AI
      Central links.

**Verification:**

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm check`
- [x] Inspect `git status --short`, tracked files, and configured remote.

**Dependencies:** Human decision D1.

**Files likely touched:** `package.json`, `README.md`, `SECURITY.md`, license file, Git metadata.

**Estimated scope:** Small.

### Task F0.2: Freeze the first public contract vocabulary

**Status:** Complete. ADR 0003 owns compatibility; `packages/contracts` provides executable Draft
2020-12 schemas, derived TypeScript types, validators, and golden-example tests.

**Description:** Define the versioned request, success, failure, snapshot, evidence, limit, warning,
and resolver-trace vocabulary before engine packages begin returning ad hoc shapes.

**Acceptance criteria:**

- [x] Every envelope has a schema version and stable discriminant.
- [x] Partial results and typed failures preserve evidence without presenting failure as success.
- [x] Snapshot identity, authority class, source locations, warnings, and applied limits are explicit.

**Verification:**

- [x] Review examples against installed-package, resolution-discrepancy, and limit-exceeded cases.
- [x] Golden JSON examples validate against the selected schema representation.
- [x] `pnpm check`

**Dependencies:** D2.

**Files likely touched:** `docs/architecture.md`, one new ADR, `packages/contracts/`, contract tests.

**Estimated scope:** Medium.

### Task F0.3: Set first-slice resource budgets and fixture matrix

**Status:** Complete. ADR 0004 owns the limits and compiler isolation decision; the fixture matrix
owns stable positive/adversarial acceptance IDs.

**Description:** Convert the security model's qualitative limits into testable defaults and create a
fixture inventory that pairs each rejection case with a valid positive control.

**Acceptance criteria:**

- [x] Defaults exist for manifest/file bytes, files visited, graph depth, evidence entries, and JSON
      response size.
- [x] The fixture matrix covers npm, pnpm, a workspace link, conditional exports, traversal,
      escaping symlinks, cycles, malformed manifests, and oversized input.
- [x] Limit errors are distinguishable from malformed input and unsupported behavior.

**Verification:**

- [x] Security invariants map to named fixtures and expected outcomes.
- [x] Fixture provenance/no-execution rules are documented for future fixture data.
- [x] `pnpm check`

**Dependencies:** Accepted D2 vocabulary and D3.

**Files likely touched:** `docs/security-model.md`, one new ADR, `fixtures/README.md`, fixture index.

**Estimated scope:** Medium.

## Checkpoint: Foundation Closed

- [x] `pnpm check` passes from a clean clone.
- [x] D2 and D3 are resolved and recorded in canonical sources.
- [x] Contract examples and fixture expectations are reviewable before implementation.
- [ ] D1 publication metadata is resolved.
- [ ] A human approves the first-slice boundary.

## Phase 1: Installed-Package Vertical Slice

### Task M1.1: Implement versioned domain contracts

**Status:** Complete. The version 1 installed request/result boundary and first-slice limit
vocabulary are executable and verified.

**Description:** Create the dependency-light contracts package for requests, snapshots, evidence,
resolver traces, public API shapes, warnings, limits, and normalized failures.

**Acceptance criteria:**

- [x] Contracts contain no CLI, MCP, filesystem, TypeScript compiler, or provider-specific types.
- [x] Runtime validation covers external request and serialized result boundaries.
- [x] Golden examples and focused invalid cases cover success, partial success, unsafe input,
      unsupported-mode vocabulary, and limits.

**Verification:**

- [x] Focused contract and serialization tests pass.
- [x] `pnpm typecheck && pnpm test:unit`

**Dependencies:** F0.2.

**Files likely touched:** `packages/contracts/package.json`, `src/`, `test/`, root TypeScript references.

**Estimated scope:** Medium.

### Task M1.2: Build the deterministic fixture harness

**Status:** Complete. The typed catalog, inert checked-in layouts, generated security pairs, and
integrity/no-execution tests are implemented.

**Description:** Add small generated or checked-in workspace fixtures whose expected resolution and
security outcomes are explicit and independent of mutable registry state.

**Acceptance criteria:**

- [x] Positive fixtures cover npm layout, pnpm layout, workspace link, package subpath, conditional
      exports, type-only export, and declaration re-export.
- [x] Adversarial fixtures cover traversal, escaping symlink, cycles, malformed input, and configured
      limits.
- [x] Tests prove fixtures do not invoke package lifecycle scripts or package code.

**Verification:**

- [x] Fixture integrity and expected-outcome tests pass on the macOS development host; PR CI will
      supply Linux evidence, while D1 still owns the formal supported-platform matrix.
- [x] `pnpm test:integration`

**Dependencies:** F0.3 and M1.1.

**Files likely touched:** `fixtures/`, `packages/test-fixtures/`, focused fixture tests.

**Estimated scope:** Medium.

### Task M1.3: Construct a safe installed snapshot

**Status:** Complete. `packages/package-snapshot` implements contained path resolution, bounded
regular-file reads, manifest normalization, and deterministic immutable installed/workspace
snapshots with fixture-backed failures.

**Description:** Canonicalize the approved roots, perform bounded reads, normalize the package
manifest, and create a content-identified installed/workspace snapshot with evidence.

**Acceptance criteria:**

- [x] Selected paths are contained after canonicalization and immediately before file reads.
- [x] Legitimate workspace symlinks pass while escaping file and directory symlinks fail.
- [x] Snapshot identity is deterministic for unchanged relevant bytes and context.

**Verification:**

- [x] Unit tests cover path policy, bounded reads, hashing, and manifest normalization.
- [x] Adversarial and positive-control fixture tests pass.
- [x] `pnpm typecheck && pnpm test`

**Dependencies:** M1.1 and M1.2.

**Files likely touched:** `packages/package-snapshot/`, contract extensions only if approved.

**Estimated scope:** Medium.

### Task M1.4: Discover workspace and importer context

**Status:** Complete. `packages/workspace-model` validates installed-package specifiers, discovers
npm/pnpm importer and configuration context, selects the exact installed or linked package root, and
returns canonical capabilities plus workspace-relative evidence without applying resolver semantics.

**Description:** Resolve the explicit importer to its workspace package, package-manager context,
nearest applicable configuration, and exact installed package candidate without defining runtime or
TypeScript target semantics.

**Acceptance criteria:**

- [x] npm, pnpm, and linked-workspace fixtures select the expected package instance.
- [x] Ambiguous, missing, unsupported, and outside-root inputs return typed failures.
- [x] The result records which manifests, lockfiles, workspace config, and `tsconfig` informed it.

**Verification:**

- [x] Workspace discovery unit and integration tests pass.
- [x] `pnpm typecheck && pnpm test`

**Dependencies:** M1.1 through M1.3.

**Files likely touched:** `packages/workspace-model/`, workspace fixtures and tests.

**Estimated scope:** Medium.

### Task M1.5: Resolve the Node runtime target

**Status:** Complete. `packages/node-resolution` consumes immutable package snapshots, implements
Node 22 export-map and bounded legacy runtime selection, and is verified across npm, pnpm, and
linked-workspace fixtures without executing target code.

**Description:** Resolve the requested package and subpath from the exact importer under explicit
Node module mode and conditions, returning the selected target and a structured trace.

**Acceptance criteria:**

- [x] Export maps, subpaths, conditional branches, CommonJS/ESM context, and unexported paths are
      fixture-backed.
- [x] Resolution never imports or evaluates the selected target.
- [x] Trace evidence explains each material selection and rejection.

**Verification:**

- [x] Focused resolver tests compare expected paths and trace decisions.
- [x] Disagreement cases are explicit rather than silently guessed.
- [x] `pnpm typecheck && pnpm test`

**Dependencies:** M1.3 and M1.4.

**Files likely touched:** `packages/node-resolution/`, resolver fixtures and tests.

**Estimated scope:** Medium.

### Task M1.6: Resolve the TypeScript declaration target

**Description:** Use the selected TypeScript compiler and applicable project configuration to
resolve the declaration entry point from the importer, separately from the runtime answer.

**Acceptance criteria:**

- [x] `types`, conditional type branches, module resolution mode, paths, and project context are
      represented in fixtures.
- [x] Runtime/declaration divergence is a normal explainable result.
- [x] Compiler version, configuration, conditions, and trace evidence are recorded.

**Verification:**

- [x] Focused TypeScript resolution tests pass.
- [x] Node/TypeScript disagreement fixtures produce both answers with evidence.
- [x] `pnpm typecheck && pnpm test`

**Dependencies:** M1.4 and M1.5.

**Files likely touched:** `packages/typescript-resolution/`, TypeScript fixtures and tests.

**Estimated scope:** Medium.

### Task M1.7: Model the public TypeScript API

**Description:** Build the compiler-backed symbol graph for the selected declaration entry point and
normalize it into project-owned public API contracts.

**Acceptance criteria:**

- [ ] Exports, aliases, re-exports, type/value identity, overloads, members, generics, signatures,
      JSDoc, deprecations, and declaration locations are represented or explicitly unsupported.
- [ ] Stable symbol identities do not depend on absolute machine paths.
- [ ] Cycles and configured graph limits yield bounded partial results or typed failures.

**Verification:**

- [ ] Golden symbol tests cover simple, re-exported, overloaded, merged, and cyclic declarations.
- [ ] `pnpm typecheck && pnpm test`

**Dependencies:** M1.1, M1.2, and M1.6.

**Files likely touched:** `packages/typescript-symbols/`, declaration fixtures and tests.

**Estimated scope:** Medium.

### Task M1.8: Isolate compiler analysis

**Description:** Run TypeScript resolution and public API modeling through a terminable child
process with a versioned protocol, bounded compiler host, memory/time limits, cancellation, forced
termination, and returned-contract validation.

**Acceptance criteria:**

- [ ] The compiler process can read only admitted files through the shared containment-aware host.
- [ ] Timeout, memory exhaustion, cancellation, crash, malformed output, and snapshot mismatch are
      normalized without terminating the coordinator.
- [ ] The worker protocol contains no CLI formatting or third-party provider contract.

**Verification:**

- [ ] Focused process lifecycle and adversarial worker tests pass.
- [ ] `pnpm typecheck && pnpm test`

**Dependencies:** M1.3, M1.6, M1.7, and ADR 0004.

**Files likely touched:** `packages/worker-typescript/`, compiler worker fixtures and tests.

**Estimated scope:** Medium.

### Task M1.9: Compose the installed investigation workflow

**Description:** Implement one application service that coordinates discovery, snapshot creation,
runtime and declaration resolution, symbol modeling, cancellation, limits, and evidence assembly.

**Acceptance criteria:**

- [ ] One request produces one snapshot identity shared by every stage.
- [ ] Stage failures preserve bounded evidence and do not mislabel diagnostics or partial data as
      authoritative success.
- [ ] The core package has no CLI or MCP dependency.

**Verification:**

- [ ] End-to-end core tests cover success, resolution divergence, invalid input, cancellation, and
      limits.
- [ ] `pnpm typecheck && pnpm test`

**Dependencies:** M1.3 through M1.5 and M1.8.

**Files likely touched:** `packages/core/`, workflow integration tests.

**Estimated scope:** Medium.

### Task M1.10: Expose the workflow through the CLI

**Description:** Add an `inspect` command that validates arguments, invokes the core workflow, maps
typed failures to stable exit behavior, and presents human or versioned JSON output.

**Acceptance criteria:**

- [ ] The CLI contains no domain resolution or analysis logic.
- [ ] Human output identifies the artifact and important evidence; JSON matches golden contracts.
- [ ] Exit codes distinguish invalid request, unsupported context, bounded analysis failure, and
      internal failure without leaking secrets or unnecessary absolute paths.

**Verification:**

- [ ] CLI process tests cover help, success, JSON, invalid input, partial failure, and cancellation.
- [ ] `pnpm build && pnpm test`

**Dependencies:** M1.9 and D2.

**Files likely touched:** `apps/cli/`, CLI fixtures and tests, root package scripts.

**Estimated scope:** Medium.

## Checkpoint: Milestone 1 Complete

- [ ] `pnpm check && pnpm build` pass on the supported environment.
- [ ] The CLI completes the first-slice workflow for npm, pnpm, and workspace-link fixtures.
- [ ] Required adversarial fixtures pass, including the legitimate symlink positive control.
- [ ] Machine-readable output is versioned and golden-tested.
- [ ] Architecture, security model, roadmap, README, and handoff match implemented behavior.

## Later Milestones

After the Milestone 1 review, expand one vertical slice at a time:

1. exact registry snapshots and installed-versus-target comparison;
2. isolated `publint` and ATTW diagnostics over the same snapshot;
3. semantic API changes and local usage impact;
4. MCP tools over stable core workflows;
5. optional documentation and ecosystem enrichment.

The detailed exit gates remain in [`roadmap.md`](roadmap.md). Create a new active implementation
plan at each milestone boundary instead of speculating about low-level tasks before the preceding
contracts are proven.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| package boundaries multiply before behavior exists | high maintenance and circular dependencies | create packages only for an enforced dependency or isolation boundary; begin with the first-slice set |
| Node and TypeScript answers are flattened into one result | incorrect compatibility conclusions | keep separate resolver traces and report divergence explicitly |
| filesystem safety is bolted on after resolution | path escape and inconsistent evidence | implement snapshot containment and bounded reads before resolver traversal |
| compiler model becomes machine-specific or unstable | unusable diffs and golden churn | normalize identities and paths in contracts before broad fixture coverage |
| JSON freezes accidentally through CLI snapshots | compatibility burden | settle D2 before exposing machine-readable output |
| first slice expands into registry, providers, and MCP | delayed proof of the core differentiator | enforce the explicit exclusions and milestone gates in this plan |

## Open Questions Requiring Human Direction

- What package scope, public license, remote, and distribution model should D1 record?
- Is the first supported platform matrix Linux and macOS only, or must Windows path semantics pass
  at Milestone 1?
- Should the first JSON schema use checked-in JSON Schema, TypeScript runtime validators, or both?
- Which Node conditions are default, and which must always be explicit in the request?
- What path-redaction policy gives useful local evidence without exposing unnecessary workspace
  structure?
