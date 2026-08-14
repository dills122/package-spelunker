# `@package-spelunker/package-snapshot`

Containment-aware, bounded snapshot construction for installed and workspace Node packages.

The package owns four inward-facing capabilities:

- `resolveContainedPath` canonicalizes selected paths under explicit approved roots, applies UTF-8
  path, segment, and symlink-hop budgets, and optionally narrows access to one artifact root;
- `readContainedFile` rechecks containment immediately before a descriptor-based bounded read and
  requires the selected entry to remain a regular file;
- `readPackageManifest` validates UTF-8 JSON and freezes only the package identity and resolution
  fields needed by the first slice;
- `constructPackageSnapshot` captures bounded regular files plus directory and file-symlink
  topology in memory, then hashes exact bytes and normalized importer context.

Successful snapshots expose immutable metadata and return a fresh byte copy from `readFile`. They
contain no package runtime objects and do not install, import, require, evaluate, or execute package
code. Failures use project-owned codes and fixed messages rather than raw Node filesystem errors or
absolute paths.

## Boundary Notes

- Callers must provide the approved roots and the already selected package root. Workspace
  discovery and package selection belong to `workspace-model`.
- First-slice defaults can be lowered by internal/test hooks but cannot be raised through these
  interfaces.
- A package-root symlink is admitted when its canonical target remains approved. File symlinks must
  remain inside the canonical artifact; recursive directory symlinks are rejected.
- Directory enumeration is streamed and capped before entries are retained. Files are read in
  bounded chunks, with final-link refusal and descriptor/path identity checks where Node exposes
  them.
- Immediate containment rechecks reduce path races, but Node path-based APIs do not provide a
  portable `openat`-style capability walk. A hostile concurrent filesystem mutator remains a
  residual platform risk and must not be mistaken for package-code execution safety.

The package name is internal and provisional until D1 settles public package scope and release
intent. See [`../../docs/security-model.md`](../../docs/security-model.md),
[ADR 0002](../../docs/decisions/0002-canonical-snapshots-and-provider-boundaries.md), and
[ADR 0004](../../docs/decisions/0004-first-slice-resource-policy.md).
