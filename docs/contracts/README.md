# Contract Design Fixtures

This directory records the accepted serialized vocabulary before implementation. ADR
[0003](../decisions/0003-versioned-contract-envelopes.md) owns the compatibility decision.

- [`v1/`](v1/) contains the installed-package investigation version 1 design fixtures.

These files are review inputs, not yet executable public schemas. Task M1.1 moves the canonical
schemas into `packages/contracts`, mechanically derives or checks TypeScript types and validators,
and turns these examples into golden validation tests. At that point this directory becomes a short
guide linking to the executable source of truth.
