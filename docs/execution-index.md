# Active Execution Index: M1.7 And Alpha Planning

- Status: Active
- Started: 2026-08-15
- Integration branch: `codex/alpha-release-planning`
- Parent plan: [`implementation-plan.md`](implementation-plan.md)
- Draft alpha plan: [`alpha-release-plan.md`](alpha-release-plan.md)

## Objective And Completion Boundary

Prepare Package Spelunker's next implementation increment and first alpha release without guessing
either boundary. This execution cycle is complete when repository checks are insulated from nested
review worktrees, the merged-state documentation is current, the M1.7 public-symbol contract and
limits have an approved specification, and the alpha's user, promise, installation path, supported
platforms, and release gate are explicitly agreed and recorded.

## Work Items

| ID | Work item | Delivery unit | Dependencies | Status | Integration destination |
| --- | --- | --- | --- | --- | --- |
| OPS-001 | Remove the merged M1.6 review worktree and prevent nested worktrees from entering root checks | internal subagent | none | complete | this branch |
| M17-R01 | Investigate the existing symbol contract, compiler worker, and required M1.7 decisions | research task | none | complete | evidence for M17-S01 |
| ALPHA-R01 | Audit the repository against a credible first-alpha release boundary | research task | none | complete | evidence for ALPHA-D01 |
| ALPHA-D01 | Confirm alpha intent and release decisions with the owner | lead plus owner | ALPHA-R01 informs, does not decide | in progress: draft plan ready | `alpha-release-plan.md` |
| M17-S01 | Write and approve the M1.7 public TypeScript API modeling specification | lead | M17-R01 and relevant ALPHA-D01 decisions | pending owner approval | `docs/specs/` and contracts |
| M17-I01 | Implement M1.7 in test-driven, reviewable increments | internal subagents plus lead | approved M17-S01 | pending | dedicated feature branch/PR |

## Acceptance And Verification

### OPS-001

- Root `pnpm check` ignores agent-owned nested worktrees while still checking repository-owned code.
- Current architecture, handoff, and documentation index describe merged M1.6 reality.
- Verify with `pnpm check`, `pnpm build`, `git diff --check`, and a focused configuration test or
  reproducible nested-worktree check.

### M17-R01 And M17-S01

- The specification defines stable package-relative symbol identity; aliases, re-exports, merged
  declarations, type/value identity, overloads, members, generics, signatures, JSDoc,
  deprecations, and declaration locations.
- Cycle, graph-depth, declaration-count, public-symbol, signature, evidence, output, cancellation,
  and compiler-memory behavior is explicit.
- The specification preserves the immutable snapshot, single-artifact, no-execution, and bounded
  child-process boundaries from M1.6.
- Approval is required before implementation begins.

### ALPHA-R01 And ALPHA-D01

- The intended alpha user and the one-sentence product promise are explicit.
- Installation/distribution, package scope, license, versioning, supported Node/package-manager/OS
  matrix, compatibility promise, and support/feedback channel are decided.
- Alpha exit criteria are executable and distinguish must-ship work from post-alpha work.

## Coordination Rules

- Canonical product and architecture truth remains in the existing roadmap, architecture, security
  model, ADRs, and approved feature specs; this file only tracks execution.
- Parallel writers own disjoint paths and must preserve other agents' edits.
- Contract and worker changes are serialized behind the approved M1.7 specification.
- The lead reconciles all child evidence and runs the integration gate before retaining changes.

## Research Outcomes

- M17-R01 confirmed that the placeholder public-symbol schema cannot satisfy M1.7 and found a
  conflict between ADR 0003's three stage states and ADR 0004/API-001's required bounded partial
  result. M17-S01 must resolve that contract before implementation.
- ALPHA-R01 found that Milestone 1 supports a coherent local installed-package alpha, while the
  product brief's broader first release spans Milestones 1 through 5. ALPHA-D01 must explicitly
  choose the alpha distribution model and compatibility boundary rather than silently redefining
  the broader release.
