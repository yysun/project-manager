# Requirement: Timeline manual task order

## Problem

Studio's Timeline left column always shows tasks in a derived order: scheduled start, then
scheduled end, then milestone, then ID, with undated work pushed to the bottom. That order is
the only one available, so an operator cannot group rows the way they actually read the plan —
by delivery stream, by owner, by "these three first" — and cannot keep two related tasks
adjacent when their dates are far apart. Every session re-derives the same order, so there is
nowhere to record the operator's own judgement about how the plan should read.

Studio is the project's operating surface, and its other planning edits (schedule, disposition)
are persisted project facts rather than browser state. A row order that lived only in the
browser would be the one piece of Timeline arrangement that vanished on the next machine and
stayed invisible to every other tool that reads project state.

## Requirement

Every task has an order number, and a Studio operator can drag a Timeline left-column row to
override it. Timeline rows always render in order-number sequence.

- Every task has an order number. There is no ordering mode, toggle, or "has been reordered"
  flag: order number is simply a task property, and row order is always that property.
- A task with no order number stored in the project gets a default generated from the existing
  derived arrangement — scheduled start, then scheduled end, then milestone, then ID, undated
  last — so a project that has never been reordered renders exactly as it does today.
- Defaults are generated when the project is read for display. Opening a project never writes
  order numbers back to it; numbers are persisted only when the operator reorders.
- Dragging a row label to a new position overrides the order numbers, and the result is
  persisted in the selected project's `TASKS.md` as task planning metadata, so it survives
  refresh, Studio restart, and reading the project from another tool.
- A visible control discards persisted order numbers so defaults are generated again.
- Reordering is reachable without a pointer.
- Reordering is a planning-metadata change only. It must not alter any task's specification
  identity, lifecycle status, schedule, disposition, evidence, or Task Contract.

## Acceptance Criteria

- [x] A Timeline left-column row can be moved to a new position with a pointer drag, and the
      moved row is shown in its new position before the change is persisted.
- [x] Persisting a manual order writes task order metadata into the selected project's
      `TASKS.md` and no other project file except the derived `STATUS.md` cache.
- [x] Reloading the project — refresh, Studio restart, or a fresh read of project state by any
      reader of the shared project library — reports the persisted order.
- [x] Every task carries an order number for display: stored when the project stores one, and
      otherwise generated from the derived arrangement, with no mode flag anywhere in the data,
      API, or UI.
- [x] A project whose tasks store no order numbers renders Timeline rows in the pre-existing
      derived order (scheduled start, scheduled end, milestone, ID, undated last).
- [x] A project whose tasks store order numbers renders Timeline rows in that order, and a task
      added later with no stored number is placed deterministically by its generated default.
- [x] Opening, refreshing, or filtering a project never writes order numbers to `TASKS.md`.
- [x] A reset control discards the stored order numbers for the project, after which rows
      render in generated-default order again.
- [x] Reordering leaves every task's specification revision, status, disposition, schedule, and
      Task Contract identity unchanged, verified by comparing task revisions across a reorder.
- [x] A row whose task is not eligible for specification or schedule editing can still be
      reordered; reordering is refused only where the project itself forbids planning changes,
      with a stated reason.
- [x] A reorder submitted against a stale project revision is refused with a conflict rather
      than overwriting a concurrent change, and the operator is told to refresh.
- [x] A reorder is applied atomically: an interrupted or invalid reorder leaves `TASKS.md` in
      its prior state with no partial ordering.
- [x] A drop performed while Timeline filters hide some tasks preserves the hidden tasks'
      relative order and places the moved row adjacent to the visible neighbour it was dropped
      against.
- [x] Reordering is operable by keyboard alone, with the moved row's new position announced to
      assistive technology.
- [x] A drag that reorders a row does not also open that task's dialog.
- [x] The task metadata schema documentation states the order field, its schema version, its
      absence rules, and its exclusion from the specification hash.
- [x] The project's own test suite covers order persistence, generated defaults, reset,
      conflict refusal, and the pure ordering helper, and passes.

## Constraints

- Persisted order lives in `TASKS.md` task metadata and is gated behind a new task collection
  schema version, following the established pattern where schedule fields required v2 and
  disposition fields required v3. Earlier schema versions must keep rejecting the field and must
  keep their exact current normalized shape, so installing this capability cannot make an
  untouched project's `STATUS.md` cache stale.
- The order field is planning metadata: excluded from the task specification hash and from the
  Task Contract payload, exactly as schedule and disposition fields are.
- Writes go through the existing atomic project mutation and revision-guard path. Studio must
  not gain a second, weaker write route.
- The Studio HTTP surface stays closed: no shell, executor, evidence, or arbitrary-path API.
- A project edited by hand or by an agent may contain tasks with no order value, or values that
  are not a clean sequence; the reader must stay deterministic and must not fail validation for
  those cases.
- Order changes must respect the existing auto-refresh edit barrier so a live project change
  cannot overwrite an in-progress reorder.
- The MCP App remains read-only.

## Non-Goals

- Reordering tasks in the Kanban view, or changing Kanban's within-lane order.
- Making the manual order affect `project next`, priority, dependency, or any scheduling or
  recommendation logic. It is display order only.
- Cross-project or global ordering; order is per project.
- Dragging rows between milestones, owners, or lanes as a way of editing those fields.
- Reordering as a fallback for projects that fail validation.
- An ordering mode, manual/date toggle, or "has been reordered" flag in the data, API, or UI.
- Backfilling order numbers into projects that have never been reordered.
- A compatibility flag, environment variable, or dual-write mode for the new schema version.
