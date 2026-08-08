# Project Manager Studio Timeline Plan

## Goal

Add a truthful Timeline as a sibling to the existing Kanban view, backed by explicit task schedule
metadata and controlled edits that do not weaken execution-contract or lifecycle invariants.

## Current Context

- `src/project-manager-studio/client/App.tsx` owns the current single-view shell, coherent project
  load, filters, task selection, summary, and five-lane Kanban rendering.
- `src/project-manager-studio/client/components/TaskDialog.tsx` edits all allowed fields only when
  `taskEditEligibility` says a task is genuinely never-started; other tasks are fully read-only.
- `src/project-manager-studio/shared/api.ts` and `kanbanData` in
  `skills/project-manager/scripts/lib/project-state.js` expose lanes, task details, abbreviated
  milestone options, and project target date, but no flat task or full milestone schedule data.
- `normalizeTask` enforces an exact v1 task-record allowlist. Tasks currently have audit dates only.
  Milestones already distinguish target dates from evidence-backed forecast dates.
- `taskSpecPayload` in `skills/project-manager/scripts/lib/contracts.js` explicitly selects
  execution-defining fields. Schedule metadata can therefore remain outside the task hash and
  immutable Task Contract without changing the contract schema.
- `skills/project-manager/scripts/lib/task-editor.js` uses one field allowlist and one eligibility
  gate. It must distinguish schedule-only edits from specification/planning edits while preserving
  coherent revisions, candidate validation, and atomic saves.
- Existing Node tests cover state validation, contract binding, edit protection, revision conflict,
  packaged server behavior, and browser fixture generation. The root package provides unambiguous
  `typecheck`, `build`, `test:pm`, and full `test` commands.

## Decisions

- Introduce `TASKS.md` collection schema v2 for optional `scheduled_start` and `scheduled_end`
  date-only task fields. Continue accepting v1 with its original exact field set. V2 requires both
  schedule keys absent or both containing dates with `scheduled_start <= scheduled_end`; explicit
  null record values and partial pairs are invalid. A request clears a schedule by sending both API
  values as null, and persistence deletes both keys. Do not infer schedule from audit timestamps,
  lifecycle state, dependencies, or task counts.
- Upgrade a v1 `TASKS.md` frontmatter to v2 only when a schedule is first persisted. Preserve v1 for
  all non-schedule edits, never auto-downgrade v2 after clearing, and reject v2 in older readers by
  its truthful version rather than changing the meaning of v1. Document manual downgrade as:
  clear every schedule with the current reader, verify no schedule keys remain, change only the
  `TASKS.md` frontmatter version to 1, then run project validation and regenerate `STATUS.md`.
- Keep Task Contract schema version 1 unchanged because schedule is deliberately not execution
  specification. Confirm `taskSpecPayload`, contract serialization, and evidence binding remain
  byte-compatible across schedule-only changes.
- Extend the existing Studio projection rather than add another endpoint. Retain Kanban lanes for
  existing consumers, add a flat `tasks` list, full milestone facts, and project `start_date`.
- Add a URL-backed `view=kanban|timeline` switch in the existing shell. Share one load, filter model,
  task dialog, refresh, warnings, summary, and save callback. Do not add a router dependency.
- Render a dependency-aware planning timeline with a sticky task-information column and horizontally
  scrollable date track. Build the visible range only from explicit task schedules plus project and
  milestone dates, with bounded padding; show a deliberate unscheduled state when no task dates
  exist. Use date-only UTC arithmetic so local daylight-saving changes cannot move bars.
- Treat task schedules as inclusive date ranges. A dependent with `scheduled_start <=` a scheduled
  prerequisite's `scheduled_end` has a date conflict. Derive and display a specific warning on the
  dependent row; do not reject the schedule because overlap can be an intentional planning state.
  Do not diagnose a pair when either task is unscheduled.
- Reuse the task dialog for canonical schedule and status editing. A never-started task gets its
  existing planning editor plus schedule fields. An active non-completed task gets schedule fields
  while execution-defining fields remain read-only. Completed tasks, tasks in completed milestones,
  and tasks in a completed project get a specific schedule read-only reason.
- Support pointer dragging of a scheduled bar to move the whole interval and dedicated start/end
  handles to resize it. Dragging changes draft dates only; the user must activate Save schedule,
  which uses the same revisioned task save endpoint. Keyboard users edit the same dates in the task
  dialog. Do not map vertical movement or dragging to status.
- Split edit authorization server-side. Any edit containing specification/planning fields requires
  existing `taskEditEligibility`. An edit containing only schedule fields requires new
  `scheduleEditEligibility`. Mixed edits require both. Keep status input restricted to
  `planned|ready`; the full validator continues to reject illegal ready state.
- Preserve all existing exact-schema fail-closed behavior. Update task schema documentation and
  tests directly; add no feature flag, compatibility mode, fallback parser, environment variable,
  second endpoint, or external Gantt dependency.
- Update packaged server/client output after source and tests pass because installed use consumes
  committed bundles, not root source.

## Phased Tasks

### Phase 1 - Schedule contract and projection

- [x] Update `skills/project-manager/scripts/lib/project-state.js` task normalization to accept,
      parse v1/v2 `TASKS.md`, preserve v1's exact fields, and validate v2's paired
      `scheduled_start`/`scheduled_end` date-only fields.
- [x] Add focused v1-to-v2 task-document migration in
      `skills/project-manager/scripts/lib/task-editor.js`: upgrade on first schedule persistence,
      delete both keys on API clearing, preserve v1 on non-schedule edits, and never auto-downgrade.
- [x] Add `scheduleEditEligibility` in `project-state.js` for non-completed tasks outside completed
      project and milestone state, with a specific rejection reason for each boundary.
- [x] Extend the Studio projection in `project-state.js` with project `start_date`, full milestone
      facts, a flat task list, per-task schedule eligibility, and schedule dates while preserving
      the existing lanes and deterministic revision facts.
- [x] Derive inclusive dependency-date conflicts in `project-state.js` only for pairs with complete
      schedules and expose the predecessor ID and conflicting dates on each dependent projection.
- [x] Confirm `skills/project-manager/scripts/lib/contracts.js` continues to omit schedule metadata
      from `taskSpecPayload` and add regression evidence that schedule-only changes preserve hashes
      and active contract binding.
- [x] Update `skills/project-manager/references/conventions.md`,
      `skills/project-manager/references/tasks.md`, and `skills/project-manager/SKILL.md` with exact
      schedule semantics, eligibility, validation, and Timeline behavior.

### Phase 2 - Revision-safe schedule editing

- [x] Extend `src/project-manager-studio/shared/api.ts` with schedule fields, full milestone and flat
      task projections, schedule eligibility, and schedule edits without exposing actual-date or
      evidence mutation fields.
- [x] Refactor `skills/project-manager/scripts/lib/task-editor.js` to classify schedule and planning
      fields, require the matching eligibility gates, and preserve exact-key rejection.
- [x] Make `task-editor.js` apply and validate paired schedule changes through the existing pure task
      transformation, dry-run check, revision preconditions, and atomic save transaction.
- [x] Extend `tests/project-manager-studio/task-editor.test.js` and
      `skills/project-manager/tests/project-manager.test.js` for valid, cleared, partial, reversed,
      active, completed, completed-milestone, hash-stable, stale, dependency-conflict, v1-preserving,
      v1-to-v2 migration, no-auto-downgrade, and byte-preserving schedule edits.
- [x] Add fail-closed schema tests in `skills/project-manager/tests/project-manager.test.js` proving
      v1 rejects schedule keys, v2 rejects persisted nulls and partial pairs, v2 is accepted only for
      `TASKS.md`, and every optional collection file remains v1-only.
- [x] Add projection regressions in `skills/project-manager/tests/project-manager.test.js` proving
      dependency-date conflicts do not mutate or contribute to `blocked_by`, `dependency_blockers`,
      blocked summary counts, deterministic next-work ranking, or blocked-only filter facts.
- [x] Extend `tests/project-manager-studio/studio-server.test.js` to prove authenticated API schedule
      checking/saving and active-task rescheduling without a lifecycle bypass.

### Phase 3 - Shared Studio views and editor

- [x] Refactor `src/project-manager-studio/client/App.tsx` so URL-backed Kanban and Timeline views
      share project loading, summaries, filters, selected-task dialog, and save reconciliation.
- [x] Add `src/project-manager-studio/client/components/Timeline.tsx` with explicit date-range
      calculation, date-scale headers, milestone markers, scheduled bars, unscheduled rows, and
      visible status, priority, owner, blockers, milestone, and dependency context.
- [x] Add pure UTC date/range/coordinate helpers under
      `src/project-manager-studio/client/timeline-model.mjs` plus TypeScript declarations, and use
      those helpers for inclusive bars, moving, resizing, range padding, and marker placement.
- [x] Add draft move/start-resize/end-resize interactions and explicit schedule save/cancel behavior
      to `Timeline.tsx`, using the existing revisioned API and preserving click/keyboard task access.
- [x] Update `TaskDialog.tsx` so planning-eligible tasks can edit status and schedule together,
      schedule-only eligible tasks can edit schedule while specification fields remain inspectable,
      and ineligible tasks show precise read-only reasons.
- [x] Update authority copy in `App.tsx`, `TaskDialog.tsx`, and the Studio footer so the UI states
      that specification/status edits are limited to never-started tasks while schedule edits are
      independently available for eligible non-completed work.
- [x] Update `src/project-manager-studio/client/styles.css` with view navigation, timeline grid,
      sticky labels, bars, handles, milestone markers, drag state, responsive overflow, focus cues,
      and reduced-motion behavior consistent with the current visual system.

### Phase 4 - Verification and packaged delivery

- [x] Update `tests/project-manager-studio/create-browser-fixture.js` with explicit schedules and
      milestones that exercise scheduled, unscheduled, dependent, conflicting, active, completed,
      target-only, forecasted, and unknown-forecast rows; add a separate valid completed-project
      fixture for completed-project edit rejection.
- [x] Add `tests/project-manager-studio/timeline-model.test.js` with exact UTC cases across daylight
      saving changes, month/year boundaries, leap day, inclusive one-day width, range padding, move,
      start resize, end resize, and clamped invalid resize attempts.
- [x] Run `npm run typecheck`, fix relevant failures, and record a zero-error result.
- [x] Run `npm run build`, regenerate `skills/project-manager/scripts/project-manager-studio.js` and
      `skills/project-manager/studio/dist/`, and confirm installed output remains no-install.
- [x] Run `npm run test:pm`, fix relevant failures, and record the complete passing test count.
- [x] Run the skill validator against `skills/project-manager` and record a successful result.
- [x] Execute every scenario in `.docs/tests/test-project-timeline.md` against the packaged Studio at
      desktop and phone widths, recording browser behavior, console state, and project-file evidence.
- [x] Run `git diff --check` and inspect the scoped diff for schema, lifecycle, security, generated
      asset, documentation, and stale-name consistency before completion.

## Validation

- `npm run typecheck` must exit 0 with no TypeScript diagnostics.
- `npm run build` must exit 0 and regenerate both packaged server and client output.
- `npm run test:pm` must exit 0 with all project-manager and Studio Node tests passing.
- `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager`
  must print `Skill is valid!`.
- Contract regression evidence must show identical `taskSpecHash` and valid active contract binding
  before and after a schedule-only edit.
- Schedule mutation tests must show invalid pairs, illegal targets, protected status changes, and
  stale revisions fail without changing the project mutation revision.
- Browser E2E follows `.docs/tests/test-project-timeline.md`; desktop and phone runs must exercise
  view deep links, shared filters/dialog, date edit, bar move/resize draft and save, active-task
  rescheduling, blocked lifecycle mutation, refresh, keyboard access, and zero runtime console errors.
- Browser marker evidence must distinguish project start/target, milestone target, evidence-backed
  milestone forecast, and target-only milestone with an explicitly unknown forecast.
- `git diff --check` must exit 0 and packaged assets must contain the Timeline UI.

## Rollback / Risk

- Scheduled task files move to an explicit `TASKS.md` schema v2. Existing v1 files remain byte-stable
  until first schedule save; older installed readers reject v2 cleanly. There is deliberately no
  silent downgrade. Manual downgrade is supported only after every schedule is cleared and must be
  followed by validation and `STATUS.md` regeneration.
- Excluding schedule from the task hash is intentional and must remain narrow. Accidentally excluding
  outcome, acceptance, dependency, executor, or other execution-defining fields would break evidence
  binding and is a blocking regression.
- Date-only arithmetic is vulnerable to timezone drift if implemented with local time. All range,
  movement, and width calculations must use UTC days.
- Pointer interactions can hide inaccessible behavior. The dialog remains the complete keyboard
  editing path, drag produces only a draft, and save remains explicit.
- A schedule edit races with any project-tree mutation through the existing full-tree revision and
  fails closed. No watcher or optimistic merge is introduced.
- Generated assets are large but required by the installed skill. Rollback must revert source and
  matching packaged output together.
