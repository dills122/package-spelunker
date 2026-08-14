# AGENTS

AI coding guidance for this repository.

## Purpose

This repository builds `package-spelunker`, a deterministic, workspace-aware Node package
investigation engine with CLI and MCP interfaces.

Optimize for:

- evidence-backed answers tied to an exact package artifact and importer context
- static inspection without executing untrusted package code
- small, explicit changes over broad refactors
- tests and documentation when behavior, contracts, setup, or commands change

## Architecture Boundaries

Primary areas:

- `packages/`: domain engines, provider adapters, normalized contracts, and worker boundaries
- `apps/`: thin CLI and MCP transports over the package APIs
- `fixtures/`: deterministic workspace, package, resolution, and adversarial test cases

When a change spans areas, preserve ownership boundaries and update shared contracts first.

## Contract-First Files

Treat these as interface contracts before implementation details:

- `docs/architecture.md`
- `docs/security-model.md`

If behavior changes, update the relevant contract and docs in the same change.

## Scope Control

- Keep changes localized to the requested behavior.
- Avoid unrelated refactors and generated artifact churn.
- Call out follow-up work separately from the current change.
- Do not change public interfaces, storage formats, route surfaces, or app names without explicit intent.

## Repository Conventions

- Follow existing formatting and linting config.
- Prefer existing helper APIs and local patterns.
- Add focused tests for behavior changes.
- Update docs when setup steps, commands, contracts, or workflows change.

## Useful Commands

- Install dependencies: `pnpm install`
- Lint and format validation: `pnpm check:static`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- Full check: `pnpm check`
- Build: `pnpm build`

## Branch And PR Metadata

- Use feature branches for behavior, contract, test, or documentation changes.
- Do not commit directly to `main`.
- When work is ready, provide:
  - branch name
  - PR title
  - PR summary
  - test evidence
