# `@package-spelunker/typescript-symbols`

TypeDoc-backed public TypeScript API modeler for one immutable package declaration entrypoint.

- Uses TypeDoc `0.28.20` for semantic API extraction over Package Spelunker's contained, pinned
  TypeScript `6.0.3` program.
- Targets declaration artifacts produced for TypeScript 5.8, 5.9, and 6.0 in the MVP; one pinned
  compiler keeps results deterministic instead of dispatching to workspace compilers.
- Reads only through an explicit virtual file host.
- Emits package-relative locations, stable entrypoint/export identities, deterministic ordering,
  and project-owned frozen values.
- Keeps project-owned code to containment, normalized contracts, evidence, limits, alias provenance,
  and provider-gap handling; TypeDoc models declarations, signatures, members, heritage, and docs.
- Enforces declaration-file, graph-depth, public-symbol, and per-symbol signature limits.

`modelPublicApi` is asynchronous because it uses TypeDoc's supported application bootstrap API.
Process isolation, compiler library admission, and result-envelope composition remain owned by
`@package-spelunker/worker-typescript` and the later core workflow.

Canonical behavior is defined by
[`../../docs/specs/typescript-public-api-modeling.md`](../../docs/specs/typescript-public-api-modeling.md).
