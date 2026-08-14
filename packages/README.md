# Packages

Domain contracts, analysis engines, providers, and isolated-worker adapters belong here. Package
boundaries and dependency direction are defined in `docs/architecture.md` before implementation.

Implemented:

- [`contracts/`](contracts/) — versioned installed-package request/result schemas, derived
  TypeScript types, normalized runtime validation, and first-slice resource-policy vocabulary.

All other package boundaries in the architecture are planned and should be created only when their
vertical-slice task begins.
