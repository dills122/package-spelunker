# Packages

Domain contracts, analysis engines, providers, and isolated-worker adapters belong here. Package
boundaries and dependency direction are defined in `docs/architecture.md` before implementation.

Implemented:

- [`contracts/`](contracts/) — versioned installed-package request/result schemas, derived
  TypeScript types, normalized runtime validation, and first-slice resource-policy vocabulary.
- [`package-snapshot/`](package-snapshot/) — approved-root and artifact containment, bounded static
  reads, manifest normalization, and immutable installed/workspace content identity.
- [`workspace-model/`](workspace-model/) — safe package-specifier parsing, importer/workspace
  discovery, package-manager/config evidence, and exact installed or linked package selection.
- [`node-resolution/`](node-resolution/) — snapshot-only Node 22 export-map and legacy runtime
  target selection with explicit conditions, module format, bounded traces, and typed failures.
- [`typescript-symbols/`](typescript-symbols/) — deterministic compiler-backed public API modeling
  over an explicit virtual file host.
- [`test-fixtures/`](test-fixtures/) — typed fixture catalog, inert npm/pnpm/workspace layouts, and
  generated positive/adversarial filesystem cases.

All other package boundaries in the architecture are planned and should be created only when their
vertical-slice task begins.

Repository-intelligence expansion adds logical ownership for workspace snapshots, normalized
semantic entities/edges, persistent index, retrieval, and context planning. These are logical
domains, not instructions to create five packages immediately. Provider adapters should wrap
selected tools from `docs/research/repository-intelligence-provider-stack.md`; project packages own
normalization and contracts, never provider-specific objects.
