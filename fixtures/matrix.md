# First-Slice Fixture Matrix

- Status: Active; M1.2 foundation implemented
- Resource policy: `first-slice-v1`
- Security source: [`../docs/security-model.md`](../docs/security-model.md)
- Budget decision: [ADR 0004](../docs/decisions/0004-first-slice-resource-policy.md)

Each rejection fixture has a nearby positive control that proves the policy rejects the dangerous
property rather than the general feature. Fixtures must be deterministic, minimal, provenance-
documented, and independent of mutable registry state. No fixture lifecycle script or runtime entry
point may execute during generation or tests.

| ID | Area | Positive control | Adversarial or boundary fixture | Expected outcome |
| --- | --- | --- | --- | --- |
| CTX-001 | approved root | importer nested inside the workspace | importer path containing `..` that canonicalizes outside | `outside_approved_root`; no outside file read |
| CTX-002 | package name | valid bare, scoped, and exported-subpath specifiers | absolute path, encoded traversal, NUL, or arbitrary URL specifier | boundary `invalid_request` |
| FS-001 | workspace symlink | workspace package symlink resolving to an admitted package root | package symlink resolving outside the approved roots | positive resolves; adversarial is `outside_approved_root` |
| FS-002 | file symlink | declaration symlink contained within the selected artifact | declaration symlink escaping the artifact root | positive read succeeds; adversarial read is rejected |
| FS-003 | symlink cycle | short acyclic symlink chain | cycle or chain beyond `maxSymlinkHops` | typed cycle or `resource_limit_exceeded` |
| FS-004 | relative path | nested path within byte and segment limits | overlong path or too many normalized segments | exact path limit reported before open |
| CFG-001 | package manifest | valid small `package.json` | manifest at and above `maxManifestBytes`, plus malformed JSON | boundary succeeds; over-limit and malformed codes differ |
| CFG-002 | workspace config | small npm and pnpm workspace configurations | oversized or cyclic workspace patterns/config references | bounded context failure with source evidence |
| CFG-003 | lockfile | minimal npm and pnpm lockfiles | lockfile at and above `maxLockfileBytes` | exact byte limit; no partial parse presented as fact |
| EXP-001 | export map | nested conditional export with a selected branch | condition nesting beyond `maxGraphDepth` | positive trace selects target; adversarial limit is named |
| EXP-002 | export map breadth | small wildcard and subpath map | map exceeding `maxExportMapNodes` | deterministic `resource_limit_exceeded` |
| EXP-003 | export target | contained relative export target | absolute, traversal, or escaping target | malformed/unsafe target; never opened |
| RES-001 | trace | runtime and TypeScript targets that intentionally differ | resolver graph exceeding `maxResolverTraceSteps` | both normal targets preserved; trace limit is explicit |
| RES-002 | unsupported mode | supported NodeNext ESM and CommonJS fixtures | Yarn Plug'n'Play or bundler-only mode in the first slice | `unsupported_context`, not guessed resolution |
| DECL-001 | declaration file | declaration immediately below `maxArtifactFileBytes` | declaration immediately above the limit | positive modeled; adversarial stage limit |
| DECL-002 | re-export graph | finite declaration re-export and alias chain | cycle and chain beyond `maxGraphDepth` | bounded completion or typed partial result |
| DECL-003 | declaration count | package below `maxDeclarationFiles` | package reaching and exceeding the count | exact boundary behavior and deterministic count |
| API-001 | public symbols | package below `maxPublicSymbols` | generated declarations exceeding the symbol budget | partial API stage with omitted-count warning |
| API-002 | signatures | overloaded symbol below its limit | symbol exceeding `maxSignaturesPerSymbol` | exact symbol and limit recorded |
| EVD-001 | evidence count | result below `maxEvidenceEntries` | trace producing more evidence candidates than allowed | partial result; no silent evidence loss |
| EVD-002 | evidence bytes | bounded descriptions and locations | oversized description and aggregate evidence section | descriptions sanitized; exact byte limit reported |
| OUT-001 | JSON output | complete result below `maxOutputBytes` | candidate result above the output budget | valid compact envelope below the emergency ceiling |
| RUN-001 | wall time | analysis completing before `maxWallTimeMs` | deterministic worker that does not complete | timeout normalized; worker terminated and cleaned up |
| RUN-002 | cancellation | cancellation before and between stages | compiler worker ignoring graceful cancellation | `cancelled`; forced termination after grace period |
| RUN-003 | compiler memory | bounded compiler fixture | worker exceeding `maxCompilerMemoryBytes` | host survives; normalized analysis failure |
| RUN-004 | concurrency | file reads at configured concurrency | workload attempting more concurrent reads | queue remains bounded and cancellation-aware |
| RED-001 | redaction | workspace-relative evidence paths | secret-shaped environment values and absolute home paths in errors | no secret or unnecessary absolute path serialized |
| ERR-001 | malformed worker output | valid schema-versioned worker response | invalid JSON, unknown schema, snapshot mismatch, raw stack | normalized `internal_error`/`analysis_failed`; raw data withheld |

## Implementation Order

1. Build fixture helpers and positive controls without package scripts.
2. Add boundary-validation and filesystem containment pairs.
3. Add manifest, export-map, and resolver graph boundaries.
4. Add declaration/compiler process limits and termination cases.
5. Add evidence, output, redaction, and malformed-worker cases.

Tests should identify fixtures by these stable IDs so failures map back to a security invariant and
resource decision.

## Implemented Fixture Foundation

Task M1.2 provides checked-in positive layouts mapped to `CTX-002`, `CFG-002`, `CFG-003`, `EXP-001`,
`FS-001`, and `DECL-002`. It also materializes paired `CTX-001`, `FS-001`, `FS-002`, `FS-003`, and
`CFG-001` filesystem cases, including exact inclusive/over-limit manifest sizes and malformed JSON.

Later engine and worker tasks own the remaining matrix cases. Listing a case above does not claim it
is implemented; the typed catalog in `packages/test-fixtures` is the executable inventory.
