# Security Model

## Security Objective

Inspect and index untrusted TypeScript/JavaScript workspaces and Node package artifacts without
executing package/project code, escaping approved filesystem roots, persisting unintended sensitive
content, consuming unbounded resources, or allowing providers/retrieval results to change facts
under investigation.

## Untrusted Inputs

- CLI and MCP arguments.
- Workspace paths, manifests, lockfiles, `tsconfig`, patches, and symlinks.
- Installed package files and registry archives.
- Registry metadata and network responses.
- Declaration, JavaScript, source map, documentation, and diagnostic content.
- Source code, tests, documentation, Git metadata/diffs, generated files, binary files, and comments
  that may contain prompt injection or secrets.
- Search queries, retrieval scores, embedding vectors, model artifacts, and persisted index content.
- Third-party library and external-provider output.

## Core Invariants

1. Never import, require, dynamically import, evaluate, or run inspected package code.
2. Accept an explicit approved workspace root; canonicalize and contain every workspace file read.
3. Registry retrieval accepts structured package name plus exact version, not arbitrary npm specs.
4. Registry v1 permits registry artifacts only: no Git, directory, file, or arbitrary URL sources.
5. Verify registry integrity before creating a snapshot or handing bytes to a provider.
6. Inspect archive entries without path traversal, absolute paths, device files, or escaping links.
7. Require regular files where content is expected and bound file, archive, graph, output, and cache
   sizes before allocation.
8. Bound concurrency, recursion, retries, network timeouts, worker time, worker memory, and output.
9. Send one immutable snapshot to every provider involved in an investigation.
10. Keep credentials, environment values, tokens, local paths not needed as evidence, and package
    content out of logs and errors.
11. Never treat retrieved text, comments, documentation, provider messages, or model output as
    instructions to broaden capabilities or execute commands.
12. Separate safe-static, isolated-static, trusted-workspace, and remote provider capabilities; no
    provider may silently escalate modes.
13. Bind persisted facts and retrieval rows to workspace snapshot, provider, schema, normalizer,
    exclusion, and optional embedding identities.
14. Bound retrieval breadth, graph fan-out/depth, result count, context tokens, index size, and
    incremental work before allocation or traversal.

## Package Execution Prohibitions

Do not use package-manager install, pack, prepare, build, postinstall, `node -e require(...)`, or
dynamic import as discovery mechanisms. Do not invoke `publint` automatic package-manager packing.
Do not permit `pacote` Git, directory, file, or arbitrary remote URL specifications in the initial
registry provider.

Static JavaScript syntax hints may be reported as heuristic evidence only.

Default repository indexing also prohibits loading executable project configuration, compiler
plugins, build plugins, Git hooks, external diff/textconv helpers, or tool-specific workspace
plugins. Providers that require these capabilities run only in explicit trusted-workspace mode.
Generated JavaScript configuration such as Yarn `.pnp.cjs` is executable project code even when a
package manager created it; loading it is never a safe-static discovery operation.

Node's permission model may add defense in depth for compatible child processes, but it is not a
security sandbox. Native modules, symlink behavior, worker inheritance, and explicitly granted
capabilities prevent it from replacing byte brokering, process isolation, or no-execution rules.

## Filesystem Boundary

- Canonicalize the approved root and selected artifact root.
- Validate package names before mapping them into filesystem paths.
- Re-check canonical containment immediately before opening a selected file.
- Use descriptor-based bounded reads where practical.
- Permit a workspace/package-root symlink when its canonical target is the approved artifact root.
- Reject a selected package file or archive link that resolves outside that canonical root.
- Avoid following directory symlinks during recursive discovery unless an explicit, cycle-safe rule
  permits the canonical target.

Containment tests require both escaping-symlink rejection and a legitimate workspace-symlink
positive control.

The first installed/workspace implementation re-walks symlinks under named hop/path budgets,
rechecks artifact containment before reads and directory traversal, refuses final symlinks when
opening canonical files, compares descriptor and path identity, streams capped directory entries,
and captures immutable in-memory bytes. Portable Node APIs do not provide an `openat`-style
capability walk, so hostile concurrent parent-directory mutation remains a residual platform risk;
the implementation still guarantees that analyzers consume only the bounded bytes retained in the
completed snapshot.

Workspace discovery validates bare/scoped package specifiers and optional subpaths before filesystem
mapping, rejects encoded paths, traversal, NULs, protocols, and arbitrary URLs, and resolves the
explicit importer before reading workspace configuration. npm/pnpm manifests and workspace configs
use `maxManifestBytes`; lockfiles use `maxLockfileBytes`. Package-manager ambiguity, unsupported
workspace patterns, missing packages, escaping installed links, and outside-root importers become
fixed typed failures without raw paths or Node errors. Only canonical roots remain as internal
filesystem capabilities; evidence paths are workspace-relative.

## Runtime Resolution Boundary

Node runtime resolution consumes only the completed immutable package snapshot. It parses the
retained root `package.json` bytes to preserve conditional-export key order and probes target
existence through the snapshot's copy-returning `readFile` capability; it never reopens a live path.

- Runtime conditions must select exactly one `import` or `require` lookup kind. Built-in conditions
  are normalized deterministically, while manifest insertion order controls branch priority.
- Export targets must start with `./` and are rejected before lookup for traversal, dot segments,
  `node_modules`, encoded separators, NULs, backslashes, absolute paths, or URLs.
- An `exports` field encapsulates unlisted subpaths and never falls through to `main`.
- Exports-absent import lookup is exact. Require fallback remains snapshot-contained and may select
  `.js`, `.json`, `.node`, or directory forms; non-JavaScript targets become
  `unsupported_context` rather than being opened or executed.
- Export-map nodes, graph depth, trace steps, and cancellation are checked during traversal. Trace
  fields contain bounded package-relative values and fixed project-owned outcomes.

Focused adversarial tests pair every unsafe target and budget rejection with valid export, pattern,
array, legacy, and fixture-backed controls. npm, pnpm, and linked-workspace execution sentinels prove
that selecting a target never evaluates package code.

## Archive Boundary

Registry tarballs are untrusted even when integrity matches registry metadata. Before extraction:

- limit compressed and expanded sizes, entries, per-file size, path depth, and name length;
- reject absolute paths, `..` traversal, NULs, device nodes, and unsupported entry types;
- define symlink and hardlink policy explicitly;
- extract into a fresh private directory and prove every destination remains contained;
- clean up on success, failure, timeout, and cancellation.

## Worker Isolation

Heavy or independently versioned analyzers such as ATTW and potentially `publint` or API Extractor
run behind worker contracts. Each worker receives a bounded snapshot, explicit capability, timeout,
memory/output budget, and cancellation signal. It has no authority to choose or fetch a different
artifact. Worker crashes, hangs, and malformed output become normalized provider failures rather
than process-wide failures.

Process isolation is stronger than worker threads and may be required for analyzers that cannot
reliably respect memory or lifecycle limits. This choice remains an implementation decision that
must be threat-modeled before the first provider ships.

The custom TypeScript resolution stage implements the ADR
[0004](decisions/0004-first-slice-resource-policy.md) process boundary. It runs the pinned compiler
in a terminable child with `/` as its working directory, an empty environment, bounded framed broker
pipes, a lowered heap ceiling, and no ambient filesystem host. Package probes map only to completed
immutable snapshot bytes at both logical and canonical roots. Workspace probes are canonicalized,
contained, restricted to resolution metadata, byte/entry bounded, and memoized—including absence.
The parent independently hashes the exact broker observations and accepts success only when the
child returns the same project-context hash, snapshot identity, compiler version, conditions, trace,
and normalized package-relative target. Wall time, cancellation grace, output, crash/OOM, protocol
failure, and malformed responses fail closed without returning stderr or raw local paths. The same
boundary will be reused by public API modeling; it does not settle later third-party provider
isolation decisions.

Public API modeling treats physical containment as insufficient proof of package ownership.
Declarations beneath a nested `package.json` or any nested `node_modules` segment are external even
when captured under the selected snapshot root. TypeDoc reflection sources and every reachable
reference-type file are checked against selected-package ownership or the explicit pinned compiler
library root before a root export may be labeled complete. Package and compiler-library roots are
disjoint, and the compiler host admits only pinned `lib*.d.ts` files from that library root.

## Repository Provider Boundary

Every provider declares and enforces one execution mode:

- `safe-static` receives admitted immutable bytes or bounded file lists and has no project-code
  execution authority;
- `isolated-static` runs through a closed protocol with fixed executable/version, controlled working
  directory/environment, approved roots, and memory/time/output/cancellation controls;
- `trusted-workspace` may load project configuration/plugins only after explicit caller opt-in and
  must never be enabled by file contents or provider request;
- `remote-enrichment` requires explicit network capability and returns non-authoritative enrichment.

Specific initial restrictions:

- Manypkg runs only after workspace patterns are proven unable to escape approved roots; if its read
  behavior cannot be capability-contained, use a materialized snapshot view or reject context;
- package-manager-detector receives explicit admitted root/strategies, cannot crawl above approved
  root, and never exposes its install/run command helpers;
- dependency-cruiser receives explicit options and `tsconfig` data; it does not import arbitrary JS
  configuration or recursively scan outside approved roots;
- Nx runs with daemon disabled in an isolated trusted-workspace provider because project-graph
  plugins may execute workspace code;
- Knip uses bounded JSON/custom-reporter output in isolated trusted-workspace mode and cannot expose
  raw provider objects as contracts;
- SCIP, API Extractor, and TypeDoc run in bounded processes against admitted projects/bytes;
- ast-grep parses admitted bytes or explicit bounded paths and cannot apply edits in analysis mode;
- esbuild input is an existing bounded metafile or an explicitly admitted static scan; Package
  Spelunker never loads build config/plugins or invokes project builds implicitly;
- Arborist is limited to read-only tree inspection; reify, audit/network, install, and mutation paths
  are outside capability;
- Git commands use fixed read-only arguments, disable external diff/text conversion, and never run
  hooks.

File-watcher events are untrusted scheduling hints, not snapshot truth. Incremental indexing
reconciles them against a bounded content manifest and must converge to the same state as a clean
rebuild after lost, duplicated, reordered, or coalesced events.

Provider stdout/stderr, paths, diagnostics, and malformed records are untrusted and bounded before
parsing. Successful normalization requires provider version, requested snapshot identity, and
complete protocol framing.

## Persistent Index Boundary

Repository intelligence persists derived local source facts, so cache policy is a security
contract rather than a performance detail.

- Store database under explicit app/project cache location with private permissions; never commit it
  to repository by default.
- Record schema, normalization, provider, exclusion, and workspace snapshot versions.
- Apply updates transactionally; incomplete provider runs cannot become current.
- Use prepared statements for all source/provider/query values. Never interpolate FTS or SQL from
  untrusted input.
- Bound database, WAL, row, document, token, vector, and evidence sizes; define cleanup and recovery.
- Exclude or redact secrets, credentials, ignored/private paths, generated/vendor content, and
  unnecessary absolute paths according to accepted policy before persistence.
- Treat database as untrusted on open: validate schema/application ID/version and recover/rebuild
  rather than accepting incompatible rows.
- SQLite extensions are pinned project dependencies loaded from resolved project-owned paths only;
  never load extension paths from workspace configuration.
- Embedding inference runs in a different process from the SQLite writer/vector-query boundary;
  native extension and model-runtime failure cannot corrupt the current complete index.
- Embedding model artifacts, revisions, licenses, hashes, dimensions, pooling, normalization, and
  tokenizer versions participate in index identity.

Automatic model download is network access and must be explicit. Offline mode uses pre-fetched,
hash-verified artifacts. Vector retrieval remains disabled until extension/runtime compatibility and
evaluation gates pass.

## Retrieval and Context Boundary

Source, comments, docs, package metadata, provider diagnostics, and retrieved chunks are data, even
when they contain instructions addressed to an agent.

- Retrieval scores select candidates only; they do not establish truth or authority.
- Context planner links candidates to canonical entities/evidence before promotion where possible.
- Keep lexical, semantic, compiler, resolver, diagnostic, enrichment, and heuristic reasons
  distinguishable.
- Apply path/project/capability scope before ranking and graph expansion.
- Bound top-k, fan-out, depth, candidate bytes, deduplication work, context items, and estimated
  tokens.
- Mark unsupported, missing, conflicting, stale, or truncated evidence as unknown/partial.
- Do not include secrets merely because retrieval ranks them highly; exclusion/redaction precedes
  indexing and context assembly.
- Final LLM prose is not stored as authoritative fact unless separately validated and normalized.

## Resource Budget Policy

Installed-package investigation uses the versioned `first-slice-v1` policy defined by ADR 0004.
The policy sets defaults and non-disableable ceilings for input bytes, path and symlink traversal,
filesystem and graph breadth, declaration/compiler work, evidence/output, wall time, memory,
cancellation, and concurrency.

- Callers may lower supported budgets but cannot disable them or exceed policy ceilings.
- Exceeded limits become typed `resource_limit_exceeded` failures with the exact stage and limit.
- Limit behavior preserves completed authoritative stages but never silently truncates unsafe or
  identity-critical data.
- Oversized JSON is replaced with a compact valid envelope under a reserved emergency ceiling; raw
  bytes are never cut mid-document.
- Raising a ceiling requires a versioned policy and security review.

The paired positive/adversarial acceptance inventory is maintained in
[`../fixtures/matrix.md`](../fixtures/matrix.md).

## Network Boundary

- Local installed-package inspection is network-free by default.
- Registry and enrichment access is explicit in the requested capability.
- Enforce HTTPS, allowed hosts, response limits, redirects, timeouts, cancellation, and bounded
  retries.
- Cache keys include provider version, exact coordinates, integrity, and relevant context.
- Documentation and health providers cannot override authoritative local or verified-artifact facts.

## MCP Boundary

- Use structured, schema-validated tool arguments rather than arbitrary npm specifications or shell
  fragments.
- Keep approved roots and capabilities explicit per request or server configuration.
- Return stable error codes and bounded evidence, not raw filesystem dumps.
- Do not expose general file-read, command-execution, package-install, or arbitrary-fetch tools.
- Apply output pagination or evidence handles before results can exceed the response budget.

## Required Adversarial Fixtures

- package and subpath traversal attempts;
- escaping file and directory symlinks plus legitimate workspace symlinks;
- malformed, cyclic, and deeply nested export maps and declaration graphs;
- oversized manifests, declarations, archives, metadata, diagnostics, and output;
- tar path traversal, absolute entries, symlinks, hardlinks, duplicate paths, and decompression bombs;
- resolution cycles and large workspaces;
- provider timeout, cancellation, crash, memory pressure, malformed response, and snapshot mismatch;
- secrets and sensitive paths in errors, logs, and evidence serialization.

## Deferred Decisions

- Archive budgets for the later registry milestone.
- Worker thread versus subprocess isolation per third-party provider.
- Cache location, eviction, permissions, ignored/private path policy, and sensitive-content
  redaction before Slice R3.
- Trusted-workspace authorization UX and provider allowlist before Nx/Knip integration.
- Embedding model/distribution policy and SQLite vector-extension support before semantic retrieval.
- Registry authentication scope and configuration.
- Public vulnerability reporting channel and supported-version policy.
