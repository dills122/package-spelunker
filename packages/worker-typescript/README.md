# `@package-spelunker/worker-typescript`

Terminable child-process boundary for Package Spelunker's trusted TypeScript analysis compiler.

- Validates a closed, versioned request before process creation.
- Starts the child with a lowered V8 heap ceiling, fixed `/` working directory, and empty
  environment.
- Gives the compiler no ambient workspace filesystem host. Synchronous TypeScript host calls use
  bounded framed pipes to an asynchronous coordinator broker restricted to virtual `/workspace`.
- Enforces wall time, cancellation grace, broker-frame bytes, compiler output bytes, snapshot
  identity, and returned-result structure.
- Normalizes timeout, cancellation, crash/OOM, malformed output, protocol failure, and snapshot or
  context mismatch without returning stderr, stacks, raw exceptions, or local absolute paths.
- Maps logical npm/pnpm/workspace-link roots and canonical package roots to the same immutable
  snapshot bytes; live package files are never reopened.
- Admits only contained, bounded workspace resolution metadata and memoizes bytes, topology, and
  absence for the operation.
- Independently verifies a hash of every broker observation before accepting child success.

`prepareTypeScriptResolutionWorker` builds the production request and broker from the exact package
selection fields and completed snapshot. The later core workflow remains responsible for passing
those already-validated values and composing the returned stage result.

Canonical behavior is defined by ADR
[`../../docs/decisions/0004-first-slice-resource-policy.md`](../../docs/decisions/0004-first-slice-resource-policy.md),
[`../../docs/specs/typescript-declaration-resolution.md`](../../docs/specs/typescript-declaration-resolution.md),
and [`../../docs/security-model.md`](../../docs/security-model.md).
