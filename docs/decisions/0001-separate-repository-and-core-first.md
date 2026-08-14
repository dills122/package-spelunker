# ADR 0001: Standalone Repository with a Core-First Architecture

- Status: Accepted
- Date: 2026-08-14

## Context

AI Central now contains a lightweight `inspect-node-package-api` skill for focused, dependency-free
inspection. The deeper proposal includes workspace discovery, immutable artifacts, importer-aware
Node and TypeScript resolution, compiler-backed semantics, provider workers, API diffing, local usage
impact, caching, CLI and MCP interfaces, and independent releases.

That lifecycle and dependency graph do not fit a repository whose purpose is reusable AI steering,
skills, templates, and scaffold helpers.

## Decision

Build Package Spelunker in its own repository. Implement the investigation engine as ordinary
TypeScript packages. Treat the CLI and MCP server as thin adapters over the same core APIs.

Keep the existing AI Central inspector as a separate lightweight capability. AI Central may later
ship a thin usage skill for Package Spelunker, but it will not host the product implementation.

## Consequences

- Package Spelunker owns independent dependencies, CI, fixtures, versioning, releases, and security
  policy.
- Core behavior is testable without MCP transport or an agent host.
- CLI workflows can expose and debug contracts before the MCP surface is frozen.
- Some logic from the lightweight inspector may inform fixtures or early implementation, but the
  projects do not share source merely to avoid small duplication.
