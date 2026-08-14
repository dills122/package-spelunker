# Documentation Index

## Start Here

1. [`../README.md`](../README.md) for the project overview and current phase.
2. [`product-brief.md`](product-brief.md) for the product problem and first-release outcome.
3. [`architecture.md`](architecture.md) and [`security-model.md`](security-model.md) for technical
   boundaries.
4. [`implementation-plan.md`](implementation-plan.md) for the next ordered, verifiable work.
5. [`handoff.md`](handoff.md) when continuing the current repository state in a new session.

## Document Ownership

| Document | Classification | Owns |
| --- | --- | --- |
| [`product-brief.md`](product-brief.md) | canonical product contract | problem, users, goals, non-goals, and success criteria |
| [`architecture.md`](architecture.md) | canonical technical contract | system boundaries, contracts, dependency direction, and provider model |
| [`security-model.md`](security-model.md) | canonical security contract | trust boundaries, invariants, limits, and prohibited behavior |
| [`roadmap.md`](roadmap.md) | canonical milestone plan | staged outcomes and exit gates |
| [`implementation-plan.md`](implementation-plan.md) | active execution plan | ordered tasks, dependencies, acceptance criteria, and checkpoints |
| [`handoff.md`](handoff.md) | current status record | repository state, completed evidence, blockers, and immediate next actions |
| [`../README.md`](../README.md) | derived project overview | concise entry point and links to canonical detail |

## Supporting Material

- [`decisions/`](decisions/) contains accepted architecture decision records. Do not silently edit an
  accepted decision to match implementation; supersede it with a new decision.
- [`contracts/`](contracts/) contains versioned contract vocabulary and representative machine-
  readable examples. Canonical executable schemas, derived types, and validators live in
  [`../packages/contracts/`](../packages/contracts/).
- [`research/`](research/) contains historical inputs. Revalidate dependencies, versions, licenses,
  and security posture before adoption, and correct research with a dated addendum.

## Source-of-Truth Rules

- Current executable behavior is established by code, configuration, tests, and commands actually
  run. A status document cannot turn planned behavior into implemented behavior.
- Intended public and security behavior is owned by accepted ADRs and the canonical contracts above.
  If code conflicts with an accepted decision, report and resolve the conflict explicitly.
- Milestone intent belongs in the roadmap; task-level execution detail belongs in the active plan.
- The handoff records a continuation point only. It must link to canonical decisions rather than
  becoming a second product specification.
- When behavior, setup, commands, contracts, or trust assumptions change, update the owning document
  in the same change.
