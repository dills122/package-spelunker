# Fixtures

Deterministic workspaces and package artifacts used to test resolution, public API modeling,
provider normalization, and security boundaries belong here. Do not rely on mutable registry state
for unit or integration fixtures.

The planned positive/adversarial inventory and stable fixture IDs are maintained in
[`matrix.md`](matrix.md). Add fixture data only when a task implements the corresponding behavior;
do not create large placeholder trees.
