# `@package-spelunker/typescript-resolution`

Compiler-backed declaration target resolution for the installed-package first slice.

- Uses the exactly locked TypeScript 6 compatibility dependency and records the underlying compiler
  version returned by its public API.
- Accepts an explicit virtual file host; it never falls back to `ts.sys` or opens workspace files.
- Supports Node16/NodeNext import or require resolution, custom conditions, conditional `types`,
  `typesVersions`, module suffixes, and bounded structured probe traces.
- Parses JSONC `tsconfig`/`jsconfig` metadata and contained inheritance through the supplied virtual
  host, with fixed inferred NodeNext options when no project config applies.
- Returns only declaration files contained by the selected package root. JavaScript targets are not
  declaration answers; `paths`, `@types`, and other outside-artifact redirects are typed unsupported
  contexts.

Production coordination must invoke this engine through `@package-spelunker/worker-typescript`.
Direct calls are limited to controlled inert tests and worker-child code.

Canonical behavior is defined by
[`../../docs/specs/typescript-declaration-resolution.md`](../../docs/specs/typescript-declaration-resolution.md),
[`../../docs/architecture.md`](../../docs/architecture.md), and
[`../../docs/security-model.md`](../../docs/security-model.md).
