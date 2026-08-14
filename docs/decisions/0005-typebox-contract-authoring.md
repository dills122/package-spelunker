# ADR 0005: TypeBox Contract Authoring and Validation

- Status: Accepted
- Date: 2026-08-14

## Context

ADR 0003 requires language-neutral JSON Schema Draft 2020-12 contracts while mechanically deriving
or checking TypeScript types and runtime validators. Task M1.1 needs one executable source for each
wire contract and must not expose validation-library objects through public interfaces.

The selected dependency must preserve portable JSON Schema, work with the repository's ESM and
TypeScript 7 configuration, reject unknown properties for closed public objects, and support
deterministic validation without evaluating inspected package code.

## Decision

Use exact-pinned `typebox@1.3.14` for schema construction, TypeScript type derivation, and compiled
runtime validation in `packages/contracts`.

- Author JSON Schema-compatible values with TypeBox's standard schema builder.
- Derive public TypeScript values with `Static<typeof schema>` rather than duplicating wire types.
- Compile boundary validators with `typebox/schema`.
- Export only project-owned schemas, value types, type guards, and normalized validation errors.
- Do not use TypeBox extended JavaScript schemas, custom keywords, transforms, or runtime coercion in
  serialized contracts.
- Serialize schemas in tests and assert that TypeBox's internal metadata is absent.
- Keep the dependency exact-pinned; upgrades require static API inspection, contract tests, and
  golden-example validation before acceptance.

The version 1 schema values identify JSON Schema Draft 2020-12 with `$schema`. Cross-record
invariants, such as evidence and failure references, are checked after structural schema validation
and report the same project-owned validation-error shape.

## Alternatives Considered

### Ajv plus `json-schema-to-ts`

Rejected for this slice. It would create separate authoring/type-derivation and validation seams,
and the revalidated `json-schema-to-ts` type vocabulary did not fully model the Draft 2020-12
features expected for future contracts. Using two dependencies would not improve the initial
contract boundary.

### Handwritten TypeScript types plus JSON Schema

Rejected because it creates two editable wire models and cannot mechanically prevent drift.

### Zod-first schemas

Rejected because JSON Schema is the canonical language-neutral contract. Generating JSON Schema
from a runtime-first model would make portability a derived concern and add another conversion
boundary.

### No runtime validator

Rejected because CLI and MCP requests, worker responses, golden examples, and future persisted
results all cross untrusted or compatibility-sensitive boundaries.

## Consequences

- `packages/contracts` has one small runtime dependency instead of being literally dependency-free.
- Contract types, runtime checks, and portable schemas originate from one declaration.
- Consumers are insulated from TypeBox errors and validator objects.
- Semantic reference rules remain explicit project logic alongside structural schema validation.
- A TypeBox major/minor upgrade is a contract-tooling change even when the serialized schema appears
  unchanged.

## References

- [JSON Schema specification](https://json-schema.org/specification)
- [TypeBox repository and documentation](https://github.com/sinclairzx81/typebox)
