# Fixtures

Deterministic workspaces and package artifacts used to test resolution, public API modeling,
provider normalization, and security boundaries belong here. Do not rely on mutable registry state
for unit or integration fixtures.

The positive/adversarial inventory and stable fixture IDs are maintained in
[`matrix.md`](matrix.md). Checked-in inert workspace layouts live in [`workspaces/`](workspaces/).
Generated traversal, symlink, cycle, malformed-input, and byte-boundary cases are materialized by
[`../packages/test-fixtures/`](../packages/test-fixtures/) into caller-owned temporary directories.

Add fixture data only when a task implements the corresponding behavior; do not create large
placeholder trees. Fixture packages must omit lifecycle scripts, and runtime entries must remain
execution sentinels rather than useful executable code.
