# ADR 0002: Canonical Snapshots and Provider Boundaries

- Status: Accepted
- Date: 2026-08-14

## Context

Package investigations may combine local files, registry artifacts, TypeScript resolution,
publication diagnostics, documentation, health metadata, and source repositories. If each analyzer
selects or fetches its own artifact, results can silently refer to different versions or bytes.
Third-party output schemas also have different authority and release lifecycles.

## Decision

Create one immutable, content-identified `PackageSnapshot` for an investigation and pass that exact
snapshot to every applicable analyzer. Translate every provider into project-owned result, evidence,
authority, warning, and failure contracts.

Use providers in this preference order: programmatic library, HTTP/SDK, isolated library worker,
external MCP provider, and CLI subprocess as a last resort.

## Consequences

- Providers cannot silently inspect `latest` or independently retrieve different bytes.
- Provider upgrades are isolated from public output contracts.
- Diagnostic and enrichment results cannot override authoritative artifact/resolver facts.
- Snapshot construction, evidence storage, limits, and cleanup become critical shared infrastructure
  and must be implemented before broad provider integration.
