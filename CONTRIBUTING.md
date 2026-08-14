# Contributing

Package Spelunker is in its architecture and first-vertical-slice phase. Keep changes narrow and
update contracts and documentation before or alongside implementation.

## Setup

```sh
corepack enable
pnpm install
pnpm check
```

## Change Expectations

- Preserve the dependency direction described in `docs/architecture.md`.
- Keep CLI and MCP handlers thin; domain behavior belongs in `packages/`.
- Do not execute inspected package code or delegate safety-critical resolution to documentation or
  diagnostic providers.
- Add deterministic fixtures for resolver, parser, archive, or security behavior.
- Update normalized contracts and compatibility tests together.
- Document new external providers, network access, subprocesses, or trust assumptions.

## Pull Requests

Include the problem, approach, affected contracts, tests run, and any unresolved risk. Public JSON,
CLI, MCP, snapshot, evidence, or symbol-model changes require an explicit compatibility note.
