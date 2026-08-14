# Handoff: Foundation Review and Initial Implementation Plan

- Updated: 2026-08-14
- Handoff status: Current
- Product status: Milestone 0 foundation; no product implementation exists

## Objective And Boundary

Continue Package Spelunker from a reviewed repository foundation into its first installed-package
investigation slice. This handoff records repository state and immediate continuation steps; product,
architecture, and security truth remains in the canonical sources below.

This pass reviewed the complete repository, reconciled current-state claims, clarified the first
technical boundary, and created a task-level implementation plan. It did not add source packages,
fixtures, tests, dependencies, public schemas, or product behavior.

## Canonical Sources

- [`product-brief.md`](product-brief.md): users, problem, scope, and first-release success.
- [`architecture.md`](architecture.md): technical boundaries, dependency direction, first-slice
  packages, and workflow lifecycle.
- [`security-model.md`](security-model.md): trust model, invariants, and prohibited behavior.
- [`roadmap.md`](roadmap.md): milestone outcomes and exit gates.
- [`implementation-plan.md`](implementation-plan.md): active tasks, dependencies, acceptance
  criteria, risks, and decision checkpoints.
- ADR [0001](decisions/0001-separate-repository-and-core-first.md) and ADR
  [0002](decisions/0002-canonical-snapshots-and-provider-boundaries.md): accepted architecture
  decisions.

Read [`README.md`](README.md) for documentation ownership and source-of-truth rules.

## Current Repository State

- Root tooling exists for pnpm 10.23.0, Node 22.22.1, strict TypeScript, Biome, Vitest, and GitHub
  Actions.
- `apps/`, `packages/`, and `fixtures/` contain README ownership guidance only.
- There are no workspace package manifests, source files, fixtures, or test files.
- The Git repository has no commits. The current branch is unborn and all repository files are
  untracked, so Git cannot distinguish the pre-existing bootstrap from this documentation pass.
- No Git remote is configured.
- The root package is private, version `0.0.0`, and `UNLICENSED`.

## Completed Work And Evidence

### Repository review

- Reviewed every repository-owned file under the root, `docs/`, `.github/`, `apps/`, `packages/`,
  `fixtures/`, and `.codex/steering/`.
- Confirmed the product brief, architecture, security model, research, and ADRs agree on a
  core-first, importer-aware, static-analysis product anchored to immutable snapshots.
- Confirmed all advertised product capabilities remain planned; no document now presents a domain
  package as implemented.
- Reconciled the product brief's former "first vertical slice" label with the roadmap: local CLI
  inspection is the first delivery slice, while registry through MCP remains the first-release
  success boundary.
- Classified documents by ownership so the roadmap, active plan, handoff, research, and derived
  README do not compete as product truth.

### Documentation and planning

- Added [`implementation-plan.md`](implementation-plan.md) with the first-slice input/output
  boundary, dependency order, five decision checkpoints, task-level acceptance criteria,
  verification, milestone gates, risks, and open questions.
- Expanded [`architecture.md`](architecture.md) with the exact first-slice package boundary,
  dependency graph, investigation lifecycle, and execution/data policy.
- Updated [`roadmap.md`](roadmap.md) with an evidence-backed Milestone 0 status and remaining exit
  work.
- Updated the project [`README`](../README.md) with current phase, next delivery target, and planning
  entry point.
- Reworked [`docs/README.md`](README.md) into a reading order and ownership index.

### Verification evidence

- `pnpm install --frozen-lockfile` completed with the lockfile already up to date.
- `pnpm check` passed on 2026-08-14 using Node `v22.22.1` and pnpm `10.23.0`.
- `pnpm build` passed.
- Biome reported four checked configuration/source-like files with no fixes required.
- TypeScript project-reference checking passed with no implementation projects.
- Vitest reported no test files and exited successfully because `--passWithNoTests` is configured.
- A local Markdown-link check validated all 17 repository Markdown files with no unresolved local
  targets.

This verification proves the bootstrap tooling runs. It does not prove product behavior, fixture
coverage, clean-clone installation, or cross-platform compatibility.

## Decisions And Rationale

The following accepted direction remains unchanged:

- A standalone TypeScript monorepo owns independent contracts, tests, release lifecycle, and
  security policy.
- A normal core library owns investigations; CLI and MCP remain thin adapters.
- Exact importer context and one immutable, content-identified package snapshot anchor every
  investigation.
- Node runtime resolution and TypeScript declaration resolution remain distinct explainable facts.
- TypeScript compiler semantics, not regex-only parsing, define the public API model.
- Provider results are normalized and classified by authority; providers cannot choose another
  artifact.
- Package execution is prohibited; registry v1 accepts exact registry coordinates only.
- The first slice is local installed-package inspection through the CLI. Registry, providers, diff,
  usage impact, MCP, and enrichment remain outside that boundary.
- Package directories are created only for a real dependency or isolation boundary. In particular,
  a separate evidence package is deferred until persistence or cross-workflow reuse justifies it.

## Blockers And Limitations

- Product owner decisions are required for package scope, license, repository remote, release
  intent, and initial supported platform matrix (decision D1).
- JSON schema representation/versioning and concrete first-slice resource budgets are not accepted
  yet (D2 and D3). Engine contracts should not be implemented ahead of them.
- There is no initial commit or remote checkpoint. All files are untracked and therefore easy to
  omit accidentally from the first commit.
- No tests exist. The current green `pnpm check` is a tooling smoke check only.
- Dependency research is historical as of 2026-08-14 and must be revalidated before adding any
  third-party package.

## Immediate Next Actions

1. Resolve D1 with the product owner: package scope, license, remote/release intent, and supported
   platforms.
2. Draft and review the D2 contract-versioning ADR with representative success, partial-result, and
   failure envelopes.
3. Draft and review D3 resource budgets and the paired positive/adversarial fixture matrix.
4. Run the clean-clone-equivalent install/check flow, inspect ignored/tracked files, and create the
   initial repository commit and remote checkpoint intentionally.
5. Begin Task M1.1 in [`implementation-plan.md`](implementation-plan.md) only after the foundation
   checkpoint is approved.

The first implementation action after those decisions is concrete: scaffold `packages/contracts`
with no transport, filesystem, compiler, or provider dependencies, then prove its serialized
examples with golden tests.

## Verification Commands

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check
pnpm build
git status --short --branch
git ls-files
git remote -v
```

When implementation starts, add focused unit/integration commands from the active plan rather than
relying only on the root aggregate.

## AI Central Integration

Bootstrap source checkout: `/Users/dsteele/.codex/worktrees/e3b7/ai-central`

Source revision recorded at bootstrap: `9965921885e39c4a20e3bcf3852e962c421ad3af`

Install mode: shared links. Profiles: `base,javascript-typescript`. Bundles:
`core,node,orchestration,documentation,delivery,engineering,planning,workflow`.

Machine-local links are excluded through `.git/info/exclude`; repository-owned `AGENTS.md` and
steering files are intended to be tracked. Before deleting or moving the bootstrap source checkout,
refresh links deliberately from a stable AI Central checkout.

## Delivery Metadata

- Repository: `/Users/dsteele/repos/package-spelunker`
- Branch: `codex/project-planning-docs`
- Base/checkpoint commit: none; repository has an unborn branch
- Retained commits: none
- Remote: none configured
- Pull request: none
- Dirty state: every repository file is untracked because no initial commit exists
- Files created by this pass: `docs/implementation-plan.md`
- Files updated by this pass: `README.md`, `docs/README.md`, `docs/product-brief.md`,
  `docs/architecture.md`, `docs/roadmap.md`, `docs/handoff.md`
- Date: 2026-08-14 (America/Toronto)
