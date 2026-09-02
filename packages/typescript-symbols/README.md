# `@package-spelunker/typescript-symbols`

Pure compiler-backed public TypeScript API modeler for one immutable package declaration
entrypoint.

- Uses Package Spelunker's pinned TypeScript 6 compiler.
- Reads only through an explicit virtual file host.
- Emits package-relative locations, stable entrypoint/export identities, deterministic ordering,
  and project-owned frozen values.
- Models aliases, merged declarations, signatures, generics, members, heritage, documentation, and
  deprecation without exposing compiler objects.
- Enforces declaration-file, graph-depth, public-symbol, and per-symbol signature limits.

Process isolation, compiler library admission, and result-envelope composition remain owned by
`@package-spelunker/worker-typescript` and the later core workflow.

Canonical behavior is defined by
[`../../docs/specs/typescript-public-api-modeling.md`](../../docs/specs/typescript-public-api-modeling.md).
