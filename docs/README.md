# Documentation Index

## Start Here

1. [`../README.md`](../README.md) for the project overview and current phase.
2. [`product-brief.md`](product-brief.md) for the product problem and first-release outcome.
3. [`architecture.md`](architecture.md) and [`security-model.md`](security-model.md) for technical
   boundaries.
4. [`roadmap.md`](roadmap.md) for vertical product milestones.
5. [`implementation-plan.md`](implementation-plan.md) for remaining installed-package work.
6. [`repository-intelligence-implementation-plan.md`](repository-intelligence-implementation-plan.md)
   for workspace index, retrieval, and context-planning slices.
7. [`research/repository-intelligence-provider-stack.md`](research/repository-intelligence-provider-stack.md)
   for planned technologies, restrictions, spikes, and evaluation gates.
8. [`research/repository-intelligence-technology-deep-dive.md`](research/repository-intelligence-technology-deep-dive.md)
   for candidate comparisons, adoption risks, and experiment order.
9. [`alpha-release-plan.md`](alpha-release-plan.md) for installed-package Alpha 1 work groups.
10. [`execution-index.md`](execution-index.md) for active work items and integration sequence.
11. [`handoff.md`](handoff.md) when continuing current repository state in a new session.

## Document Ownership

| Document | Classification | Owns |
| --- | --- | --- |
| [`product-brief.md`](product-brief.md) | canonical product contract | problem, users, goals, non-goals, and success criteria |
| [`architecture.md`](architecture.md) | canonical technical contract | system boundaries, contracts, dependency direction, and provider model |
| [`security-model.md`](security-model.md) | canonical security contract | trust boundaries, invariants, limits, and prohibited behavior |
| [`roadmap.md`](roadmap.md) | canonical milestone plan | staged outcomes and exit gates |
| [`implementation-plan.md`](implementation-plan.md) | active execution plan | ordered tasks, dependencies, acceptance criteria, and checkpoints |
| [`repository-intelligence-implementation-plan.md`](repository-intelligence-implementation-plan.md) | active expansion plan | workspace snapshot, index, retrieval, semantic linking, ContextPack, and provider slices |
| [`alpha-release-plan.md`](alpha-release-plan.md) | draft release plan | agent-first alpha boundary, release decisions, work groups, and gates |
| [`execution-index.md`](execution-index.md) | current execution index | active work items, dependencies, status, and integration destinations |
| [`specs/typescript-public-api-modeling.md`](specs/typescript-public-api-modeling.md) | proposed M1.7 contract | public symbol semantics, compiler authority, limits, fixtures, and approval gates |
| [`handoff.md`](handoff.md) | current status record | repository state, completed evidence, blockers, and immediate next actions |
| [`../README.md`](../README.md) | derived project overview | concise entry point and links to canonical detail |
| [`research/repository-intelligence-provider-stack.md`](research/repository-intelligence-provider-stack.md) | current provider plan | selected/deferred technologies, integration restrictions, spikes, metrics, and primary sources |
| [`research/repository-intelligence-technology-deep-dive.md`](research/repository-intelligence-technology-deep-dive.md) | current candidate research | package comparisons, compatibility and safety risks, rejection rules, scorecards, and primary sources |

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
