# Project Manager Rigor Profiles

## Problem

Project Manager has a strong evidence boundary for autonomous execution, but it applies the same
seven-stage ceremony to every task. A human completing ordinary work must be coordinated through a
pre-issued Task Contract and later Evidence Manifest, even in a minimal project. The
`minimal|standard|controlled` profile field is validated and displayed but does not change behavior.
The result is lightweight storage with a heavyweight operating model.

The lifecycle also lacks truthful ways to defer or cancel work. Leaving deferred or cancelled tasks
as `planned` makes next-work selection, project completion, and management reports misleading.

## Requirement

Make project profiles govern rigor without creating separate lifecycle engines. Preserve the current
Task Contract and Evidence Manifest system for RPD, agent, external, and controlled human execution.
For human tasks in minimal and standard projects, provide one atomic lightweight-completion operation
that snapshots the current task into the existing contract/manifest model, records specific approval
evidence against every acceptance criterion, and marks the task done without exposing intermediate
execution stages to the user.

Add an orthogonal task disposition of `active`, `deferred`, or `cancelled`, with an exact change
timestamp for non-active dispositions. Disposition must not alter task identity or invalidate an active
execution contract, but evidence observed after deferral/cancellation must not advance that task.
Deferred and cancelled work must not be selected as next work. Cancellation must be terminal for task,
project, and milestone purposes but must not satisfy another task's dependency or count as
evidence-backed success.

Project Manager Studio and user-facing guidance must present an ordinary operating projection:
`Planned → Ready → Active → Done`, with Deferred and Cancelled shown as explicit side states. Detailed
internal lifecycle and audit identifiers remain available for inspection. Adding one task remains a
natural-language `project update` action rather than a new route.

## Acceptance Criteria

- [x] `minimal` and `standard` human tasks with no execution attempt and approval-satisfiable evidence requirements can be completed atomically from planned or ready state using one specific approval record mapped to every acceptance criterion.
- [x] `controlled` projects, non-human executors, custom evidence requirements that one approval cannot satisfy, unverifiable current sources, active attempts, blocked tasks, incomplete dependencies, and non-active dispositions reject the lightweight completion path without mutation.
- [x] Lightweight completion produces a valid immutable Task Contract and verified Evidence Manifest under the existing attempt layout, preserves the full audit trail, and leaves all autonomous/RPD evidence validation unchanged.
- [x] TASKS schema v3 is a strict scheduling-capable superset of v2 and adds paired non-active `disposition`/`disposition_changed_at` metadata, while v1 and v2 remain byte-compatible in normalized state and continue rejecting v3-only fields.
- [x] Deferred and cancelled tasks are excluded from next-work ranking and lifecycle advancement; cancelled dependencies remain unfinished; done tasks cannot be deferred or cancelled; cancelled tasks cannot be reactivated; and completed-milestone tasks are disposition-read-only.
- [x] Complete milestones and projects accept cancelled tasks as intentionally closed, while project success and traceability ignore cancelled mappings and require at least one remaining evidence-backed done task.
- [x] Status and report facts expose disposition counts and the active profile policy without hiding the detailed lifecycle distribution.
- [x] Studio projects tasks into Planned, Ready, Active, Done, Deferred, and Cancelled lanes, displays the projected state by default, retains the detailed lifecycle in task inspection, and permits safe disposition edits independently from specification and schedule authority.
- [x] `SKILL.md`, English and Chinese user guidance, and task/convention/track references explain the profile policies, lightweight human completion, disposition semantics, and the existing `project update` task-add path without adding a route.
- [x] The skill validator, typecheck/build, Project Manager unit tests, Studio tests, and the matching E2E specification pass.

## Constraints

- Keep one canonical governed lifecycle and one Task Contract/Evidence Manifest format.
- Do not weaken source binding, task hashing, replay rejection, immutable attempts, RPD snapshots, or controlled human execution.
- Keep v1 and v2 task files readable without migration; persist disposition only in v3.
- Keep read-only status, next, blocker, coverage, validation, and report commands read-only.
- Use the existing same-filesystem atomic mutation and rollback boundary for lightweight completion and Studio edits.
- Add no runtime dependency, feature flag, environment variable, tracker integration, or alternate database state.

## Non-Goals

- Replace the evidence engine with direct manually entered `done` status.
- Add separate lifecycle schemas for each profile.
- Add `project add` or another user-facing route.
- Build a general-purpose mutation CLI or evidence editor.
- Automatically cancel dependents, remove dependency links, or infer completion evidence.
- Redesign Timeline scheduling or expose RPD internals in the ordinary Studio projection.
