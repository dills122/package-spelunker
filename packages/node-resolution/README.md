# `@package-spelunker/node-resolution`

Deterministic Node 22 runtime-target resolution over one immutable package snapshot.

The package owns two inward-facing capabilities:

- `normalizeRuntimeConditions` derives exactly one `import` or `require` lookup kind and returns a
  canonical immutable active-condition set;
- `resolveNodeRuntime` applies package `exports` or exports-absent legacy lookup to snapshot-retained
  manifest bytes and files, returning one JavaScript target, module format, bounded trace, and
  measured traversal usage.

Supported export behavior includes main sugar, exact and pattern subpaths, pattern trailers, nested
ordered conditions, arrays, and `null` exclusions. Export targets are package-relative and rejected
before lookup when they contain traversal, encoded separators, dot segments, `node_modules`, NULs,
backslashes, absolute paths, or URLs. When `exports` is absent, import lookup remains exact while
require lookup may apply `.js`/`.json`/`.node` and directory forms; JSON and native-addon targets are
reported as unsupported because this first slice returns JavaScript only.

## Boundary Notes

- The caller supplies the already selected immutable `PackageSnapshot` and normalized package
  subpath. This package does not discover workspaces, select installed packages, or read the live
  filesystem.
- Raw retained `package.json` bytes are parsed because conditional-object property order controls
  Node branch priority. The snapshot's normalized manifest remains authoritative for package
  identity and `type`.
- Lookup kind and target module format are separate facts: `require` may select ESM metadata and
  `import` may select a `.cjs` target.
- Export-map nodes, graph depth, trace steps, and cancellation are checked during traversal. Limits
  can be lowered but not raised above the first-slice policy.
- The resolver never imports, requires, evaluates, or executes a selected target. Tests cover npm,
  pnpm, linked-workspace, and no-execution fixtures.

See the [M1.5 specification](../../docs/specs/node-runtime-resolution.md),
[architecture](../../docs/architecture.md), and [security model](../../docs/security-model.md).
