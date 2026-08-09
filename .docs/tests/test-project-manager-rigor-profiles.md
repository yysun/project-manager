# Project Manager Rigor Profiles E2E Specification

## Scenario 1 - Complete ordinary human work without exposing execution ceremony

Given minimal and standard projects with planned or ready human tasks, satisfied dependencies, no blockers,
active disposition, approval-satisfiable evidence requirements, verifiable bound sources, and specific
acceptance criteria

When `project update` records one explicit human approval through the lightweight completion operation

Then each task becomes done in one user-visible action

And each project contains one valid immutable Task Contract and one verified Evidence Manifest using the
existing attempt layout

And the approval record is mapped to every exact acceptance criterion

And status, report, validation, and Studio all accept the resulting project

## Scenario 2 - Preserve controlled and autonomous execution rigor

Given controlled human work and minimal/standard RPD, agent, or external work

When lightweight human completion is attempted

Then the operation rejects the request without changing any project byte

And the existing start, staged manifest, source binding, replay rejection, and RPD snapshot paths remain
the only valid governed execution flow

## Scenario 3 - Reject untrustworthy lightweight completion

Given lightweight-profile human tasks that are blocked, dependency-incomplete, deferred, cancelled,
already attempted, already done, use incompatible custom evidence requirements or unverifiable sources,
or are attached to a non-active project

When lightweight completion is attempted for each task

Then every request fails with a specific eligibility error

And each selected project remains byte-identical

## Scenario 4 - Track deferred and cancelled work truthfully

Given a TASKS schema v3 project containing active, deferred, cancelled, and done tasks

When validation, status, next-work, blockers, coverage, and report commands run

Then deferred and cancelled tasks are not actionable

And cancelled dependencies remain unfinished until the plan removes or replaces them

And disposition counts are distinct from detailed lifecycle counts

And deferred/cancelled tasks' own blockers are omitted while active dependents still report cancelled
dependencies as unfinished

And only non-cancelled mappings participate in coverage, with at least one evidence-backed done task required
for verified success and traceability

## Scenario 5 - Complete projects without pretending cancelled work succeeded

Given a project and milestone whose remaining intentionally abandoned tasks are cancelled

When the milestone and project are marked complete

Then validation accepts cancelled tasks as closed work

And every required success criterion is still backed by a separate evidence-backed done task

And validation rejects any project that relies on a cancelled task for success or a dependency

## Scenario 6 - Use the ordinary Studio projection without losing audit detail

Given tasks across every internal lifecycle stage and each disposition

When Studio loads the project

Then the board shows Planned, Ready, Active, Done, Deferred, and Cancelled lanes

And implemented, verification, and verified tasks appear in Active

And the task dialog shows projected state first plus the detailed lifecycle, contract, and manifest values

And a disposition-only edit remains available when specification or schedule fields are read-only

And completed-milestone tasks and cancelled tasks reject disposition changes

And evidence observed after a task was deferred or cancelled cannot advance its lifecycle

## Scenario 7 - Preserve exact schema and rollback boundaries

Given valid TASKS v1, scheduled v2, and scheduled/dispositioned v3 files plus invalid files that place
disposition in v1/v2, split disposition from its timestamp, or use an unknown disposition

When validation and atomic edits run

Then v1/v2 remain valid without migration or stale STATUS, v3 preserves v2 schedules and accepts only exact
disposition/timestamp pairs, and old schemas reject v3-only fields

And an injected post-replacement failure restores the exact prior project bytes and removes the new attempt

## Execution Evidence

Executed on 2026-08-09 against the repository implementation:

- Scenarios 1-3: `profile policy keeps governed execution universal while simplifying ordinary human completion` and `lightweight human completion rejects unprovable work and rolls back exact bytes` exercise minimal/standard success, controlled/custom/source rejection, immutable attempt creation, STATUS validation, and exact tree-hash rollback.
- Scenarios 4-5: `TASKS v3 dispositions preserve schedules and separate actionability, blockers, and mappings` and `disposition freezes later evidence and cancellation closes scope without proving it` exercise actionability, blocker/dependency behavior, counts, success filtering, timestamp freeze, and project/milestone completion.
- Scenario 6: `Kanban projection groups exact lifecycle state and exposes truthful edit eligibility`, the disposition editor test, Studio server tests, and the successful production build exercise projected lanes, raw audit fields, independent edit authority, and generated bundles.
- Scenario 7: schema exactness, disposition editor migration, immutable mutation, and CRLF/rollback tests exercise v1/v2 compatibility, v3 upgrade, paired fields, schedule preservation, identity preservation, and byte-exact recovery.
- Regression evidence: the existing contract, manifest, replay, source-binding, RPD story/snapshot, selection, server-security, and Timeline suites all ran in the same `npm run test:pm` invocation.

Command results: `npm run typecheck` (exit 0), `npm run build` (exit 0), `npm run test:pm` (80/80 pass, exit 0), skill `quick_validate.py` (exit 0), and `git diff --check` (exit 0).
