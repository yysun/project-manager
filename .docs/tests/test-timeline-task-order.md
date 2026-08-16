# Timeline Task Order E2E Specification

## Scenario 1 - Render generated default order for a project that was never reordered

Given packaged Project Manager Studio is launched with Timeline selected for a project whose
`TASKS.md` stores no order numbers

When the user views the Timeline left column

Then rows appear in the derived arrangement — scheduled start, then scheduled end, then milestone,
then ID, with undated work last — every row exposes a reorder control, no ordering mode or toggle is
present anywhere in the view, and `TASKS.md` is byte-identical to its pre-launch content

## Scenario 2 - Drag a row to a new position and persist it

Given Timeline shows at least three rows in generated default order

When the user drags a row's reorder grip above a row that currently precedes it, and saves the
staged order

Then the dragged row is shown in its new position before saving, the save writes order numbers into
`TASKS.md`, the collection frontmatter reports task schema version 4, `STATUS.md` is regenerated, and
no other project file changes

## Scenario 3 - Survive reload and an independent read

Given a project whose order was reordered and saved in Scenario 2

When the user refreshes Studio, and the same project is separately loaded through the shared project
library outside the browser

Then both reads report the same order, the Timeline renders rows in that order, and every task's
task revision is identical to its value before the reorder

## Scenario 4 - Leave specification, lifecycle, and contract identity untouched

Given a project containing an evidence-backed task, a done task, and a cancelled task

When the user reorders rows so those three tasks change position, and saves

Then every task's specification hash, status, disposition, schedule dates, and Task Contract binding
are unchanged, each task's `updated` date is unchanged, and rows for tasks that cannot be edited or
rescheduled were still reorderable

## Scenario 5 - Reorder from a filtered view without scrambling hidden rows

Given Timeline filters hide some of the project's tasks

When the user drags a visible row to sit immediately before another visible row and saves, then
clears the filters

Then the moved row sits immediately before its drop target, every hidden task keeps its previous
relative position, and the saved sequence covers every task in the project

## Scenario 6 - Reorder by keyboard alone

Given Timeline is open and no pointer is used

When the user tabs to a row's reorder control and presses the arrow keys to move the row up and down

Then the row moves one position per key press, the new position is announced to assistive technology,
the staged order can be saved from the keyboard, and no task dialog opens during the interaction

## Scenario 7 - Distinguish a drag from opening a task

Given Timeline rows open a task dialog when their label is activated

When the user drags a row's grip and releases it, and separately clicks a row label without dragging

Then the drag reorders the row and opens no dialog, and the plain click opens the task dialog without
changing the order

## Scenario 8 - Reset to generated defaults

Given a project whose `TASKS.md` stores order numbers

When the user activates the reset control and saves

Then the stored order numbers are removed from `TASKS.md`, Timeline renders rows in generated default
order again, and the reset control is no longer offered

## Scenario 9 - Refuse a stale or invalid reorder

Given a Studio tab holding a project snapshot that is no longer current because the project changed
on disk

When that tab saves a reorder, and separately a reorder is submitted whose task list is not an exact
permutation of the project's tasks

Then the stale save is refused as a conflict and the operator is told to refresh, the invalid
sequence is refused as a bad request, and in both cases `TASKS.md` retains its prior bytes

## Scenario 10 - Refuse reordering where the project forbids planning changes

Given a project whose status is complete

When the user opens Timeline for that project

Then the reorder controls are unavailable, the stated reason is shown, and a reorder submitted
directly to the order endpoint is refused without writing to `TASKS.md`

## Scenario 11 - Place a task added after a reorder

Given a project whose tasks store order numbers, to which a new task with no order number is added
outside Studio

When Studio reloads the project

Then the project still loads without validation errors, the new task appears at a deterministic
position derived from its dates, and the stored order of the existing tasks is unchanged
