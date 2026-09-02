# Initial Ecosystem and Provider Research

- Captured: 2026-08-14
- Status: Historical research input; revalidate versions, APIs, security posture, and licenses before
  adopting a dependency.

Current repository-intelligence provider decisions supersede this document's implementation
recommendations. See
[`repository-intelligence-provider-stack.md`](repository-intelligence-provider-stack.md). Package
provider research below remains historical input for registry/diagnostic milestones.

## Research Conclusion

The strongest architecture is a package-investigation orchestrator with a canonical package model,
not a ground-up replacement for every analyzer and not an MCP server that merely calls many other
MCP servers.

The project's custom value is the connective tissue:

- understand the user's actual workspace and installed dependency graph;
- select the exact package artifact, importer, public entry point, and conditions;
- create one immutable snapshot shared by every analyzer;
- normalize specialist output without losing evidence or authority;
- distinguish facts, diagnostics, documentation, and heuristics;
- compare package surfaces and relate changes to local source usage;
- present one coherent investigation instead of disconnected tool output.

## Candidate Integration Matrix

| Project | Preferred integration | Intended role | Key restriction |
| --- | --- | --- | --- |
| `pacote` | direct library | registry metadata, exact manifests, tarballs, integrity, npm cache | registry artifacts only; no Git, directory, file, or arbitrary remote specs |
| `@manypkg/get-packages` | direct library | workspace root and workspace package discovery | deeper config and dependency modeling remains ours |
| `package-manager-detector` | direct library | identify npm, pnpm, Yarn, Bun, and lockfile context | detection does not define actual resolver behavior |
| `publint` | direct library or worker | publication/manifest diagnostics | supply exact files/tarball; disable automatic package-manager packing |
| `@arethetypeswrong/core` | isolated worker | TypeScript publication and module-resolution diagnostics | bounded snapshot input; cannot choose/fetch a different artifact |
| Context7 | optional SDK/API provider | version-aware docs, examples, migrations, configuration explanations | enrichment only; network/credential/quota dependent |
| npm Sentinel | optional external provider/MCP | health, adoption, maintenance, vulnerability, ecosystem metadata | avoid for basic deterministic manifest retrieval |
| API Extractor | optional later worker | formal API reports and secondary declaration-surface comparison | best for known declaration entries/configured package shapes |
| `resolve.exports` | secondary checker/test oracle | compare export-map decisions and generate disagreement fixtures | not authoritative alone |
| `ts-docs-mcp` | reference implementation | UX, caching, declaration retrieval, workflow ideas | regex/line parsing is not the semantic core |

## `pacote`

`pacote` is the strongest registry reuse candidate. Its programmatic operations cover package
manifests, full metadata/version history, tarball retrieval and extraction, npm cache integration,
and integrity validation.

The public adapter should accept a structured name and exact version:

```ts
interface RegistryPackageProvider {
  getMetadata(name: string): Promise<PackageMetadata>;
  getManifest(name: string, version: string): Promise<PackageManifest>;
  getTarball(name: string, version: string): Promise<VerifiedTarball>;
}
```

Do not expose arbitrary npm-style specifications. `pacote` supports Git, directories, files, and
remote URLs, and some flows can cause preparation behavior. The first provider allows registry
artifacts only and applies explicit hosts, sizes, redirects, timeouts, cancellation, integrity, and
archive-entry policy.

## Workspace Discovery

`@manypkg/get-packages` can remove routine workspace-root and workspace-package discovery. The custom
workspace model still owns configuration relevant to actual resolution and upgrade impact:

- `pnpm-workspace.yaml`, pnpm catalogs, patches, overrides, and `workspace:` protocols;
- npm overrides and Yarn resolutions;
- nested package fields and exact dependency edges;
- TypeScript project references and path aliases;
- Nx or other tool metadata that materially affects selection or resolution.

`package-manager-detector` supplies likely package-manager and lockfile context. It does not replace
the canonical dependency/resolution model.

## `publint`

`publint` can analyze a supplied tarball, supplied package files, or an existing package directory.
The safe adapter supplies the exact snapshot rather than letting it run package-manager packing.

Normalized output is diagnostic rather than authoritative:

```ts
interface PublicationDiagnostic {
  provider: "publint";
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  evidence: EvidenceReference[];
}
```

Initial research noted a command-injection issue reported and fixed in the separate `@publint/pack`
path. Regardless of current fix status, avoiding subprocess-based automatic packing is simpler and
consistent with the static-analysis threat model.

## Are the Types Wrong

`@arethetypeswrong/core` answers whether a published package presents correct TypeScript/module
behavior across resolution modes. It does not answer what one exact importer in the user's project
actually resolves.

It should run behind a terminable, resource-bounded adapter because TypeScript analysis can be
heavy, its model/version evolves independently, and pathological packages can consume substantial
time or memory. The main process creates and verifies the snapshot; the ATTW worker receives those
same bounded bytes and returns normalized diagnostics.

Candidate normalized categories include module format, resolution, missing types, false ESM/CJS,
and entrypoint problems.

## API Extractor

API Extractor has a mature programmatic interface and can generate reviewable API reports from
declaration entry points. It is valuable later for formal reports or secondary diff evidence, but is
not the core arbitrary-package explorer because it often expects a known declaration entry,
configuration, and build-like declaration environment. Conditional and multi-entry packages require
additional mapping.

It should complement the normalized symbol graph rather than replace it.

## Context7

Context7-style integration is useful for migration guidance, examples, configuration intent, and
recommended current patterns. It follows the local semantic answer:

1. identify exact installed package and version;
2. resolve the relevant entry and symbol;
3. inspect the shipped declaration selected by the project;
4. retrieve documentation matching that identity/version;
5. label documentation as external enrichment.

It remains optional because it adds network availability, credentials/quotas, and the possibility
that indexed docs do not match a patched, prerelease, or locally linked artifact. Prefer an SDK/API
over running a nested MCP server when a clean programmatic interface exists.

## npm Sentinel

npm Sentinel research identified useful health, versions, dependencies, vulnerability, download,
bundle-size, maintenance, and ecosystem operations. Its current architecture appeared coupled to
MCP handlers, global state, current working directory, and MCP response shapes rather than a clean
domain library.

Treat it as an optional health-intelligence provider, invoked only for maintenance/adoption/security
questions. Use `pacote` for deterministic registry identity and manifest retrieval.

## Projects Not Chosen as Foundations

### `ts-docs-mcp`

Useful workflow and presentation ideas do not compensate for a declaration parser based largely on
line processing, regular expressions, and brace counting. That approach will struggle with aliases,
declaration merging, mapped/conditional types, namespaces, complex generics, inheritance, overloads,
`export =`, type-only exports, and real module context. Borrow ideas or test cases where licensing
permits; use the TypeScript compiler for semantics.

### `resolve.exports`

Useful as a small helper and comparison oracle. Edge cases around wildcards, nested conditions,
paths, and priority make it unsuitable as the only authority. Compare our result against Node,
TypeScript, and `resolve.exports`; disagreements become explicit fixtures.

## Custom Capabilities We Must Own

### Canonical snapshots

One content-identified snapshot carries installed/workspace/registry identity, root or verified
tarball, content hash/integrity, importer/workspace/conditions/tsconfig context, and a normalized
manifest.

### Importer-specific resolution

Model the exact importer, installed package instance, active workspace, `tsconfig`, Node versus
TypeScript resolution, runtime versus declaration targets, ESM/CommonJS, conditions, pnpm symlink
layout, aliases, and references.

### Compiler-backed symbol exploration

Own TypeScript Program/Language Service integration for exports, aliases, re-export chains, members,
inheritance, overloads, generics, signatures, JSDoc, deprecations, declaration locations, and
type/value distinctions.

### Semantic API diff

Maintain a stable project-owned `PublicSymbol` representation and classify entrypoint, symbol,
signature, member, return, parameter, and generic changes. API Extractor may augment this but does
not define the internal schema.

### Local usage impact

Map semantic changes to imports and usages in the actual workspace so an upgrade report can identify
the exact required edits and distinguish unaffected call sites.

### Evidence/conflict resolution

Every provider result includes provider/version, authority, snapshot identity, data, evidence,
warnings, and generation metadata. Conflicts are presented, not flattened into an invented answer.

## Recommended First Implementation Boundary

Reuse:

- `@manypkg/get-packages`
- `package-manager-detector`
- `pacote`
- `publint`
- `@arethetypeswrong/core`

Custom:

- approved workspace-root and config model;
- immutable package snapshots and evidence;
- importer-specific Node and TypeScript resolution;
- compiler-backed symbol exploration;
- normalized provider contracts;
- thin CLI first and MCP tool contracts after the core path is stable.

The first usable slice discovers a workspace, resolves an installed package from an importer,
retrieves one exact candidate version, enumerates and compares entry points/public symbols, runs
bounded publication diagnostics against the same bytes, and explains results with file-level
evidence.

## Research Sources

These were the principal sources cited by the supplied initial research. Re-open primary docs and
review current versions, licenses, advisories, and APIs before integration.

- [npm/pacote](https://github.com/npm/pacote)
- [Thinkmill/manypkg](https://github.com/Thinkmill/manypkg)
- [package-manager-detector](https://github.com/antfu-collective/package-manager-detector)
- [publint](https://github.com/publint/publint)
- [publint issue 236](https://github.com/publint/publint/issues/236)
- [Are the Types Wrong core](https://github.com/arethetypeswrong/arethetypeswrong.github.io)
- [API Extractor programmatic invocation](https://api-extractor.com/pages/setup/invoking/)
- [API Extractor multi-entry discussion](https://github.com/microsoft/rushstack/issues/3274)
- [Context7](https://github.com/upstash/context7)
- [resolve.exports](https://github.com/lukeed/resolve.exports)
