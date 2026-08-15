# ADR 0004: First-Slice Resource Policy and Compiler Isolation

- Status: Accepted
- Date: 2026-08-14
- Amended: 2026-08-15 before schema version 1 publication

## Context

Package Spelunker reads package manifests, lockfiles, export maps, symlinks, declarations, and
compiler graphs controlled by the inspected workspace or package. Static analysis avoids package
execution but does not avoid denial-of-service risks: small cyclic inputs, very large files, broad
directory trees, pathological types, or excessive evidence can exhaust time, memory, or output.

The security model requires bounded files, graphs, workers, and responses, but previously left the
numbers unresolved. Implementations need one named policy so fixtures can assert exact behavior and
serialized results can explain which limits were applied.

JavaScript cannot enforce a hard memory ceiling on an in-process TypeScript compiler operation.
Cooperative cancellation also cannot terminate compiler work that stops yielding. A wall-clock
timer in the main process is therefore not an adequate boundary for untrusted declaration graphs.

## Decision

### Versioned policy

Adopt `first-slice-v1` as the default resource policy for installed-package investigation. Every
investigation records this policy version, effective caller-visible budgets, measured usage that is
safe to report, and any exceeded limit names.

Callers may lower a configurable budget. They may raise it only up to the absolute ceiling below.
They cannot disable a budget or exceed the ceiling through CLI or MCP input. Changing a default or
ceiling requires a policy-version change, updated fixtures, and a compatibility/security review.

Values are binary bytes. Counts include rejected candidates once they have been opened or traversed.
Wall time begins after boundary validation and includes cleanup.

| Limit name | Default | Absolute ceiling | Scope |
| --- | ---: | ---: | --- |
| `maxManifestBytes` | 1 MiB | 4 MiB | each `package.json`, `tsconfig`, or workspace config |
| `maxLockfileBytes` | 32 MiB | 128 MiB | each lockfile |
| `maxArtifactFileBytes` | 8 MiB | 32 MiB | each declaration, source map, or inspected package file |
| `maxArtifactBytesRead` | 128 MiB | 512 MiB | aggregate package/workspace bytes read |
| `maxRelativePathBytes` | 1,024 | 4,096 | UTF-8 bytes in an artifact-relative path |
| `maxPathSegments` | 64 | 128 | normalized relative-path segments |
| `maxSymlinkHops` | 16 | 32 | canonicalization hops for one selected path |
| `maxFilesVisited` | 10,000 | 50,000 | filesystem entries considered |
| `maxExportMapNodes` | 4,096 | 16,384 | keys, conditions, arrays, and targets visited |
| `maxResolverTraceSteps` | 10,000 | 50,000 | emitted or suppressed resolver decisions |
| `maxDeclarationFiles` | 4,096 | 16,384 | declaration files admitted to compiler analysis |
| `maxGraphDepth` | 128 | 512 | declaration, alias, inheritance, or re-export traversal depth |
| `maxPublicSymbols` | 50,000 | 200,000 | normalized root/nested exports plus retained members |
| `maxSignaturesPerSymbol` | 256 | 1,024 | call and construct signatures on one symbol |
| `maxEvidenceEntries` | 2,000 | 10,000 | evidence records in one result |
| `maxEvidenceDescriptionBytes` | 1 KiB | 4 KiB | one human evidence description |
| `maxEvidenceBytes` | 4 MiB | 16 MiB | aggregate serialized evidence section |
| `maxOutputBytes` | 8 MiB | 32 MiB | complete UTF-8 JSON result |
| `maxWallTimeMs` | 60,000 | 300,000 | total investigation wall time |
| `maxCompilerMemoryBytes` | 768 MiB | 2 GiB | isolated TypeScript compiler process |
| `maxCancellationGraceMs` | 2,000 | 10,000 | graceful shutdown before forced termination |
| `maxConcurrentFileReads` | 16 | 64 | in-flight bounded file reads |

The initial defaults are deliberately conservative development defaults, not ecosystem statistics.
Fixture and real-package evidence may justify a future policy version; implementations must not
silently relax them when a large package fails.

The first CLI exposes lowered per-request overrides only for `maxArtifactBytesRead`,
`maxFilesVisited`, `maxDeclarationFiles`, `maxPublicSymbols`, `maxEvidenceEntries`,
`maxOutputBytes`, and `maxWallTimeMs`. Those effective values appear in the v1 envelope's
`limits.applied` object. The remaining safeguards are fixed by `policyVersion` in the first slice;
their names may still appear in normalized limit failures. A later public override is a contract and
security change.

### Limit outcomes

Every exceeded budget produces `resource_limit_exceeded` with the exact limit name and stage.
Behavior depends on whether earlier authoritative stages completed:

- Before snapshot identity is complete, the envelope outcome is `failure`.
- After snapshot identity is complete, a later analysis limit normally produces `partial`; completed
  earlier stages remain available.
- Path escape, malformed security-critical identity, and integrity mismatch are fatal and are never
  converted into truncation.
- Evidence and trace collections may stop at their budget only if the stage declares itself partial
  and records what was omitted. Silent truncation is prohibited.
- Public API symbol accounting includes each normalized root export, namespace export, and retained
  member so adversarial member breadth cannot bypass the symbol budget. The exact limit succeeds;
  over-limit data is partial only when the retained prefix and omitted count are deterministic.
- The serializer measures the complete candidate JSON before writing it. If it exceeds
  `maxOutputBytes`, it emits a compact failure/partial envelope under a reserved 64 KiB emergency
  response ceiling instead of cutting JSON bytes.

Usage reporting does not include a self-referential final output-byte count. Output enforcement is
recorded through `maxOutputBytes` and an exceeded-limit event when applicable.

### Compiler execution boundary

Run compiler-backed TypeScript resolution and public API modeling in a terminable child process for
the first slice. The process receives normalized request/snapshot context and uses the same
containment-aware, budgeted file-access abstraction as the main process through a custom compiler
host. It may read TypeScript standard libraries and files explicitly admitted by that policy; it may
not import or execute package runtime code.

The coordinator applies the memory ceiling at process start, enforces wall time and cancellation,
validates the returned contract, and force-terminates after the cancellation grace period. Crash,
out-of-memory termination, timeout, invalid output, and snapshot mismatch become normalized stage
failures.

This isolation decision applies to the custom TypeScript analysis stage. ADR 0002 and later decision
D5 still govern third-party provider isolation.

## Alternatives Considered

### Document qualitative limits only

Rejected because implementation and fixtures could choose incompatible thresholds and still claim
to satisfy the security model.

### Unlimited local analysis by default

Rejected because local package and workspace content is untrusted. A local-only tool can still hang
an editor, CI runner, agent host, or MCP server.

### Caller-controlled limits without ceilings

Rejected because an untrusted or mistaken transport request could disable the security boundary.

### TypeScript analysis in the main process

Rejected for the first slice because memory and non-yielding compiler work cannot be terminated
reliably without also terminating the CLI or server process.

### Worker threads for compiler isolation

Rejected as the default because worker resource limits and termination provide a weaker process
boundary for native/addon behavior and do not isolate the host as clearly as a child process. This
can be revisited with measured evidence.

## Consequences

- Snapshot, resolver, compiler, evidence, and serializer code share named budget counters.
- Fixtures can assert exact limit failures rather than relying on machine-dependent exhaustion.
- TypeScript analysis needs a small worker protocol and process lifecycle earlier than third-party
  provider integration.
- Very large legitimate packages may return partial results under defaults; users receive the exact
  policy and limit name instead of a hang or silent omission.
- Raising a ceiling is a security change, not a convenience flag.
- The paired fixture inventory in [`../../fixtures/matrix.md`](../../fixtures/matrix.md) becomes the
  acceptance map for Tasks F0.3 and M1.2.
