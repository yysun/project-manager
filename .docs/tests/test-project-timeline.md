# Project Manager Studio Timeline E2E Specification

## Scenario 1 - Navigate one Studio through addressable views

Given packaged Project Manager Studio is launched for one explicit validated project

When the user opens Kanban, switches to Timeline, reloads the page, and follows a direct Timeline URL

Then both views use the same project identity and authenticated snapshot, Timeline remains selected
after reload, Kanban remains available, and no second application or server is launched

## Scenario 2 - Render truthful schedule context

Given the project contains scheduled, unscheduled, dependent, blocked, active, and completed tasks
plus target and forecast milestone dates

When the user opens Timeline

Then scheduled tasks appear as inclusive date-scaled bars, unscheduled tasks are labeled explicitly,
project start and target markers are distinct from milestone target and evidence-backed forecast
markers, a target-only milestone says its forecast is unknown, and every row exposes task status,
priority, owner, milestone, blocker, and dependency context without inferred dates

## Scenario 3 - Warn about dependency date conflicts

Given one scheduled dependency ends on the date its scheduled dependent starts, another ends before
its dependent starts, and an unscheduled dependency pair is present

When the user opens Timeline

Then the overlapping dependent shows a warning naming its prerequisite and conflicting dates, the
ordered pair has no warning, the unscheduled pair is not diagnosed, no schedule is rewritten, and
blocked badges, blocked totals, blocked-only filtering, and next-work ranking remain based only on
lifecycle dependency and explicit blocker facts

## Scenario 4 - Share filters and task details

Given the same project is visible in Kanban and Timeline

When the user applies search, priority, owner, and blocked-only filters and opens a matching task in
each view

Then both views expose the same matching task set and both task entries open the same accessible
dialog with the same validated task facts

## Scenario 5 - Edit and clear an unstarted task schedule and status

Given an unscheduled, genuinely never-started planned task is open from Timeline

When the user enters a valid scheduled start and end, selects ready, checks changes, saves, reopens
the task, then clears both dates and saves again

Then the first schedule save upgrades `TASKS.md` from schema v1 to v2, each save passes full candidate
validation, clearing deletes both schedule keys without auto-downgrading v2, Timeline reflects the
saved or unscheduled state, status changes only through the legal planning transition, `STATUS.md`
is current, and task narrative and unrelated task records remain intact

## Scenario 6 - Move and resize a scheduled bar explicitly

Given a never-started task has a valid multi-day schedule and its project mutation revision is recorded

When the user drags the bar to a later date, resizes its start and end handles, observes the draft,
cancels once, repeats the interaction, and activates Save schedule

Then drag and resize change only draft dates before save, cancel restores persisted dates, save writes
the displayed valid pair through the revisioned API, and vertical or bar movement never changes status

## Scenario 7 - Reschedule active work without rewriting evidence

Given an in-progress task has a valid active Task Contract and a task specification hash

When the user opens it from Timeline, changes only its scheduled start and end, checks, and saves

Then execution-defining fields and status remain read-only, the new schedule is visible, the Task
Contract and task specification hash remain unchanged and valid, and immutable attempt bytes are
identical; Studio copy describes the separate schedule and specification/status edit authorities

## Scenario 8 - Reject invalid and ineligible schedule changes

Given the main fixture contains active, completed, completed-milestone, and stale-client examples,
and a separate fixture is a valid completed project whose tasks and milestones are all complete

When the user or API attempts a partial date pair, an end before start, a completed-task edit, a
completed-milestone edit, a completed-project edit, an active-task status edit, and a stale save

Then each operation reports an actionable validation or conflict error, no unsupported control is
offered in Timeline, and the live project mutation revision remains unchanged for every failure

## Scenario 9 - Keep Timeline usable by keyboard and on phone

Given Timeline is open at desktop width and at 390 by 844 CSS pixels

When the user navigates the view switch, shared filters, horizontally scrollable schedule, task rows,
dialog schedule/status fields, check, save, cancel, and close controls by keyboard

Then focus remains visible, controls have meaningful roles and names, sticky task context does not
obscure the date track, the dialog remains operable, and browser console inspection reports no error
