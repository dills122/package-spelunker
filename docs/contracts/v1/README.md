# Installed Package Investigation Contract v1

Status: executable and covered by golden validation tests in
[`packages/contracts`](../../../packages/contracts/).

The installed request contract accepts an approved workspace root, importer, bare/scoped package
specifier with optional subpath, explicit runtime/TypeScript conditions, optional `tsconfig`, and
caller-lowered first-slice budgets. URLs, protocols, absolute package targets, and relative package
targets are rejected at the request boundary.

Both `runtimeConditions` and `typescriptConditions` contain exactly one of `import` or `require` so
their lookup context is never inferred ambiguously. A complete TypeScript resolution records the
selected-package-relative declaration target, exact analysis compiler version, nullable project
config path, supported module-resolution mode, lookup kind, and normalized active conditions.

## Envelope

Every result contains the same top-level fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Exact workflow schema major; `"1"` for these examples. |
| `kind` | Exact workflow discriminator; `installed-package-investigation`. |
| `outcome` | `success`, `partial`, or `failure`. |
| `context` | Sanitized, normalized request context, or `null` when it cannot be represented safely. |
| `stages` | Fixed results for context, snapshot, runtime, TypeScript, and public API stages. |
| `failures` | Normalized operational failures referenced by failed/skipped stages. |
| `warnings` | Non-fatal conditions that do not change stage status. |
| `evidence` | Bounded evidence records referenced by result-local ID. |
| `limits` | Policy version, applied budgets, observed usage, and exceeded dimensions. |
| `metadata` | Tool version and generation metadata that do not define artifact identity. |

Public objects are closed. Unknown members are invalid once the executable schema is published.

## Outcomes and Stages

- `success`: every required stage is `complete`.
- `partial`: at least one authoritative stage is complete and a required later stage is `failed`,
  `skipped`, or—only for `publicApiModel` in v1—`partial` with bounded data and explicit omission
  metadata.
- `failure`: the investigation could not establish the minimum useful package snapshot identity.

Stage objects use `status` as their discriminant:

- `complete` includes `data` and `evidenceRefs`;
- `partial` includes bounded `data`, `failureId`, and `evidenceRefs` for public API modeling;
- `failed` includes `failureId`;
- `skipped` includes `becauseFailureId`.

The fixed first-slice stage keys are:

1. `contextDiscovery`
2. `snapshotConstruction`
3. `runtimeResolution`
4. `typescriptResolution`
5. `publicApiModel`

## Initial Failure Vocabulary

| Code | Typical stage | Meaning |
| --- | --- | --- |
| `invalid_request` | request/context | Input failed boundary validation. |
| `outside_approved_root` | context/snapshot | A selected path escaped the approved root. |
| `package_not_found` | context | No exact installed package could be selected. |
| `unsupported_context` | context/resolution | The requested package-manager or resolver mode is outside first-slice support. |
| `malformed_artifact` | snapshot/resolution | Required package data is structurally invalid. |
| `resource_limit_exceeded` | any analysis stage | A named applied budget was reached. |
| `resolution_failed` | runtime/TypeScript | Resolution completed without a valid target. |
| `analysis_failed` | public API | Compiler-backed modeling could not complete. |
| `cancelled` | any stage | The caller cancelled the investigation. |
| `internal_error` | application boundary | An unexpected error was safely normalized. |

Failure `message` text is for humans and is not stable. Consumers branch on `code`, `stage`, and
`isRetryable`. Raw exceptions, stacks, environment values, and arbitrary provider details are never
serialized.

## Examples

- [`installed-success.example.json`](installed-success.example.json)
- [`installed-partial.example.json`](installed-partial.example.json)
- [`installed-public-api-partial.example.json`](installed-public-api-partial.example.json)
- [`installed-failure.example.json`](installed-failure.example.json)

Examples use workspace-relative paths and fixed timestamps so they are portable and deterministic.
They intentionally contain only first-slice fields.
