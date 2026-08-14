# ADR 0003: Versioned Closed Contract Envelopes

- Status: Accepted
- Date: 2026-08-14

## Context

Package Spelunker will expose the same investigation workflows through a TypeScript library, CLI
JSON, and later MCP tools. Results can be complete, partial, or failed while still carrying useful
authoritative evidence from earlier stages. The public shape must remain deterministic, must not
leak compiler or provider objects, and must let consumers reject incompatible data before using it.

The project also needs one representation that is not tied to TypeScript. Hand-maintained
TypeScript interfaces and separately authored wire schemas would drift. Unversioned JSON would make
every observed field, enum, ordering choice, and error detail an accidental compatibility promise.

As of this decision, the current published JSON Schema dialect is Draft 2020-12. The project is
pre-release and has not emitted a public machine-readable result.

## Decision

### JSON Schema owns serialized contracts

Use JSON Schema Draft 2020-12 as the canonical representation for serialized request and result
contracts. Each workflow owns a closed schema with:

- a stable `$id` under a future project-controlled namespace;
- `schemaVersion`, a string containing the workflow schema's major version;
- `kind`, a workflow-specific constant such as `installed-package-investigation`;
- `outcome`, one of `success`, `partial`, or `failure`;
- fixed stage results discriminated by `status`;
- normalized failures, warnings, evidence, applied limits, usage, and generation metadata;
- `additionalProperties: false` or `unevaluatedProperties: false` at public object boundaries.

The initial installed-package investigation schema version is `"1"`. JSON object member order is
never semantic. Array order is semantic only where its schema documentation says so; otherwise the
producer emits a documented deterministic sort.

Project-owned TypeScript input/output types and runtime validators must be derived from, generated
from, or mechanically checked against the schemas. The implementation must not maintain an
independent handwritten wire model that can drift from JSON Schema. The exact schema authoring and
validation library is chosen during Task M1.1 after dependency revalidation.

### One stable envelope shape

Every installed investigation result contains these top-level members:

```text
schemaVersion
kind
outcome
context
stages
failures
warnings
evidence
limits
metadata
```

`stages` always names the known first-slice stages: context discovery, snapshot construction,
runtime resolution, TypeScript resolution, and public API modeling. A stage is one of:

- `complete`, with stage data and evidence references;
- `failed`, with a reference to a normalized failure;
- `skipped`, with the preceding failure that made the stage unavailable.

`success` means every required stage completed. `partial` means at least one authoritative stage
completed and at least one required later stage failed or was skipped. `failure` means the request
could not produce the minimum useful artifact identity. A result never changes a completed earlier
fact to make a later diagnostic appear successful.

Expected operational failures are serialized, not thrown across CLI or MCP boundaries. Internal
exceptions are caught at the application boundary and become a bounded `internal_error` failure.
Public failures have stable `code` and `stage` fields, a human `message`, and an explicit
`isRetryable` flag. Message text, stack traces, raw exceptions, and arbitrary detail objects are not
compatibility surfaces and are not exposed.

### Evidence is referenced and bounded

Stage data refers to evidence by stable result-local IDs. The envelope contains the corresponding
bounded evidence records, classified as `authoritative`, `diagnostic`, `enrichment`, or `heuristic`.
Evidence contains normalized locations or content identities, not arbitrary file contents.

Paths are workspace- or artifact-relative by default. Absolute paths require an explicit local
presentation policy and must not appear in portable golden contracts. Timestamps and tool versions
belong in `metadata`; consumers must not use them as artifact identity.

### Compatibility policy

Once schema version `1` is published:

- removing or renaming a field is breaking;
- adding a required or optional public field is breaking because schemas are closed;
- changing a field type, meaning, format, default, or requiredness is breaking;
- adding an enum, failure code, union variant, or stage status is breaking because consumers may be
  exhaustive;
- changing array ordering semantics is breaking;
- clarifying prose without changing the accepted instance set is non-breaking;
- correcting an implementation that emitted data invalid under the published schema is a bug fix,
  not a schema change.

Breaking serialized changes require a new workflow schema major. The CLI requires an explicit
schema version for JSON output and rejects unsupported versions; human output remains the default.
Core code uses one current domain model. A temporary older serializer may exist only under an
explicit deprecation plan and must not fork core behavior.

New workflows receive their own `kind` and schema rather than extending the installed investigation
envelope with unrelated optional sections.

## Alternatives Considered

### Handwritten TypeScript interfaces as the only contract

Rejected because CLI and MCP consumers need runtime validation and language-neutral schemas.
TypeScript types disappear at runtime and do not constrain untrusted JSON.

### TypeScript types plus separately maintained JSON Schema

Rejected because two canonical models will drift and make compatibility reviews unreliable.

### Open objects with additive optional fields inside schema version 1

Rejected because permissive objects accept misspellings and because supposedly additive fields or
union variants can still break exhaustive consumers. Closed schemas make every commitment visible.

### One giant schema for all current and future workflows

Rejected because unrelated capabilities would continually mutate a shared compatibility surface and
encourage transports to depend on incomplete internal stages.

### Package version as the only wire version

Rejected because package releases and individual workflow contracts evolve on different schedules.
The package version remains SemVer; each serialized workflow also declares its schema major.

## Consequences

- Contract design and golden examples must precede implementation.
- Public fields are intentionally expensive to add after publication, which limits accidental API
  growth.
- Every external boundary can validate the exact workflow and schema version before use.
- Partial results remain predictable and machine-readable without conflating absence with success.
- Schema generation/checking becomes a required build and test concern in Task M1.1.
- A future schema major needs an explicit migration and deprecation decision.

## References

- [JSON Schema specification](https://json-schema.org/specification)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [Semantic Versioning 2.0.0](https://semver.org/)
