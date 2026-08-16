# Plan: Timeline manual task order

## Goal

Every task carries an order number that governs Studio Timeline row order, defaulting to today's
derived arrangement and overridable by dragging a Timeline left-column row. Overrides persist in
the selected project's `TASKS.md` behind a new task collection schema version, written through
the existing atomic, revision-guarded mutation path, and excluded from the task specification
hash and Task Contract.

## Current Context

Read during planning:

- `skills/project-manager/scripts/lib/project-state.js`
  - `parseCollection` (line 177) enforces collection frontmatter `schema_version` against an
    allowlist; `loadProject` (line 882) passes `{ schemaVersions: [1, 2, 3] }` for `TASKS.md`.
  - `normalizeTask` (line 293) gates permitted task keys by version: `>= 2` adds the schedule
    pair, `=== 3` adds the disposition pair. It then re-adds the same fields to the normalized
    task under `if (schemaVersion === 2)` / `if (schemaVersion === 3)` blocks, deliberately
    keeping each version's normalized shape byte-stable so `source_sha256` and therefore
    `STATUS.md` freshness cannot drift when a capability is merely installed.
  - `taskEditEligibility` / `scheduleEditEligibility` / `dispositionEditEligibility`
    (lines 1167-1192) are the three existing edit authorities; each returns `{ editable, reason }`
    and is projected per task by `kanbanData` (line 1211).
  - `state.source_sha256` hashes normalized tasks, so any stored order changes it and requires a
    `regenerateStatus` pass in the same mutation.
- `skills/project-manager/scripts/lib/contracts.js` — `taskSpecPayload` (line 104) lists exactly
  the contract-bearing fields. It already excludes schedule, disposition, priority, status and
  owner, so an order field is excluded from `spec_sha256` by construction, not by extra code.
- `skills/project-manager/scripts/lib/task-editor.js` — `parseTaskRecords` / `renderRecord` /
  `transformTaskDocument` rewrite only changed records in place and bump `schema_version` on
  first use of a versioned field; `validateEnvelope` enforces `mutationRevision` plus the target
  `taskRevision`; `saveTaskEdit` wraps `atomicProjectMutation` and re-reads through
  `loadRevisionedProject`.
- `src/project-manager-studio/server/server.ts` — `editRequest` validates exact request keys;
  `PUT /api/tasks/:taskId` serializes writes through `enqueue`; `apiError` maps
  `MUTATION_CONFLICT` to 409.
- `src/project-manager-studio/client/timeline-model.mjs` — `sortTimelineTasks` (line 22) is the
  derived comparator: scheduled start, scheduled end, milestone, ID, undated last.
  `createDragSuppression` (line 80) is the existing drag-vs-click discipline.
- `src/project-manager-studio/client/components/Timeline.tsx` — rows are
  `.timeline-row-group` containing a `TimelineLabel` button and a `.timeline-track`; schedule
  drags use a draft plus an explicit "Save schedule" banner, and `onDraftChange` raises the
  auto-refresh barrier in `App.tsx`.
- `src/project-manager-studio/client/styles.css` lines 35-42 — `.timeline-grid` is a two-column
  grid (`300px`, `230px` at the mobile breakpoint) and `.timeline-row-group` is `display:contents`,
  so the label cell is a direct grid child and cannot gain a wrapper without a CSS change.
- `tests/project-manager-studio/` — `timeline-model.test.js` unit-tests the pure client model,
  `task-editor.test.js` the mutation library, `studio-server.test.js` the HTTP boundary against a
  real spawned server via `_helpers.js`.

Known unknowns going in: none blocking. The one open judgement is how a stored order interacts
with tasks that have no stored value, resolved under Decisions.

## Decisions

- **Order is a per-task integer field named `order`, gated at `TASKS.md` schema v4.** It follows
  the exact precedent of schedule at v2 and disposition at v3 rather than inventing a new
  storage location. v4 is a strict superset of v3.
- **v1, v2 and v3 keep their current normalized shapes.** The version gating in `normalizeTask`
  changes from `=== 3` to `>= 3` for disposition and adds `>= 4` for order, so v2 and v3 projects
  normalize to byte-identical values and no untouched `STATUS.md` becomes stale.
- **The effective order number is `stored order` when present, otherwise the task's 1-based index
  in the derived arrangement**, so a task appended later by an agent lands at its date position
  instead of being exiled to the end. Rejected: requiring a complete, dense, unique stored
  sequence — a hand edit or an agent-appended task would then fail project validation, turning a
  display preference into a broken project.
- **Positions are doubled to keep the two kinds from colliding**: a stored order `n` becomes `2n`
  and a generated position `n` becomes `2n+1`. Implementation revealed that mapping both into a
  plain `1..N` space lets a newly added task's generated default tie with a stored number and, on
  the derived tie-break, displace the row that had explicitly claimed that slot. Doubling places a
  generated default immediately *after* the stored row holding the slot, so an operator's explicit
  choice always outranks a coincidental default.
- **Defaults are computed for display and never written back on read.** Rejected: backfilling
  order numbers into every project on first open, which would make merely launching Studio mutate
  every project on disk and dirty every `mutationRevision`.
- **No ordering mode, toggle, or "reordered" flag.** Order number is an ordinary task property.
  Reset is not a mode switch; it discards stored numbers so defaults are generated again.
- **A reorder writes the full dense 1..N sequence for every task in the project.** The client
  computes the complete sequence — including tasks its filters currently hide — and sends it, so
  a drop against a visible neighbour cannot scramble hidden rows. Rejected: sending a target
  index, which is ambiguous under filtering; rejected: fractional/midpoint rank values, which add
  precision-drift and normalization work for no gain at project task counts.
- **One new project-level route, `PUT /api/task-order`**, guarded by `mutationRevision` only.
  Order is not part of `spec_sha256`, so no `taskRevision` exists to guard, and a per-task
  envelope would be a false claim of per-task authority for a whole-project write. Rejected:
  overloading `PUT /api/tasks/:taskId` with an `order` edit field, which would make the
  single-task edit allowlist lie about the write's true blast radius.
- **New project-level authority `taskOrderEditEligibility(state)`**, blocking only when the
  project status is `complete`. Reordering changes no specification, lifecycle, schedule or
  evidence, so done, cancelled and evidence-backed tasks stay reorderable — the existing per-task
  authorities are deliberately not consulted.
- **At v4 every normalized task carries an `order` key, `null` when unstored.** That changes
  `source_sha256` for a document once it reaches v4, which is correct and harmless because the
  only way to reach v4 is a mutation that regenerates `STATUS.md` in the same transaction. It is
  precisely why v1/v2/v3 must keep their existing shapes.
- **Clearing order leaves the collection at v4.** Downgrading the version would be wrong whenever
  schedule or disposition fields are present, and v4 without order fields is valid by superset.
- **A reorder does not touch any task's `updated` date.** `updated` tracks task content; stamping
  every task on every drag would churn the file and misreport specification activity.
- **No dry-run `check` counterpart.** The only validation is that the submitted sequence is a
  permutation of the project's task ids, which is checked synchronously before any write; a
  candidate-workspace dry run would add a full project copy for nothing.
- **Reorder uses the same draft-then-save banner as schedule drags**, and the two drafts are
  mutually exclusive within the panel. This reuses the existing auto-refresh edit barrier instead
  of adding a second, immediate-write path with different concurrency behaviour.
- **The Kanban view, the MCP App, `project next`, and every recommendation and scheduling
  calculation are untouched.** Order is Timeline display order only.
- Rejected outright: any feature flag, environment variable, dual-write mode, or compatibility
  layer for schema v4.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Confirm in `skills/project-manager/scripts/lib/contracts.js` that `taskSpecPayload` omits
      planning metadata, so adding `order` cannot change `spec_sha256` or Task Contract identity.
- [x] Confirm in `skills/project-manager/scripts/lib/project-state.js` that `normalizeTask`
      version gating is what keeps v1/v2/v3 normalized shapes stable, and record that v4 must
      preserve them.
- [x] Record the rejected alternatives (index-based drops, fractional ranks, per-task order
      route, order in the single-task edit allowlist, read-time backfill, ordering mode flag) so
      implementation does not reintroduce them.

### Phase 2 - Project state foundation: schema v4

- [x] Extend `normalizeTask` in `skills/project-manager/scripts/lib/project-state.js` to permit
      `order` at `schemaVersion >= 4`, change the disposition gate from `=== 3` to `>= 3`, and
      convert the `=== 2` / `=== 3` normalized-shape blocks to `>= 2` / `>= 3` plus a new `>= 4`
      block assigning `task.order`.
- [x] Add `order` validation in `normalizeTask`: absent, or an integer greater than zero, failing
      with a `TASK_ORDER` code; do not require density or uniqueness across tasks.
- [x] Update the `TASKS.md` `parseCollection` call in `loadProject` to accept schema version 4.
- [x] Add `taskOrderEditEligibility(state)` next to the existing three authorities, blocking only
      a `complete` project with a stated reason, and export it from the module.
- [x] Project `order` and the new authority through `kanbanData`: `order` on each task, and
      `task_order_editable` / `task_order_edit_reason` on the `project` object.
- [x] Verify with a scratch fixture that a v2 and a v3 project produce unchanged `source_sha256`
      values before and after this phase, so no existing `STATUS.md` becomes stale.

### Phase 3 - Mutation path: persist and clear order

- [x] Add `transformTaskOrderDocument(text, order)` to
      `skills/project-manager/scripts/lib/task-editor.js`: for an array, validate it is an exact
      permutation of the document's task ids and assign `order` 1..N; for `null`, delete `order`
      from every record; rewrite only records whose bytes change.
- [x] Make `transformTaskOrderDocument` raise the collection `schema_version` to 4 when assigning
      order, and leave the version untouched when clearing.
- [x] Add `saveTaskOrder(root, request, options)` to `task-editor.js` mirroring `saveTaskEdit`:
      revision-stable load, `mutationRevision` check, `taskOrderEditEligibility` check,
      `atomicProjectMutation` applying the transform plus `regenerateStatus`, then a re-read.
- [x] Export `transformTaskOrderDocument` and `saveTaskOrder`, and confirm `saveTaskEdit` and the
      single-task `EDITABLE_FIELDS` allowlist are left unchanged so `order` cannot be written
      through the task edit route.

### Phase 4 - Studio HTTP boundary

- [x] Add `orderRequest(body)` to `src/project-manager-studio/server/server.ts` validating exact
      keys `projectKey`, `mutationRevision`, `order`, with `order` either `null` or an array of
      non-empty strings.
- [x] Add `PUT /api/task-order` routed through the existing `enqueue` serializer,
      `catalog.resolve`, `saveTaskOrder`, and `catalog.decorate`, returning the refreshed board.
- [x] Add `order`, `task_order_editable`, and `task_order_edit_reason` to the shared contract in
      `src/project-manager-studio/shared/api.ts`, plus a `TaskOrderRequest` type.

### Phase 5 - Client model and Timeline interaction

- [x] Add `effectiveTaskOrder(tasks)` and an order-aware `sortTimelineTasks` to
      `src/project-manager-studio/client/timeline-model.mjs`, keeping the existing derived
      comparator as the default generator and the tie-breaker.
- [x] Add pure `moveTaskOrder(sequence, taskId, targetId, side)` to `timeline-model.mjs` returning
      the complete reordered id sequence, and keep it independent of filtering.
- [x] Update `timeline-model.d.mts` with the new exports.
- [x] Restructure the Timeline draft state in
      `src/project-manager-studio/client/components/Timeline.tsx` into one union of a schedule
      draft and an order draft, so only one is pending at a time and both raise the existing
      `onDraftChange` barrier.
- [x] Convert the label cell in `TimelineLabel` from a single `<button class="timeline-label
      timeline-task-label">` into a `<div class="timeline-label">` wrapper holding a grip
      `<button>` and the existing label `<button>`. The grip cannot be a sibling grid child:
      `.timeline-grid` has exactly two columns and `.timeline-row-group` is `display:contents`, so
      a third per-row child would break the grid, and a nested button inside the label button is
      invalid HTML.
- [x] Add the per-row reorder grip inside that wrapper, with pointer drag that moves the row and
      reuses `createDragSuppression` so a drag never opens the task dialog.
- [x] Add `ArrowUp` / `ArrowDown` keyboard reordering on the grip with an `aria-live` status
      announcing the moved row's new position.
- [x] Add a "Reset order" control that stages an order draft of `null`, shown only when the loaded
      project stores order numbers.
- [x] Extend the draft banner to save either draft: schedule through `PUT /api/tasks/:taskId`,
      order through `PUT /api/task-order`, with conflict messages telling the operator to refresh.
- [x] Disable the grip and reset control with the server-supplied reason when
      `task_order_editable` is false.
- [x] Update `styles.css` for the grip column within the existing `300px` / `230px` label cell,
      the dragging row state, and reduced-motion behaviour.

### Phase 6 - Tests and verification wiring

- [x] Add `timeline-model.test.js` cases: generated defaults match the pre-existing derived order,
      stored numbers win, a task with no stored number is placed deterministically, and
      `moveTaskOrder` returns a full permutation under a filtered visible subset.
- [x] Add `task-editor.test.js` cases: order persists to `TASKS.md` and bumps the collection to
      v4, clearing removes the field, task `spec_sha256` values are identical before and after a
      reorder, `updated` is untouched, and a non-permutation request is refused.
- [x] Add `studio-server.test.js` cases: `PUT /api/task-order` persists and reloads the order, a
      stale `mutationRevision` returns 409, an unknown or duplicated task id returns 400, and a
      `complete` project is refused with the authority reason.
- [x] Add a project-state case asserting a v1/v2/v3 project rejects `order` and that a v4 project
      loads it, and that reading a project never writes to `TASKS.md`.
- [x] Add an atomicity case using the existing `injectFailureAfterReplace` hook: a reorder that
      fails after replacement leaves `TASKS.md` and `STATUS.md` with their exact prior bytes and no
      partial ordering.
- [x] Run `npm run typecheck` and record the result.
- [x] Run `npm run build` and record the result.
- [x] Run `npm run test:pm` and record the pass/fail counts.

### Phase 7 - Documentation and packaged artifacts

- [x] Document schema v4 and the `order` field in
      `skills/project-manager/references/conventions.md` beside the v2/v3 paragraphs, including
      absence rules and exclusion from the specification hash.
- [x] Update the Studio section of `skills/project-manager/SKILL.md` to state that Timeline row
      order is a persisted task property with generated defaults.
- [x] Update `skills/project-manager/references/tasks.md` if its task metadata example or field
      list needs the new field.
- [x] Run `npm run build:plugin` and commit the regenerated root `bin/` and `ui/` outputs, as
      `AGENTS.md` requires.
- [x] Record final evidence showing a reorder round-trips through `TASKS.md` and leaves task
      revisions unchanged.

## Validation

- `npm run typecheck` — must pass with no errors.
- `npm run build` — must complete; it runs the server bundle, the Vite client build, and the
  plugin packaging that `AGENTS.md` requires before the work is considered complete.
- `npm run test:pm` — must pass, including the new cases in `timeline-model.test.js`,
  `task-editor.test.js`, and `studio-server.test.js`.
- Byte-stability evidence: for a v2 and a v3 fixture project, `source_sha256` before the change
  equals `source_sha256` after it, proving no untouched project's `STATUS.md` becomes stale.
- Contract-stability evidence: every task's `task_revision` is identical before and after a
  reorder in the `task-editor.test.js` case.
- E2E scenarios in `.docs/tests/test-timeline-task-order.md` executed against a spawned Studio.

## Rollback / Risk

- **Schema v4 is a forward-only file change.** A project reordered by this build cannot be read
  by an older installed copy of the skill, exactly as v2 and v3 already behave. Mitigation: the
  version rises only when an operator actually reorders, so untouched projects stay readable by
  older installs. Rollback for a single project is `PUT /api/task-order` with `null`, or deleting
  the `order` fields and restoring the frontmatter version by hand.
- **`source_sha256` drift is the main regression risk.** A careless rewrite of the `normalizeTask`
  version blocks would silently change v2/v3 normalized shapes and mark every existing project's
  `STATUS.md` stale. The Phase 2 byte-stability check exists specifically to catch that, and it
  must run before Phase 3.
- **Whole-project write from a filtered view** is the main correctness risk. It is contained by
  computing the sequence over all tasks, validating an exact permutation server-side, and
  refusing stale `mutationRevision` values.
- **Pointer reorder inside a horizontally scrolling grid** may behave awkwardly for rows outside
  the viewport; edge auto-scroll during drag is deliberately out of scope, and keyboard reordering
  is the accessible path for long lists.
- The generated `skills/project-manager/scripts/project-manager-studio.js` bundle and
  `skills/project-manager/studio/dist` are build outputs; if a build is skipped the packaged skill
  silently keeps the old behaviour. Phase 7 makes the rebuild explicit.
