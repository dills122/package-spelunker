# `@package-spelunker/contracts`

Versioned, transport-neutral request and result contracts for Package Spelunker.

The package currently exports the installed-package workflow's version 1 request schema, result
schema, TypeScript types derived from those schemas, runtime validators, and the named
`first-slice-v1` limit vocabulary. Public objects are closed and validation errors are normalized
into project-owned types; TypeBox implementation details do not cross the package boundary.

This package does not read the filesystem, resolve packages, invoke TypeScript, format CLI output,
or depend on application/provider code. The package name is internal and provisional until D1
settles the public package scope and release intent.

See:

- [`../../docs/decisions/0003-versioned-contract-envelopes.md`](../../docs/decisions/0003-versioned-contract-envelopes.md)
- [`../../docs/decisions/0004-first-slice-resource-policy.md`](../../docs/decisions/0004-first-slice-resource-policy.md)
- [`../../docs/decisions/0005-typebox-contract-authoring.md`](../../docs/decisions/0005-typebox-contract-authoring.md)
- [`../../docs/contracts/v1/`](../../docs/contracts/v1/)
