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
- [`test-fixtures/`](test-fixtures/) — typed fixture catalog, inert npm/pnpm/workspace layouts, and
  generated positive/adversarial filesystem cases.

All other package boundaries in the architecture are planned and should be created only when their
vertical-slice task begins.
