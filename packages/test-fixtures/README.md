# `@package-spelunker/test-fixtures`

Deterministic, repository-owned test infrastructure for Package Spelunker engines.

The package exports:

- a typed catalog of implemented positive/adversarial cases keyed to stable IDs in
  [`../../fixtures/matrix.md`](../../fixtures/matrix.md);
- paths for inert checked-in npm, pnpm, and linked-workspace layouts;
- materializers that copy layouts and recreate pnpm/workspace symlinks in caller-owned temporary
  directories;
- generated containment, escaping-symlink, cycle, manifest-limit, and malformed-manifest cases;
- an inert public-API declaration package with identical bytes under npm, pnpm, and linked
  workspace layouts; and
- below/at/above generators for declaration-graph depth, declaration count, public symbols, and
  signatures per symbol.

Fixture package manifests intentionally omit lifecycle scripts. Runtime `.js` and `.cjs` files only
contain `FIXTURE_RUNTIME_EXECUTED` throwing sentinels so an accidental import fails immediately. The
materializers never install dependencies or load fixture runtime code. Public-API fixtures contain
declarations only, with no runtime entrypoint at all.

The package name is internal and provisional until D1 settles public package scope and release
intent. It is test infrastructure and is not part of the product's public contract.
