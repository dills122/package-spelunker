# TypeScript Public API Modeling Specification

- Status: Approved; pure engine implemented, bounded worker integration pending
- Task: M1.7 / WG1.2
- Updated: 2026-09-02
- Compiler baseline: Package Spelunker-pinned TypeScript 6.0.3
- MVP source compatibility: TypeScript 5.8, 5.9, and 6.0 declaration artifacts
- Semantic extraction provider: TypeDoc 0.28.20
- Depends on: M1.3 immutable snapshots, M1.6 declaration resolution and worker boundary, ADR 0003,
  ADR 0004, and ADR 0005

## Objective

Given the exact declaration target selected by M1.6, model the public TypeScript API of the selected
package artifact into a deterministic, bounded, project-owned contract for agent inspection and
expert correctness review. This is not the later semantic diff graph.

The model answers which names the selected entrypoint exports; their type, value, and namespace
meanings; their locations inside the selected artifact; their aliases, re-exports, merged
declarations, signatures, members, generic parameters, heritage, documentation summary, and
deprecation; and what was omitted or unsupported under the applied limits.

Output must be stable across npm, pnpm, and linked-workspace physical layouts. Modeling must not
execute package code, read ambient workspace files, fetch dependencies, or expose compiler objects.

The MVP targets declaration artifacts from TypeScript 5.8, 5.9, and 6.0. These lines represented
about 65% of stable TypeScript downloads in
[npm's rolling seven-day per-version data](https://api.npmjs.org/versions/typescript/last-week) on
2026-09-02.
This is a directional adoption proxy, not a unique-user count. All three lanes are analyzed through
one pinned TypeScript 6.0.3 program; loading or dispatching to a workspace compiler is out of scope.
TypeScript 7 input becomes a separate compatibility gate after the selected TypeDoc release supports
it.

## Non-Goals

- Structural type ASTs, assignability checks, or breaking-change classification.
- Cross-version member/signature identities for semantic diffing.
- Local usage indexing, source-map backreferences, or implementation-source analysis.
- Arbitrary JSDoc tags beyond a bounded summary and `@deprecated` message.
- Multi-artifact closure through dependencies, `@types`, path aliases, or ambient types.
- Synthetic default exports introduced only by interop convenience.
- Registry access, package installation, TypeScript plugins, or workspace compiler loading.

## Inputs And Authority

```ts
interface ModelPublicApiInput {
  snapshotId: string;
  entrypoint: string;
  declarationTarget: string;
  compilerVersion: "6.0.3";
  projectContextHash: string;
  limits: FirstSliceV1AppliedLimits;
}
```

- `snapshotId` identifies the exact M1.3 selected package snapshot.
- `entrypoint` is the normalized requested package subpath: `.` or `./subpath`.
- `declarationTarget` is the artifact-relative `.d.ts`, `.d.mts`, or `.d.cts` selected by M1.6.
- Compiler configuration and lookup semantics come from the validated M1.6 project context.
- Package declarations come only from immutable snapshot bytes.
- Standard libraries come only from explicitly admitted `lib.*.d.ts` files belonging to the pinned
  compiler. They are compiler context, not additional package evidence.

## Serialized Contract

All objects are closed. Display strings are bounded compiler renderings for inspection; consumers
must not parse them as a stable semantic language.

```ts
interface PublicApiDataV1 {
  entrypoint: string;
  symbols: PublicSymbolV1[];
  omission: PublicApiOmissionV1 | null;
}

interface PublicSymbolV1 {
  id: string;
  name: string;
  meanings: Array<"type" | "value" | "namespace">;
  declarationKinds: Array<
    "class" | "interface" | "function" | "variable" |
    "enum" | "type-alias" | "namespace"
  >;
  display: string | null;
  aliasChain: AliasHopV1[];
  locations: SourceLocationV1[];
  typeParameters: TypeParameterV1[];
  signatures: SignatureV1[];
  members: MemberV1[];
  heritage: HeritageV1[];
  documentation: string | null;
  deprecation: DeprecationV1 | null;
}

interface AliasHopV1 {
  targetName: string;
  sourceModule: string | null;
  location: SourceLocationV1;
}

interface SourceLocationV1 {
  path: string;
  line: number;
  column: number;
}

interface TypeParameterV1 {
  name: string;
  constraint: string | null;
  default: string | null;
}

interface SignatureV1 {
  kind: "call" | "construct";
  ordinal: number;
  display: string;
  typeParameters: TypeParameterV1[];
  location: SourceLocationV1 | null;
}

interface MemberV1 {
  name: string;
  meanings: Array<"type" | "value" | "namespace">;
  declarationKinds: Array<
    "property" | "method" | "getter" | "setter" |
    "constructor" | "index" | "call" | "construct"
  >;
  scope: "static" | "instance";
  visibility: "public" | "protected" | "private" | "unknown";
  optional: boolean;
  readonly: boolean;
  display: string | null;
  signatures: SignatureV1[];
  locations: SourceLocationV1[];
  documentation: string | null;
  deprecation: DeprecationV1 | null;
}

interface HeritageV1 {
  kind: "extends" | "implements";
  display: string;
  location: SourceLocationV1 | null;
}

interface DeprecationV1 {
  message: string | null;
}

interface PublicApiOmissionV1 {
  kind: "symbols" | "signatures" | "graph" | "external-declaration";
  limit: "maxPublicSymbols" | "maxSignaturesPerSymbol" | "maxGraphDepth" | null;
  omittedCount: number;
  subjectId: string | null;
}
```

The implementation may factor repeated schemas, but the serialized member set and semantics must
match this specification.

## Stage And Envelope Semantics

ADR 0003 is amended before schema v1 publication to add:

```ts
interface PartialStage<Data> {
  status: "partial";
  data: Data;
  failureId: string;
  evidenceRefs: string[];
}
```

- `complete`: all supported data was modeled within policy.
- `partial`: returned data is internally valid and authoritative, but one deterministic suffix or
  branch was omitted. `failureId` references the normalized failure and `data.omission` records the
  first deterministic omission.
- `failed`: no public API data is safe to trust.
- `skipped`: an earlier failure made modeling unavailable.

`omission` is null for a complete public API stage and non-null for a partial stage. The closed v1
schema permits `partial` only for public API modeling because it is the only initial stage with
defined omission semantics. Context discovery and snapshot construction cannot be partial identity;
runtime and TypeScript resolution remain complete, failed, or skipped. Extending partial to another
stage requires a future schema major with stage-specific omission data. The envelope outcome is
partial when any required stage is partial, failed, or skipped after snapshot identity completes.

For resource omissions, `limit` names the exceeded policy dimension. For an isolated external
declaration omission, `kind` is `external-declaration`, `limit` is null, `omittedCount` is the exact
number of affected root exports, and `subjectId` is the first omitted root export in contractual
order.

## Fixed Field Bounds

These schema bounds complement the aggregate resource policy:

- identifiers and names: at most 256 characters;
- entrypoint and source-module strings: at most 512 characters;
- artifact-relative paths: at most 4,096 characters and separately subject to path-byte/segment
  policy;
- display strings: at most 4,096 UTF-8 bytes after normalization;
- documentation/deprecation strings: at most 1,024 UTF-8 bytes after normalization;
- alias hops and heritage clauses: at most the `maxGraphDepth` absolute ceiling;
- type parameters: at most the `maxSignaturesPerSymbol` absolute ceiling;
- signatures: at most `maxSignaturesPerSymbol`;
- root symbols plus retained members: at most `maxPublicSymbols` in aggregate.

If a required single string or record cannot be represented within its fixed bound, omit the
independently isolatable root export as partial or fail the stage. Never cut UTF-8 bytes or syntax
mid-token and present the result as complete.

## Identity, Paths, And Ordering

Root export identity is:

```text
<normalized-entrypoint>#<percent-encoded-export-name>
```

Examples are `.#default`, `.#parse`, `./feature#Feature%20Options`, and `.#export%3D`.

- The exported name, not its alias target, owns the identity.
- Explicit default exports use `default`; TypeScript `export =` uses `export=`.
- No synthetic default is added.
- IDs exclude package version, snapshot/compiler identity, declaration path, and physical layout.
- Member and signature IDs are deferred; parent identity plus contractual order locates them.

Locations use normalized POSIX paths relative to the selected artifact and one-based line/column
positions. Absolute roots, drive prefixes, `..`, NUL, unnormalized separators, and outside-artifact
declarations are invalid at the worker boundary.

Ordering is contractual:

- root symbols by Unicode code-point export name;
- meanings and declaration kinds by fixed schema enum order;
- locations by path, line, then column;
- alias hops from exported declaration to final target;
- type parameters and heritage in declaration order;
- call/construct signatures in compiler overload order, with zero-based ordinal per kind;
- members by static before instance, then name, declaration kind, and first location.

Changing these rules after v1 publication is breaking.

## Provider And Compiler Semantics

Use TypeDoc 0.28.20 reflections as the primary semantic extraction layer over one contained
`ts.Program` built with TypeScript 6.0.3. Bootstrap TypeDoc with no configuration readers or plugins,
then pass the already-created program and selected declaration source directly to its converter.
TypeDoc must not discover package files, configuration, plugins, or ambient filesystem state.

Use public TypeScript compiler APIs only where Package Spelunker owns semantics TypeDoc does not:
authoritative entrypoint export enumeration, multi-hop alias/re-export provenance, diagnostics,
artifact-containment checks, and graph-depth enforcement. Package Spelunker normalizes TypeDoc
reflections into its closed v1 contract and must not recreate TypeDoc's declaration/member/signature
traversal. Provider/compiler objects and raw diagnostics never cross a package or process boundary.

### Exports, aliases, and merges

- Enumerate authoritative module exports from the selected declaration source file.
- Preserve requested names while recording local aliases, renamed/star re-exports, and multi-hop
  targets in `aliasChain`.
- Combine declarations TypeScript treats as one merged symbol; preserve every contained location
  and all applicable type/value/namespace meanings.
- Cycles terminate through compiler-symbol identity plus visited traversal state. Cycles alone are
  not failures or omissions.

### Signatures, generics, members, and heritage

- Record call and construct signatures in semantic overload order using bounded compiler displays.
- Record symbol- and signature-level generic names, constraints, and defaults.
- Record directly exposed static and instance members plus inherited observable members.
- Retain and classify private/protected members because they affect class compatibility; alpha does
  not classify changes.
- Record direct extends/implements clauses. Transitive inheritance appears through inherited
  members and bounded traversal, not an unbounded parallel graph.

### Documentation

- `documentation` is the normalized bounded `getDocumentationComment` summary.
- Preserve no arbitrary JSDoc tag collection.
- `@deprecated` produces `deprecation`; its normalized text is the message, or null without text.
- For an alias, exported-name documentation wins; target documentation is fallback only.

## External And Standard-Library Types

The child receives two explicit virtual roots:

```text
/package        immutable selected-package snapshot
/typescript-lib allowlisted pinned compiler lib.*.d.ts files
```

Pinned libraries are enumerated by the coordinator, brokered immutably, and included in the project
context hash. There is no ambient filesystem fallback.

If an exported surface reaches another package, `@types`, a path mapping, or an ambient workspace
declaration, omit only the affected root export and return partial `unsupported_context` with an
`external-declaration` omission when isolation is provable. Fail the public API stage when
contamination cannot be isolated. Never silently render an unresolved dependency as `any` and call
the stage complete.

## Resource And Failure Semantics

- `maxDeclarationFiles`: count unique selected-artifact declaration files admitted to the program;
  pinned standard libraries do not count. The exact limit succeeds. The next file fails the stage
  with no model because program completeness is unknown.
- `maxGraphDepth`: root export depth is zero; alias, re-export, inheritance, and nested-namespace
  edges add one. Check visited identity before depth. Exceeding returns a deterministic partial
  prefix; omission count is immediate branches not entered.
- `maxPublicSymbols`: every root export, namespace export, and retained member consumes one unit.
  Sort root exports before retention. The exact limit succeeds; over-limit returns partial with an
  exact known omission count, or fails rather than guessing.
- `maxSignaturesPerSymbol`: call and construct signatures share one count per root/member. The exact
  limit succeeds. Omit an incomplete root symbol and continue only when remaining exports are
  independent; otherwise fail rather than return a misleading prefix.
- Timeout, cancellation, memory exhaustion, crash, malformed output, snapshot/context mismatch,
  tainted diagnostics, or worker-output overflow returns no public model. Earlier stages survive.
- Evidence and final `maxOutputBytes` enforcement belong to core/serialization; the worker also
  bounds its own response before parsing.

## Worker Protocol

Reuse M1.6 lifecycle/broker code. Add a closed `model-public-api` operation; do not combine
resolution and modeling into one response.

```text
coordinator
  -> validates snapshot, declaration result, compiler, context hash, and limits
  -> admits snapshot bytes and pinned compiler libraries
  -> starts bounded child and services framed broker requests
  -> enforces wall time, heap, cancellation/grace, and output bytes
  -> validates closed result, paths, snapshot ID, and context hash
```

The protocol contains no CLI/MCP formatting or provider types.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Contract tests: `pnpm exec vitest run packages/contracts/test`
- Fixture tests: `pnpm exec vitest run packages/test-fixtures/test`
- Symbol tests: `pnpm exec vitest run packages/typescript-symbols/test`
- Worker tests: `pnpm exec vitest run packages/worker-typescript/test`
- Static: `pnpm check:static`
- Typecheck: `pnpm typecheck`
- Unit/full/integration: `pnpm test:unit`, `pnpm test`, `pnpm test:integration`
- Build/full gate: `pnpm build`, `pnpm check`

## Project Structure

```text
packages/typescript-symbols/
├── package.json
├── tsconfig.json
├── src/index.ts
├── src/model-public-api.ts
└── test/model-public-api.test.ts

packages/worker-typescript/
├── src/{protocol,child,coordinator,context}.ts
└── test/{protocol,coordinator,workspace-integration}.test.ts
```

`typescript-symbols` owns compiler-backed symbol semantics. `worker-typescript` owns process,
protocol, and capabilities. Production callers use the worker operation.

## Code Style

Use frozen discriminated unions and fixed safe failures:

```ts
type PublicApiModelResult =
  | { readonly ok: true; readonly value: PublicApiModel }
  | { readonly ok: false; readonly failure: PublicApiModelFailure };
```

Normalize unknown compiler/worker data at the owning boundary. Expected failures return values.
Boundary paths are virtual or artifact-relative POSIX paths.

## Testing Strategy

| Fixture | Coverage |
| --- | --- |
| `API-SIMPLE` | const, function, interface, type alias, class, enum, namespace, default, `export =` |
| `API-ALIAS` | local alias, renamed/star re-export, multi-hop chain |
| `API-MERGED` | class/function plus namespace, interface merging, simultaneous meanings |
| `API-SIGNATURES` | overload order, call/construct, optional/rest/`this`, exact limits |
| `API-GENERICS` | symbol/signature parameters, constraints, defaults |
| `API-MEMBERS` | static/instance, optional/readonly, visibility, inheritance |
| `API-DOCS` | summary, alias precedence, deprecation with/without text |
| `DECL-002/003` | cycle, depth, declaration-file boundaries |
| `API-001/002` | symbol/member and signature boundaries |
| `API-STABILITY` | byte-identical model across npm, pnpm, linked, alternate roots |
| `API-EXTERNAL` | pinned-lib positive and external/ambient negative controls |

Portable goldens contain no home paths, drive letters, physical pnpm-store paths, timestamps,
snapshot IDs, or raw diagnostics. Every unsafe/unsupported case has a positive control. Execution
sentinels prove package and workspace code never runs.

## Boundaries

- Always: use exact M1.6/M1.3 inputs; validate closed contracts; preserve stable order; count limits
  exactly; sanitize compiler data; run production analysis in the bounded child.
- Ask first: change fields/order, broaden compiler authority, add an artifact, change limits, use a
  workspace compiler/plugin, or combine resolution and modeling.
- Never: execute/import package code, read ambient files, fetch/install dependencies, expose raw
  compiler data, guess omissions, return absolute paths, or label unresolved external types complete.

## Delivery Tasks

- [x] Correct v1 contracts and goldens through a red-green increment.
  - Acceptance: complete/partial/failed/skipped and the shallow model validate.
  - Verify: focused contract tests.
- [x] Add semantic and exact-boundary fixtures.
  - Acceptance: every testing row has deterministic positive/adversarial coverage.
  - Verify: fixture integrity and integration tests.
- [x] Implement stable simple export modeling.
  - Acceptance: identities, locations, meanings, ordering, and layout stability pass.
  - Verify: symbol tests, typecheck, build.
- [x] Add aliases, merges, signatures, members, docs, and limits in focused slices.
  - Acceptance: each slice adds only approved semantics and leaves gates green.
  - Verify: focused goldens then full tests.
- [ ] Add the operation-specific bounded worker path.
  - Acceptance: package/pinned-lib authority and fail-closed lifecycle cases pass.
  - Verify: protocol, lifecycle, integration, and no-execution tests.
- [ ] Reconcile docs and independently review M1.7.
  - Acceptance: plan, matrix, architecture, security, roadmap, README, and handoff match.
  - Verify: full gate and fresh-context review.

## Success Criteria

- Supported features are represented exactly or explicitly unsupported.
- Output is independent of absolute roots and physical package layout.
- Cycles terminate and every boundary has exact at/over behavior.
- Safe partial data is explicit, deterministic, and paired with failure/omission details.
- Contaminated compiler output never crosses as authoritative.
- Selected-artifact declarations and pinned libraries are the only compiler read authority.
- Full checks, integration, build, and independent review pass.

## Approval Gates

Approved by the project owner on 2026-08-15:

1. [x] Use the fourth `partial` stage and `PublicApiOmissionV1` above.
2. [x] Use entrypoint/export-name IDs and documented order.
3. [x] Include inherited and private/protected members while deferring compatibility classification.
4. [x] Limit JSDoc to summary and deprecation.
5. [x] Permit only selected-artifact declarations plus pinned TypeScript standard libraries.
6. [x] Treat reachable external/ambient declarations as partial only when isolation is provable;
       otherwise fail unsupported.
