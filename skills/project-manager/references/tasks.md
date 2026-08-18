# Tasks and Executors

A task record is a level-two heading followed immediately by one fenced JSON object:

````markdown
## TASK-VENDORS - Confirm service vendors

```json
{"outcome":"All move-day vendors are confirmed.","acceptance":["Every vendor has acknowledged the schedule."]}
```
````

Only `outcome` and `acceptance` are required. The engine supplies generic defaults. Keep acceptance strings unique because they are exact Evidence Manifest keys.

Providers:

- `human`: approval evidence by default; root must be null.
- `rpd`: end-to-end software-story executor; use an existing absolute root with `scope:"absolute"`, or a safe project-relative root with `scope:"project"`; implementation, command, and review evidence default. One task must be a cohesive behavior or contract change suitable for one complete RPD flow, not an RPD stage, file, layer, or implementation-plan step.
- `agent`: artifact and review evidence; root may be null, absolute-scoped, or project-scoped.
- `external`: artifact-or-approval evidence; root may be null, absolute-scoped, or project-scoped.

`blocked_by` stores explicit non-empty blocker descriptions. `depends_on` stores task IDs. Never mix them.

External tracker identifiers belong in `external_refs`. They are display-only and cannot participate in dependencies, lifecycle, or identity.

## Profiles and disposition

- `minimal` and `standard` allow one-step reported completion for eligible never-started human work.
- `controlled` requires governed execution for humans. Non-human executors are always governed.

Task disposition is independent from lifecycle. Absence means `active`. TASKS schema v3 stores only
non-active dispositions as the exact pair `disposition:"deferred|cancelled"` and
`disposition_changed_at:"RFC3339 UTC"`. Deferred work is not actionable but may reactivate. Cancellation
is terminal. Neither state satisfies a dependency or proves success; cancelled mappings are ignored by
coverage. Evidence observed after the disposition timestamp cannot advance the task.

## Scheduling

Task schedules are optional planning metadata in `TASKS.md` schema v2 or v3:

```json
{"outcome":"All move-day vendors are confirmed.","acceptance":["Every vendor has acknowledged the schedule."],"scheduled_start":"2026-09-01","scheduled_end":"2026-09-03"}
```

Both schedule keys must be absent or both must contain valid date-only values, with start no later
than end. Ranges are inclusive. Clearing a schedule deletes both keys. Schedule is not actual
execution time, effort, progress, evidence, or forecast, and is excluded from the task specification
hash and immutable Task Contract.

The first persisted schedule upgrades `TASKS.md` from schema v1 to v2. The first disposition change
upgrades v1/v2 to v3 and preserves schedules. V1 remains exact and rejects schedule/disposition keys;
v2 rejects disposition keys. Versions are not silently downgraded after fields are cleared. To use an older v1 reader,
reactivate every deferred task (cancelled tasks cannot be downgraded), clear every schedule with the current reader,
verify no schedule or disposition keys remain, change only the `TASKS.md` frontmatter version to 1, validate the
project, and regenerate `STATUS.md`.

## Row order

Every task has a Timeline row order number. Schema v4 stores it as optional `order`, a positive
integer:

```json
{"outcome":"All move-day vendors are confirmed.","acceptance":["Every vendor has acknowledged the schedule."],"order":3}
```

A task with no stored `order` gets a default generated from the derived arrangement — scheduled
start, then scheduled end, then milestone, then ID, undated last — so a project that has never been
reordered reads exactly as it always did, and a task added later lands at its date position rather
than at the end. Defaults are generated for display only: reading a project never writes order back
to it. Where a stored number and a generated default would collide, the stored one keeps the slot.

Order is display metadata. It is excluded from the task specification hash and the immutable Task
Contract, it never affects ranking, dependencies, coverage, or actionability, and reordering leaves
every task's `updated` date alone. There is no ordering mode or toggle: order is simply a task
property.

Studio writes the complete sequence for every task at once, so one reorder renumbers the project
`1..N`. Clearing the order removes the field from every task and restores generated defaults without
lowering the schema version. V1/v2/v3 reject `order`.

Studio may reschedule non-completed work unless the project or assigned milestone is complete.
Row order has its own authority: any task may be reordered, including done, cancelled, and
evidence-backed work, and only a complete project refuses it.
Specification and status authority remains separate: only genuinely never-started tasks may edit
execution-defining fields or switch between `planned` and `ready`.

## LLM task-quality validation

For `project validate-task <folder> <task-id>`, validate the selected project first, then review the
named task semantically. This route is read-only unless the user separately asks to apply revisions.

Judge:

- whether the outcome names a concrete state change rather than an activity;
- whether every acceptance item is observable, distinct, and testable;
- whether scope is coherent and small enough to execute without hidden decomposition;
- whether dependencies and blockers are necessary, complete, and non-circular in intent;
- whether constraints protect real boundaries without prescribing accidental implementation detail;
- whether executor evidence requirements can prove the acceptance items.

For an `rpd` task, also judge:

- whether it defines one end-to-end software story whose acceptance criteria can become RPD REQ
  criteria and be decided by VR;
- whether RPD can plan, implement, test, review, verify, document, and commit it without depending on
  unfinished sibling implementation fragments;
- whether it wrongly turns RPD stages, files, layers, tests, reviews, docs, or commits into separate
  project tasks instead of leaving implementation decomposition to RPD's AP;
- whether unrelated behavior, different executor roots, approval gates, or materially different risk
  and rollback boundaries require the task to be split.

Return three short sections: `Blocking defects`, `Recommendations`, and `Strong properties`. Use
`None` when a section has no items. Do not rewrite or save the task unless explicitly authorized.

## Ready-work ranking

`project-next.js` ranks dependency-ready work by declared criticality, then **downstream depth**,
then immediate unlocks, priority, current milestone, and identifier.

`depth` is the longest remaining dependency chain a task unblocks: a sink has depth `0`, and a task
whose longest path to a leaf crosses three further tasks has depth `3`. It differs from `unlocks`,
which counts only immediate dependents. A task with one dependent that heads a long chain outranks a
task with several dependents that are all leaves, because the long chain is what determines how
early the remaining work can finish. Where two chains reconverge on one task, that task is counted
once. Tasks with a non-active disposition are skipped: cancelled work is not remaining work.

Depth is derived from `depends_on` and its validated reverse link `blocks`; it is never stored, so
it cannot go stale. Because ranking is dependency-based, a task that no other task depends on always
ranks last — see the sink-task rule in `execute-rpd.md` for why a value-concentrating final task
must still be dispatched early.

Ranking decides the order of work; it cannot create concurrency that the dependency graph forbids.
The plan-level `concurrency` projection reports what the graph permits — see the dependency-density
guidance in `plan.md`.

