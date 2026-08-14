# Contract Design Fixtures

This directory records the accepted serialized vocabulary before implementation. ADR
[0003](../decisions/0003-versioned-contract-envelopes.md) owns the compatibility decision.

- [`v1/`](v1/) contains the installed-package investigation version 1 design fixtures.

The executable source of truth is [`../../packages/contracts/`](../../packages/contracts/). Its
tests validate these deterministic examples as golden instances of the version 1 result schema.
The examples remain review-friendly documentation; they are not an independently editable schema.
