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
