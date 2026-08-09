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
- `rpd`: software executor; use an existing absolute root with `scope:"absolute"`, or a safe project-relative root with `scope:"project"`; implementation, command, and review evidence default.
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

Studio may reschedule non-completed work unless the project or assigned milestone is complete.
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

Return three short sections: `Blocking defects`, `Recommendations`, and `Strong properties`. Use
`None` when a section has no items. Do not rewrite or save the task unless explicitly authorized.
