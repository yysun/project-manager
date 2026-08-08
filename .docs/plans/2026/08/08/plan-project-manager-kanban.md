# Project Manager Kanban Studio Plan

## Goal

Deliver a secure, packaged Kanban Studio that makes one validated project-manager folder fast to
operate and supports controlled editing of unstarted tasks without weakening atomic mutation,
evidence-backed lifecycle, concurrency, or explicit-folder boundaries.

## Current Context

- `skills/project-manager/scripts/lib/project-state.js` already owns safe folder resolution,
  strict Markdown parsing, graph/lifecycle validation, normalized task state, status facts,
  blockers, coverage, and ranked next work.
- `skills/project-manager/scripts/lib/mutations.js` already validates same-filesystem candidates,
  preserves immutable history, replaces the selected project atomically, and rolls back failed
  replacements. It always commits a validated candidate, so a no-mutation check needs a separate
  disposable candidate path that shares the edit transformation but not the replacement step.
- A `planned` task can still retain immutable attempt history or pending `CHANGES.md` re-verification.
  Studio therefore edits only genuinely never-started tasks: status `planned|ready`, null execution
  pointers, no `handoffs/<task-id>/` subtree, and no change record with task re-verification state.
  Other tasks remain inspectable and route changes through `project update`.
- The skill currently exposes seven natural-language routes and six deterministic read-only CLI
  scripts. It has no web runtime, root package manifest, TypeScript source, or compiled UI assets.
- `../agent-world-skill` proves the useful packaging pattern: TypeScript/React source at the
  repository root, esbuild server bundle plus Vite client output committed inside the installed
  skill, loopback binding, random token handshake, authenticated `/api/*`, and real-process tests.
- Agent World Studio's watcher, SSE, graph canvas, prompt editor, and model-free validation solve
  different problems and should not be copied.
- The project-manager lifecycle has seven exact states. The board will group them into five operating
  lanes while retaining the exact badge on every card: Planned; Ready; Active (`in_progress`,
  `implemented`, `verification`); Verified; Done.

## Decisions

- Follow Agent World Studio's runtime and packaging boundary, not its feature scope. A private root
  package supplies React, Vite, TypeScript, esbuild, and Express at build/test time. esbuild emits a
  self-contained server to `skills/project-manager/scripts/project-manager-studio.js`; Vite emits
  static assets to `skills/project-manager/studio/dist/`. Installed use is plain Node with no install.
- Add `project studio <folder>` and `project validate-task <folder> <task-id>` as skill routes.
  Studio passes the explicit folder through `--project`. Task validation is an LLM review route in
  the skill, not a server API or a claim that the local process can call Codex.
- Create shared API/projection types before server or client work. The projection composes the
  existing validated state, status, blocker, next-work, and coverage functions; no second Markdown
  parser or client-side fact inference is allowed.
- Expose only authenticated `GET /api/project`, `POST /api/tasks/:id/check`, and
  `PUT /api/tasks/:id`. The task ID is the only post-start selector and must resolve in the already
  selected project. There is no arbitrary path, shell, executor, contract, manifest, or run endpoint.
- Keep two revisions distinct. `state.source_sha256` remains the normalized semantic revision used
  by `STATUS.md`. Check and save receive `mutationRevision`, calculated by normalizing descendant
  paths to project-relative POSIX form, emitting canonical-JSON records ordered lexically by path
  with exact `{path,type,digest}` file records, `{path,type,target}` symlink records, and
  `{path,type}` directory records, then hashing the canonical array. They also receive `taskRevision`
  (`task.spec_sha256`). A mismatch returns HTTP 409 with current revisions and changes no file. Save
  repeats the candidate check so a previous successful check is never a durable authorization token.
- Queue Studio save handlers within the one server process so concurrent browser saves execute in
  arrival order without a persistent filesystem lock. Chain each operation after both fulfillment
  and rejection of its predecessor so one failed/conflicting save cannot poison the queue. Before
  candidate creation and immediately before replacement, `atomicProjectMutation` recomputes the exact
  tree mutation revision; abort on mismatch. This detects external narrative, report, handoff, and
  arbitrary-byte changes before replacement without claiming a filesystem-wide lock.
- Implement one pure task-document transformation shared by two paths. `checkTaskEdit` copies the
  project to a disposable same-filesystem candidate, transforms only candidate `TASKS.md`, regenerates
  candidate `STATUS.md`, fully loads/validates it, returns the projected candidate task, then deletes
  the disposable tree without touching live state. `saveTaskEdit` supplies that same transformation
  to `atomicProjectMutation` with expected revisions.
- Candidate copies use `dereference:false` and `verbatimSymlinks:true`; immediately after copy and
  before transformation, the candidate mutation revision must equal the captured live revision.
  Relative and absolute symlink text is preserved rather than rebased or dereferenced.
- Add `loadRevisionedProject(root)`: compute the exact tree revision, load and validate state, build
  the projection, then recompute the tree revision. Return the snapshot only when the two revisions
  match; otherwise retry from scratch up to three times and then return a structured transient
  conflict. GET and the initial check/save load must use this primitive so task data and revision
  always describe one coherent filesystem snapshot.
- Reject FIFOs, sockets, devices, and every descendant entry type other than directory, regular file,
  or symlink before hashing or copying. Return a structured unsupported-entry error; never skip an
  entry from an “exact” revision.
- Allow edits only when live status is `planned|ready`, execution pointers are null, no task attempt
  directory exists, and no `CHANGES.md` record carries re-verification state for that task.
  Expose title, outcome, acceptance, priority, owner, milestone, critical, `planned|ready` status,
  dependencies, explicit blockers, success criteria, and constraints. IDs, executor, sources,
  evidence requirements, external refs, contract/manifest pointers, attempt history, reports, and
  optional-module records are read-only.
- Preserve narrative and unrelated task content by replacing only the edited task heading/JSON plus
  mechanically affected reverse `blocks` arrays. The full validator decides dependency, cycle,
  ready-state, milestone, success mapping, and complete-project legality.
- Label the local action “Check changes.” It proves structural, graph, lifecycle, and save safety.
  “Copy LLM review command” copies `project validate-task <absolute-folder> <task-id>`; semantic
  review judges outcome clarity, acceptance testability, scope, dependencies, constraints, and
  evidence quality and remains read-only unless the user separately asks to apply changes.
- Reload and validate on every project GET. A stale `STATUS.md` is a visible warning; invalid state is
  a structured error with no fallback snapshot.
- Use Agent World Studio's design-token language as a visual family, adapted to a dense operations
  layout: summary rail, toolbar, horizontally scrollable lanes, evidence-aware cards, and an
  accessible detail/editor dialog. Cards are buttons, not draggable state transitions.
- Add no persistent project flag, remote bind mode, fallback parser, compatibility mode, watcher,
  SSE protocol, environment-variable behavior, or alternate static-export path.

## Phased Tasks

### Phase 1 - Shared contracts and public routes

- [x] Add shared projection, edit-request, success, validation-error, and conflict types under
      `src/project-manager-studio/shared/` before implementing either server or client.
- [x] Add `kanbanData(state)` in `skills/project-manager/scripts/lib/project-state.js` so one
      validated state produces stable project, summary, lane, task-detail, editable eligibility,
      revisions, next-work, blocker, coverage, and warning facts without client inference.
- [x] Extend `skills/project-manager/SKILL.md` with `project studio <folder>` and
      `project validate-task <folder> <task-id>`, including skill-relative launch guidance,
      explicit-folder handling, task-edit eligibility, and deterministic-versus-semantic validation.
- [x] Update `skills/project-manager/references/tasks.md` with the LLM task-quality checklist and an
      output contract separating blocking defects, recommendations, and strong properties; keep the
      route read-only unless the user separately authorizes revisions.
- [x] Update `skills/project-manager/agents/openai.yaml` to include visual inspection and controlled
      task editing without implying direct evidence transitions.

### Phase 2 - Candidate editing and concurrency foundation

- [x] Implement `skills/project-manager/scripts/lib/task-editor.js` with an exact editable-field
      allowlist, revision preconditions, unstarted-task eligibility, narrative-preserving record
      replacement, reverse-link maintenance, and a shared candidate transformation.
- [x] Implement disposable `checkTaskEdit` so a same-filesystem candidate is regenerated and fully
      validated, its result is returned, and the live tree hash remains unchanged on success or error.
- [x] Extend `skills/project-manager/scripts/lib/mutations.js` with `mutationRevision(root)` over the
      exact descendant tree plus expected-revision checks before candidate creation and immediately
      before replacement, canonical record ordering/framing, insertion-order independence,
      unsupported-entry rejection, verbatim non-dereferenced candidate copying, post-copy revision
      equality, full cleanup, and existing rollback/recovery behavior.
- [x] Implement `loadRevisionedProject(root)` with before/load-project/after bracketing, three bounded
      retries, coherent projected revisions, and structured transient-conflict failure; use it for
      GET and the initial check/save snapshot.
- [x] Implement `saveTaskEdit` through `atomicProjectMutation`, using the same transformation as the
      check path and returning the newly validated task/project revisions.

### Phase 3 - Studio server and packaged build

- [x] Add root `package.json`, `package-lock.json`, `tsconfig.json`,
      `vite.project-manager.config.mts`, and `scripts/build-project-manager-studio.mjs` with Node 22
      targets, `npm ci`, typecheck, server build, client build, and test scripts.
- [x] Implement `src/project-manager-studio/server/cli.ts` to strictly parse `--project`, `--port`,
      and `--no-open`; validate before listening; bind `127.0.0.1`; print the tokenized URL; optionally
      open a browser; and release the port and lock-free resources on SIGINT/SIGTERM.
- [x] Implement `src/project-manager-studio/server/server.ts` with a random token handshake,
      HttpOnly SameSite=Strict cookie, strict JSON limit, authenticated project/check/save routes,
      an in-process promise queue whose tail recovers after failed operations, structured
      400/409/500 errors, static assets, and no other mutable endpoint. Generate each process token with
      `crypto.randomBytes(32).toString('hex')`.
- [x] Build `skills/project-manager/scripts/project-manager-studio.js` and
      `skills/project-manager/studio/dist/`; copy only `skills/project-manager/` outside repository
      and module ancestry and launch it with plain Node to prove no-install packaging.

### Phase 4 - Kanban client

- [x] Implement `src/project-manager-studio/client/App.tsx` with project identity, truthful summaries,
      search, priority/owner/blocker filters, refresh, five lanes, exact state badges, next-work
      emphasis, stale/conflict/error handling, and filtered empty states.
- [x] Implement accessible detail/edit components under
      `src/project-manager-studio/client/components/` showing full read-only evidence context and,
      only for eligible tasks, structured fields, Check Changes, Save, stale-conflict recovery, and
      Copy LLM review command. Disable editing with a specific reason for every ineligible task.
- [x] Implement design tokens and `src/project-manager-studio/client/styles.css` for a 1440×900
      desktop board and 390×844 phone layout, visible focus, non-color status cues, horizontal lane
      overflow, semantic dialogs, and readable compact cards.

### Phase 5 - Automated verification

- [x] Extend `skills/project-manager/tests/project-manager.test.js` with stable Kanban projection
      assertions for lane grouping, blockers, ranking, owner gaps, exact details, revision fields,
      edit eligibility, and unconfigured optional modules. Exercise all seven states and five lanes in
      the packaged browser fixture and E2E scenarios.
- [x] Add task-editor unit tests for exact allowlisting, positive check/save coverage across the
      editable payload, dry-run byte invariance, protected-field and invalid-graph rejection,
      narrative/reverse-link preservation, historical-attempt and re-verification rejection, stale
      revisions, post-replacement rollback, canonical insertion-order independence, relative/absolute
      symlink preservation, root-symlink escape prevention, unsupported FIFO rejection, and CRLF
      preservation in `tests/project-manager-studio/task-editor.test.js`. Retain broader parser,
      lifecycle, immutable-history, and transaction coverage in the existing project-manager suite.
- [x] Add `tests/project-manager-studio/` real-process tests for loopback binding, token/cookie
      enforcement, selected/sibling isolation, GET/check/save, 409 conflicts, structured invalid-state
      errors, ordered concurrent saves plus a valid save after a failed queued save, forbidden
      endpoints, distinct 256-bit tokens across launches, static assets, clean shutdown, and
      installed-skill isolation.
- [x] Add `tests/project-manager-studio/create-browser-fixture.js` that creates an isolated validated
      project and sibling under the OS temporary directory, including every lifecycle state, explicit
      and dependency blockers, owner gaps, acceptance detail, optional-module absence, editable tasks,
      immutable attempt evidence, and a structurally valid `TASK-VAGUE` whose outcome and acceptance
      are intentionally non-specific, then prints their absolute paths as JSON.
- [x] Run `npm run typecheck`, a clean `npm run build`, all Node suites, and skill validation; rerun the
      build and verify generated outputs have no diff. Record Node 22 version and exact results.
- [x] Measure `mutationRevision` and project GET latency on a temporary 10,000-entry/100 MiB project,
      using three runs. Require median GET latency at or below 2 seconds and no single synchronous
      revision span above 1 second; record raw/median results in
      `.docs/tests/results/project-manager-kanban/performance.md`. Exceeding either threshold blocks
      implementation and reopens the whole-folder transaction/revision architecture.

### Phase 6 - Semantic and browser E2E evidence

- [x] Execute `project validate-task <fixture-folder> TASK-VAGUE` as an LLM route test after recording
      the fixture tree hash; confirm validated context, the six semantic judgments, three output
      classes, read-only behavior, and unchanged post-run hash.
- [x] Execute `project studio <fixture-folder>` as a skill-route test; confirm the host resolves the
      installed skill-relative script, passes exactly the selected folder, and reports the tokenized
      loopback URL without loading the sibling.
- [x] Launch the fixture with the built server and execute browser Scenarios 3–10 and 12–14 at
      1440×900, then Scenario 15 at 390×844, saving evidence to
      `.docs/tests/results/project-manager-kanban/desktop.png`, `phone.png`, and `e2e.md`. Cover scan,
      filters, detail, check/save, invalid and stale conflicts, copy command, disabled historical-task
      editing, refresh, focus, overflow, and console/runtime errors.
- [x] Confirm screenshots and browser inspection show no clipping, overlapping controls, invented
      facts, missing focus, unsupported transition affordance, or console/runtime error.
- [x] Mark every plan task complete only after its implementation or verification evidence exists.

## Validation

- Dependencies: `npm ci` succeeds from `package-lock.json`.
- Runtime baseline: `node --version` reports Node 22.x.
- Type safety: `npm run typecheck` exits 0.
- Build: `npm run build` exits 0; required generated files appear in `git status`; hashes of the
  complete generated server/client trees are recorded, a second clean build runs, and the hashes are
  byte-identical.
- Existing engine: `node --test skills/project-manager/tests/project-manager.test.js` exits 0.
- Studio/task editing: `node --test tests/project-manager-studio/*.test.js` exits 0, including the
  copied-skill no-install launch and real child-process HTTP tests.
- Skill: `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager`
  reports `Skill is valid!`.
- LLM route: the exact `TASK-VAGUE` review evidence and pre/post fixture tree hash are recorded in
  `.docs/tests/results/project-manager-kanban/e2e.md`.
- E2E split: Scenario 1 records host-route evidence; Scenario 2 records raw HTTP evidence; Scenario 11
  records LLM-route evidence; Scenarios 3–10 and 12–14 record browser evidence at 1440×900;
  Scenario 15 records browser evidence at 390×844.
  Screenshots and console inspection are saved with the result.
- Scope: `git diff --check` exits 0 and `git status --short` contains only Kanban Studio source,
  compiled assets, build files, project-manager guidance/tests, and matching RPD artifacts. Commit
  content is verified later by GC.

## Rollback / Risk

- A UI can create false authority. Every fact comes from validated state, exact lifecycle remains
  visible, active/evidence-backed edits are disabled, and cards do not drag between evidence states.
- A local service still has a browser-origin attack surface. Bind only to loopback, require a random
  session cookie for every API request, accept only the selected project plus task ID, limit request
  size, and test every registered/forbidden route.
- New build dependencies can leak into installed use. Bundle server dependencies, commit assets, and
  launch an isolated copy of only the skill package with plain Node.
- Check/save can race with external edits. Carry exact tree and task revisions, keep the Studio queue
  live after rejection, and compare the full tree immediately before replacement. Report conflicts;
  do not claim protection against a writer that changes bytes in the final rename race window.
- Exact revisions are O(project entries + bytes) because the transaction swaps the whole selected
  folder, including project-contained executor roots. Favor conflict correctness, enforce the
  10,000-entry/100 MiB latency thresholds, and expose loading/checking state instead of implying
  refresh is free on very large folders. If the threshold fails, redesign the transaction boundary;
  do not waive the result.
- Editing a bound task can require re-verification and milestone/project changes. Keep it out of
  Studio MVP and direct the user to `project update` for semantic impact handling.
- Five lanes can hide exact seven-state semantics. Preserve the exact badge and detail on every card.
- Rollback removes the Studio routes, root source/build config, task editor/concurrency additions,
  compiled assets, and matching tests/docs. Existing project state needs no migration.
