# Project Manager Kanban Studio

## Problem

The project-manager skill has trustworthy folder-native state and deterministic status commands,
but no fast visual operating surface. Reading `TASKS.md` or raw JSON is precise but slow when a
project manager needs to scan flow, identify blocked work, find the next executable task, or inspect
acceptance and ownership across a whole project.

A generic drag-and-drop board would be actively misleading. Project-manager lifecycle transitions
are evidence-backed and may require immutable Task Contracts and Evidence Manifests; moving a card
cannot safely stand in for those rules.

## Requirement

Add a packaged local Kanban Studio for one explicitly selected project folder. Studio must follow
the proven Agent World Studio delivery pattern: a skill-relative, no-install runtime launches a
loopback-only server, prints a tokenized URL, serves packaged frontend assets included in the scoped
delivery, and exposes only a small authenticated API.

The Kanban must render validated project-manager state as an operating view and allow controlled
task editing. It must show project health, exact task lifecycle state, ownership, priority,
blockers, dependencies, next-work ranking, and task acceptance detail. Edits must pass the same
whole-project validation and atomic mutation boundary as skill-led changes; Studio must not become
an alternative state store or bypass the skill's contract/evidence boundary.

## Acceptance Criteria

- [x] `project studio <folder>` launches a packaged local server for exactly that explicitly
      selected project and requires no install or build step in the installed skill.
- [x] The server binds only to `127.0.0.1`, prints a URL containing a random session token, exchanges
      that token for an HttpOnly SameSite=Strict cookie, and rejects unauthenticated API access.
- [x] Studio validates the selected folder through the existing project-manager state engine and
      never reads repository or sibling-project state implicitly.
- [x] The board groups every task into clear Kanban lanes while preserving and displaying each exact
      lifecycle value: `planned`, `ready`, `in_progress`, `implemented`, `verification`, `verified`,
      or `done`.
- [x] The UI exposes project/task totals, evidence-backed success coverage, actionable and blocked
      counts, ownership gaps, priority, blockers, dependencies, current-milestone context, and the
      deterministic next-work ranking without inventing schedule or coverage facts.
- [x] Users can search tasks, filter by priority and ownership, isolate blocked work, refresh the
      validated snapshot, and open a task detail view containing outcome, acceptance criteria,
      dependencies, blockers, executor, and evidence state.
- [x] Users can edit a never-started `planned` or `ready` task's title, outcome, acceptance criteria,
      priority, owner, milestone, criticality, planning status, dependencies, explicit blockers,
      success mappings, and constraints through a structured form while task ID and unrelated
      content remain immutable; tasks with attempt history or re-verification state are read-only.
- [x] Studio provides an explicit deterministic check before save; it validates a full candidate
      project, reports field or graph errors without mutation, and save repeats the check,
      regenerates `STATUS.md`, and atomically replaces only current mutable project state.
- [x] `project validate-task <folder> <task-id>` performs LLM judgment of outcome clarity,
      acceptance testability, scope, dependencies, constraints, and evidence quality using validated
      project context, while Studio can copy that exact command without claiming to execute it.
- [x] Contract-bound, evidence-backed, completed-milestone, and completed-project tasks remain
      inspectable but are not editable in Studio; the UI directs those changes through
      `project update` so re-verification, milestone, project, and immutable-history consequences
      stay under Project Manager control.
- [x] Check and save require the snapshot's exact project-tree mutation revision and task revision;
      a stale client receives a conflict without mutation, and concurrent saves within one Studio
      process execute in order even after an earlier save fails.
- [x] Studio provides no arbitrary filesystem path endpoint, shell endpoint, executor/run-control
      endpoint, or direct evidence/history editor.
- [x] Invalid or stale selected-project state fails visibly; refreshing after an external project
      update shows the new validated state without writing project files.
- [x] The board is keyboard-usable, communicates interactive controls and dialogs semantically,
      has visible focus states, and remains usable on narrow screens.
- [x] The compiled server and client assets are present under `skills/project-manager/` and included
      in the scoped delivery; typecheck, build, Node tests, skill validation, LLM route verification,
      and browser E2E verification all pass.

## Constraints

- Keep `PROJECT.md` and `TASKS.md` authoritative and `STATUS.md` derived; Studio owns no project
  state of its own and writes only through the existing candidate/validate/replace transaction.
- Reuse the existing parser, validators, status, blocker, next-work, and coverage calculations
  rather than duplicating Markdown parsing in the frontend.
- Keep the installed runtime launchable with plain Node.js and packaged build output included in the
  scoped delivery.
- Bind only to loopback and require an unguessable per-process session token for every API route.
- Preserve the project-manager skill's Node.js 22 baseline and explicit-folder isolation rules.
- Keep absent optional modules visibly unconfigured or unknown rather than converting them to zero.
- Keep the project schema unchanged; Studio selection and edit authority are explicit launch/API
  behavior, not a persistent flag in `PROJECT.md`.
- Keep deterministic project validity separate from semantic task quality; neither may be presented
  as a substitute for the other.
- Detect external changes immediately before replacement and reject stale saves; do not claim to
  prevent an uncooperative process from changing files outside the project-manager mutation boundary.

## Non-Goals

- Drag-and-drop evidence-state changes or bypassing whole-project validation for convenience.
- Starting executors, issuing Task Contracts, ingesting Evidence Manifests, or running RPD.
- Portfolio views, cross-project boards, remote hosting, authentication accounts, or deployment.
- Reproducing Agent World Studio's graph editor, file watcher, SSE event model, or prompt editor.
- Editing task IDs, executor evidence requirements, source bindings, external references, contracts,
  manifests, handoffs, reports, or optional module records in this MVP.
- Editing contract-bound or evidence-backed tasks, completed milestones, or a completed project in
  Studio; those changes require semantic impact handling through `project update`.
- Adding schedule estimation, duration-based critical path, or invented forecasts.
