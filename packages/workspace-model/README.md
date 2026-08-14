# `@package-spelunker/workspace-model`

Importer-aware workspace discovery and exact installed-package selection for Package Spelunker.

The package owns two inward-facing capabilities:

- `parsePackageSpecifier` accepts only bare or scoped package names with an optional safe subpath,
  before any value is mapped into a filesystem path;
- `discoverWorkspacePackage` canonicalizes an explicit workspace/importer context, identifies npm or
  pnpm configuration, finds the importer's nearest declared workspace package, and selects the
  importer-nearest installed or linked package instance.

Successful results contain approved canonical roots for subsequent filesystem work and
workspace-relative paths for evidence and serialization. They identify the selected package root,
its canonical workspace-relative root, the `node_modules` entry used to reach it, installed versus
workspace source, normalized package identity, package-manager context, and every manifest,
lockfile, workspace config, or `tsconfig` that informed selection.

## Boundary Notes

- The caller supplies an explicit approved workspace root and importer. This package does not search
  outside that root or infer a workspace from the process working directory.
- npm `package-lock.json` and npm workspace arrays plus pnpm lock/workspace files are supported in
  the first slice. Multiple package-manager signals, unsupported workspace patterns, and unknown
  managers fail as `unsupported_context` instead of being guessed.
- Package selection follows ancestor `node_modules` locations from the importer's workspace package
  to the workspace root. It does not interpret `exports`, conditions, Node module modes, TypeScript
  paths, or declaration targets; those belong to later resolver packages.
- Workspace metadata and lockfiles are read through `package-snapshot` containment and byte-budget
  capabilities. Selected package identity is validated with the same bounded manifest reader.
- Results are suitable input for `constructPackageSnapshot`; application/core coordination supplies
  runtime conditions and maps the normalized context into that snapshot call.
- Discovery never installs, imports, requires, evaluates, or executes inspected package code.

The package name is internal and provisional until D1 settles public package scope and release
intent. See [`../../docs/architecture.md`](../../docs/architecture.md) and
[`../../docs/security-model.md`](../../docs/security-model.md).
