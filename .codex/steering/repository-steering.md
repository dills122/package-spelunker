# Repository Scope And Priorities

This repository builds `package-spelunker`, a package-investigation orchestrator with a canonical
package model and thin CLI and MCP interfaces.

Primary deliverables:

- importer-specific Node and TypeScript package resolution
- compiler-backed public API exploration and semantic comparison
- normalized evidence from local artifacts, registry snapshots, and specialist providers

Core priorities:

- exact artifact identity and reproducible evidence
- no execution of inspected package code
- stable typed contracts between modules
- maintainable local workflows

## Active Boundaries

- `packages/` owns domain contracts, analysis engines, snapshots, and provider isolation.
- `apps/` owns transport parsing, validation, presentation, and lifecycle only.
- `fixtures/` owns deterministic compatibility, security, and pathological-package cases.

## Safe Refactor Boundaries

Do not refactor these without explicit instruction:

- canonical snapshot, evidence, provider-result, and public-symbol schemas
- package-root containment and no-package-execution guarantees
- CLI exit codes, JSON formats, and MCP tool contracts once published
- fixture provenance and expected resolver behavior

Safe default changes:

- feature-scoped improvements
- endpoint hardening and validation
- focused test additions
- typing improvements
