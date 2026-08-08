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
