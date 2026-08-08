# Project Manager Studio Timeline

## Problem

Project Manager Studio exposes lifecycle flow through Kanban, but it cannot show when work is
scheduled, how tasks align to milestones, or where dependency timing is inconsistent. Project
managers must leave Studio and interpret Markdown records manually to understand sequencing.

The existing task contract has no task schedule fields. Treating task creation, update, lifecycle,
or dependency order as dates would create false precision, while allowing arbitrary status edits
would bypass the evidence-backed lifecycle.

## Requirement

Extend the existing Project Manager Studio with a sibling Timeline view over the same validated
project snapshot. Tasks may carry optional scheduled start and end dates that users can edit from
Studio without changing immutable execution contracts. Timeline must make scheduled, unscheduled,
milestone, dependency, ownership, priority, blocker, and lifecycle context visible and must reuse
the board's filters, task details, conflict handling, candidate validation, and atomic save boundary.

Schedule editing and lifecycle editing must remain separate authorities. Users may reschedule
non-completed tasks, including tasks already in evidence-backed execution, but may edit status only
for genuinely never-started tasks and only between the existing legal planning states. Actual
execution dates remain evidence-derived and are never typed into Studio.

## Acceptance Criteria

- [x] Project Manager Studio provides URL-addressable `Kanban` and `Timeline` sibling views without
      launching a second server, application, state store, or project API.
- [x] `TASKS.md` schema v2 adds optional date-only `scheduled_start` and `scheduled_end` values;
      both keys are absent for an unscheduled task or both contain dates, and start cannot be later
      than end. Existing schema-v1 task collections remain valid and unchanged until first scheduled.
- [x] Schedule metadata is excluded from Task Contract payloads and task specification hashes, so
      rescheduling an active task does not invalidate its contract or evidence history.
- [x] The validated Studio projection exposes a flat task collection, complete milestone schedule
      facts, project schedule bounds, and the existing Kanban lanes from one coherent revision.
- [x] Timeline renders scheduled tasks as date-scaled bars, unscheduled tasks explicitly, project
      and milestone dates without inventing missing forecasts, and task status, priority, owner,
      milestone, blockers, and dependencies.
- [x] When a scheduled dependency finishes on or after its scheduled dependent starts, Timeline
      shows a specific non-blocking date-conflict warning for that dependency pair; it does not
      silently repair, reject, or reinterpret the user-entered schedule, and it does not affect
      lifecycle blockers, blocked counts, next-work ranking, or blocked-only filtering.
- [x] Search, priority, owner, and blocked-only filters produce the same task set in Kanban and
      Timeline, and opening a task from either view uses the same accessible task dialog.
- [x] Users can edit or clear both schedule dates in the task dialog; scheduled bars support moving
      and resizing with an explicit save action and no mutation before save.
- [x] Schedule edits are permitted for non-completed tasks even when execution history makes their
      specification fields read-only, but are rejected for completed tasks, completed projects, or
      tasks assigned to completed milestones.
- [x] Status editing remains limited to `planned` and `ready` on genuinely never-started tasks and
      continues through full-project validation; Timeline exposes no control that can force an
      evidence-backed lifecycle transition.
- [x] Check and save validate schedule invariants, revision preconditions, dependencies, lifecycle,
      and the full candidate project; invalid or stale operations leave the live project unchanged.
- [x] Timeline is keyboard-usable, has visible focus and non-color schedule/status cues, provides
      usable horizontal date scrolling, and remains operable on narrow screens.
- [x] Project-manager contract documentation, automated tests, packaged Studio assets, typecheck,
      build, skill validation, and browser E2E verification reflect and pass the new behavior.

## Constraints

- Keep `PROJECT.md` and `TASKS.md` authoritative and `STATUS.md` derived.
- Preserve the existing explicit-folder, loopback-only, token-authenticated Studio boundary.
- Preserve exact lifecycle, contract, manifest, task-history, and whole-project validation rules.
- Schedule fields are planning metadata, not actual dates, progress percentages, effort estimates,
  forecasts, or evidence.
- A schedule-only edit must not alter the task specification hash, Task Contract, Evidence Manifest,
  reverse dependency links, narrative, or unrelated task bytes.
- Missing task or milestone dates must remain visibly unknown or unscheduled.
- Preserve existing projects whose tasks omit schedule fields.
- A first schedule save upgrades only `TASKS.md` collection metadata from schema v1 to v2; later
  schedule clearing deletes both keys but does not silently downgrade the collection.

## Non-Goals

- Critical-path calculation, resource leveling, automatic scheduling, effort estimation, baselines,
  working calendars, progress percentages, or portfolio timelines.
- Editing milestone records, project dates, actual execution dates, contracts, manifests, evidence,
  completed tasks, or completed project state through Timeline.
- Dragging a task to change lifecycle status or inferring status from its schedule.
- A second Studio application, server process, authentication flow, or persistence layer.
