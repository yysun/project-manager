# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers are
the shared plugin release recorded in `plugin.json` and both bundled skills. Studio and repository
tooling ship alongside the skills and are noted under the release they landed in.

State-file schema versions are independent of the skill version and are called out per release. A
project written by an older release keeps loading unchanged; no release has required a migration.

## [Unreleased]

## [1.12.1] — 2026-09-02

### Changed

- Unified the Project Manager skill, Test Manager skill, plugin manifest, and MCP App runtime under
  release `1.12.1`. `npm run release:version -- <semver>` now updates all release-bearing files
  together while Test Manager remains independently installable.
- Simplified Test Manager by removing the product-specific `goal-based-ui` prompt profile and its
  bundled execution contract. Projects now define specialized runner behavior entirely through the
  existing `RUNNER_PROMPT.md` and Case-level Runner Instructions; standalone operational UX audits
  remain the responsibility of the independent `audit-ui-ops` skill. The `.tests` schema, default
  Runner Prompt, Studio projection, and Run ledger are unchanged.

No `.projects` or `.tests` schema changed in this release.

## [1.12.0] — 2026-09-01

### Added

- **Test Manager Suite timeline and disposable demo.** Optional paired `Planned Start` and
  `Planned End` metadata now projects Cases onto a UTC weekly timeline without changing their
  design or execution state. `npm run tm-studio:dev` creates a fresh temporary workspace for
  browser testing without touching a real `.tests` directory.
- **Copy-ready Runner Prompts.** `test-manager.mjs prompt <case-id>` and Studio now render a
  complete execution mission from validated Case state, the project-owned `RUNNER_PROMPT.md`, and
  optional per-Case Runner Instructions.
- Test Manager can render an eligible ready Case through the opt-in `goal-based-ui` Runner Prompt
  profile for fresh-context visible-UI execution, explicit task-outcome versus Run-result mapping,
  interaction traces, contamination disclosure, and raw operational metrics. Omitting the profile
  preserves the existing project-owned prompt behavior. No `.tests` schema or Studio control changed,
  and the independent `audit-ui-ops` skill remains unbundled.

### Changed

- Project Manager and Test Manager handoffs now lead with an assessment grounded in validated state
  and exactly one recommended next action, so operators get a decision instead of a state dump.
- Timeline rows now keep Case state, priority, owner, suite/design, and latest-Run context visible;
  unscheduled Cases remain equally inspectable instead of disappearing from the planning surface.
- Local plugin development now uses `project-manager@personal` as the sole persistent installation.
  Standalone skill behavior stays covered through isolated validators and smoke fixtures, avoiding
  duplicate skill identities while the plugin is enabled.

No `.projects` or `.tests` schema changed in this release.

## [1.11.0] — 2026-08-28

### Added

- **Test Manager as a canonical sibling skill.** Installing the root Agent Plugin now exposes both
  Project Manager for `.projects` delivery coordination and Test Manager `0.1.0` for `.tests` QA
  strategy, case design, evidence-backed execution, immutable Run history, defects, and release
  gates. `skills/test-manager/` is also a complete standalone installation with its own local,
  loopback-only, token-protected Studio.
- Package inventory, independent-version, skill-validation, unit/integration, and isolated
  standalone Studio/API smoke coverage for the bundled Test Manager source.

### Changed

- Skill selection and package documentation now state the authority boundary explicitly: Project
  Manager owns delivery coordination and never manages QA case or Run state; Test Manager owns QA
  state and never becomes the product-delivery coordinator.
- Plugin release checking reports Test Manager's independent version and canonical source without
  coupling it to the Project Manager plugin, skill, or MCP runtime version.

No `.projects` or `.tests` schema changed in this release.

## [1.10.0] — 2026-08-18

### Added

- **Run records.** A new optional `RUNS.md` state file (**schema version 1**) records each run's ID,
  status, timestamps, per-repository integration branch, base branch, base commit, and coordinator
  worktree, and per-task branch, executor root, and integration flag. `startRun`, `advanceRun`, and
  `resumeRun` in [`scripts/lib/run-execution.js`](skills/project-manager/scripts/lib/run-execution.js)
  drive it through the existing atomic mutation path, with a `project-run.js` CLI exposing
  `start`, `advance`, and `resume`. `startRun` refuses to open a second run beside an unfinished one;
  `resume` is read-only and answers from `RUNS.md` alone, performing no Git or filesystem discovery.
  Before this, none of that existed on disk, so a lost coordinator session could not resume a run —
  only start a new one and orphan the previous integration branch. A project with no `RUNS.md` hashes
  exactly as it did before: the pre-change module and this one were run against an identical fixture,
  and that literal is now pinned in the suite, so a change that would stale every project's cached
  `STATUS.md` fails a test.
- **Execution telemetry.** Evidence manifests accept `schema_version: 2`, which adds an `execution`
  object carrying `llm_calls`, `tool_calls`, `input_tokens`, and `output_tokens`. Counts are
  incremental per manifest rather than cumulative, so one summation rule composes at attempt, task,
  and run level; executors must follow it or task totals will be wrong, and the rule is stated in
  [conventions.md](skills/project-manager/references/conventions.md) and
  [execute-rpd.md](skills/project-manager/references/execute-rpd.md). Elapsed time is derived from
  contract and manifest timestamps, so it is recorded even when an executor reports no counts. A
  read-only `executionData` projection aggregates attempt → task → run and is surfaced in
  `reportData`; `statusData` carries a cheap in-memory run summary instead, because `renderStatus`
  runs inside every atomic mutation and `executionData` walks the handoffs tree. Stored
  `schema_version: 1` manifests still validate through the stored-attempt path — version 1 rejects
  `execution`, version 2 requires it.
- **Critical-path-aware ready ranking.** `nextData` computes `depth`, the longest remaining dependency
  chain a task unblocks, with a memoized traversal of the already-validated `blocks` reverse link, and
  ranks on it above immediate fan-out. A chain-heading task now outranks a task with more leaf
  dependents. Ordering is unchanged where depth ties.
- **Concurrency ceiling projection.** A new `concurrencyData` projection reports `critical_path`,
  `widest_level`, `serial_prefix`, and `concurrency_ceiling` for the remaining plan, surfaced in
  `statusData`. No scheduler can beat a plan's critical path, so this is what makes an unreachable
  parallelism target visible before a run rather than after it; `execute-rpd` now caps in-flight work
  at the smaller of runtime capacity and `widest_level`, and reports the ceiling so wall time is read
  against what the plan permitted.
- Estimation rules for task schedules in [plan.md](skills/project-manager/references/plan.md).
  `scheduled_start`/`scheduled_end` have always been free-form judgment — the engine derives no
  duration and checks only that the pair is well-formed and ordered — so the skill now states how that
  judgment is formed: fix the executor's throughput unit first (person-days, agent-hours, and CI
  minutes are not one ruler), estimate the cost of proving an outcome rather than producing it, carry
  uncertainty in the width of the span, leave explicit rework allowance, recalibrate against first
  actuals, and record estimation risk with magnitude and trigger. Assumptions behind a date belong in
  `ASSUMPTIONS.md` with `impact_if_false`, trigger conditions in the `RISKS.md` v2 `trigger` field, and
  estimation error after the fact in `LESSONS.md` under `estimation`. No schema or script behavior
  changes; the rules are LLM-facing guidance over the existing schedule fields.
- Dependency-density guidance in [plan.md](skills/project-manager/references/plan.md) and
  [review.md](skills/project-manager/references/review.md): declare a dependency only when the
  dependent cannot *start* without the other, prefer the specific contract-establishing edge over
  transitive restatements, and read a long `serial_prefix` as a signal that foundation work was split
  into stages that are not independently verifiable.
- A judgment-discipline section in [review.md](skills/project-manager/references/review.md) binding
  review, `validate-task`, impact analysis, and status narrative: confirm the checked-out revision
  before assessing, read the decision record before calling something a gap, re-read rather than
  asserting state from memory, separate "does not exist" from "cannot be reached", mark verified apart
  from inferred and name what could not be executed, and require evidence rather than artifacts for a
  completion claim.
- A waiting and escalation policy in
  [execute-rpd.md](skills/project-manager/references/execute-rpd.md), from analysis of four real run
  logs: request every permission during preflight, declare a human-gated wait once instead of polling
  it, use blocking waits rather than fixed sleeps, and run Delivery the moment the last task settles.
  The logs showed roughly eight hours of dead wall time across three runs — none of it worker, review,
  or integration time — including 162 minutes blocked on a sandbox escalation first requested 43
  minutes into the run.
- A rule in [SKILL.md](skills/project-manager/SKILL.md) forbidding hand-rolled state mutation, with the
  documented safe path for the cases where no command exists. A real run wrote its own
  milestone-completion script outside the skill's immutability guard, validation gate, and rollback,
  because no such command exists yet; that gap is now named rather than left implicit.
- Both READMEs list an undeclared executor behind a task date as something Project Manager pushes back
  on.
- The Studio brand header shows the release version, read from the same `src/version.ts` constant the
  MCP server and App host use, so `npm run release:version` keeps it in sync instead of leaving a
  hand-edited string to drift.

### Changed

- The `execute-rpd` scheduler is documented as a **work-conserving ready queue** rather than a
  barriered dependency-wave model: promote a task the moment its dependency settles, count only
  mutating workers against concurrency (read-only reviewers are budgeted separately, since RPD
  serializes each task's own gates), and dispatch a value-concentrating sink task with company rather
  than last and alone. Stale "wave" language that survived the change in `execute-rpd.md`, `SKILL.md`,
  and `track.md` is gone — Integration still said "in ascending task ID within a wave" for a scheduler
  with no waves — and two scheduler steps that stated one concurrency rule twice with different
  criteria were reconciled.
- Run-scoped branch and worktree naming in
  [execute-rpd.md](skills/project-manager/references/execute-rpd.md). Each run generates one fresh
  lowercase 8-hex run ID and never reuses a prior run's branches or worktrees, since a prior run may
  have deliberately left them behind under Delivery. Integration branch `pm/<project-id>-<run-id>`,
  task branch `pm/<project-id>-<run-id>-<task-id>`, worktree root
  `<workspace-root>/.worktrees/<run-id>` beside `.projects`, coordinator worktree
  `<worktree-root>/<repo-name>-integration` per repository, and task worktree `<worktree-root>/<task-id>`.
  The worktree root must lie outside every target repository's working tree; when the workspace root is
  itself inside one, that repository's worktrees go to `<git-common-dir>/pm-worktrees/<run-id>`. Task
  worktrees are removed as soon as they are clean, reachable, and evidenced; only the integration
  branch and coordinator worktree persist across the run. Isolation is stated as an inspection and
  retry property, not a concurrency device — a single-task sequential run still gets its own branch and
  worktree.
- Skill instructions are restructured as procedure plus rationale: numbered imperatives carry the
  steps and reasoning moved into marked "Why" blocks, because negation-dense prose that buries an
  imperative inside its justification is the form a small model most reliably misreads. Overlapping
  authority became tables in `SKILL.md` (Studio), `tasks.md` (row order vs. rescheduling vs.
  specification), and `init.md` (profiles). Across the instruction files, negations went 264 → 239 and
  list items 167 → 267. This is presentation only, and was proved so rather than asserted: every
  backtick code span and numeric literal was diffed against the previous revision across all ten
  instruction files, and the sole difference is `planned|ready` rendering as `planned` ↔ `ready` in a
  table column.
- A task whose specification requires changes in more than one repository is explicitly out of scope
  for the `execute-rpd` route; it is reported for splitting rather than split unilaterally. RPD's
  primary-agent review fallback is likewise unavailable on this route — when a reviewer cannot be
  started the task blocks instead of accepting a self-review.
- Workspace-root initialization now installs `studio.sh` and `studio.cmd` inside the workspace's
  `.projects` folder instead of the workspace root, so all Project Manager support files live in one
  place and the workspace root stays untouched. Each launcher resolves the projects root from its own
  location, reads the `.env.local` beside it, and still changes to the containing workspace before
  starting Studio, so catalog discovery and forwarded arguments are unchanged. Run
  `./.projects/studio.sh` on POSIX or `.projects\studio.cmd` on Windows. A workspace initialized by an
  earlier release is migrated on the next initialization: the same transaction removes a root
  `studio.sh` or `studio.cmd` whose bytes are exactly what a published release wrote, and reports the
  removals in `data.removed_retired_launchers`. Any other root file, directory, or symlink at those
  names is the operator's and is left untouched.

### Fixed

- Dependency density in `concurrencyData` counts an edge to a cancelled or deferred task as
  unsatisfied. Only a `done` dependency satisfies an edge; the previous count silently dropped edges
  whose target was not runnable, even though `blockerItems` reports the dependent as blocked.
- The bundled Studio server carried a pre-fix copy of that projection and was rebuilt from source.
- Studio SSE tests assert on framed events instead of raw socket chunks. A `read()` chunk can carry
  two events or half of one, and the watcher legitimately interleaves `project-stale`/`project-live`
  around the `project-change` a test waits for, which is what made the production-watcher test
  intermittently fail. The helper now pumps continuously, frames on the blank-line boundary, reports
  whole events by name, and settles adaptively rather than on a fixed sleep.

## [1.9.0] — 2026-08-16

### Added

- `TASKS.md` **schema version 4** manual task order. Timeline rows are reordered by dragging the left
  task-column grip or by keyboard, and the position is a persisted project fact written through one
  new `PUT /api/task-order` route, revision-guarded and queued like task edits. A task without an
  `order` takes a default generated from the derived arrangement, so an unordered project renders as
  before with no ordering mode; the client sends the whole sequence, so a drop under active filters
  leaves hidden rows in place. Order changes no specification: it is excluded from the specification
  hash and Task Contract, leaves `updated` alone, and stays available on done, cancelled, and
  evidence-backed tasks. Holding a drag at the top or bottom edge auto-scrolls the page, inset by the
  sticky headers, so a row can reach a target that was off screen when the drag began.
- The MCP App board renders lanes through a Kanban component with expandable per-task detail —
  outcome, owner, milestone, schedule, blockers, and acceptance items — plus an explicit loading
  state instead of a blank frame.

### Changed

- `execute-rpd` now closes out each repository instead of ending on a retained integration branch. It
  asks once whether to merge the integration branch into its base branch and remove the coordinator
  worktree, naming the branch, the worktree path, the merge result, and — when tasks blocked — that
  merging lands partial work. Stating delivery intent in the request skips the question. Merging
  requires a clean base checkout and a conflict-free merge; conflicts against the user's base branch
  are never auto-resolved, and the delivery decision is recorded in the final report so an unmerged
  branch is unambiguous. Conflicts between a task branch and the integration branch are still resolved
  automatically and re-reviewed as before.
- Board projection builds its id-to-task index once per call instead of once per lookup — 402
  constructions at 200 tasks became one — `validateGraph` replaces a quadratic scan with a
  reverse-dependency map, and the compact MCP summary no longer builds the projection it discarded.
- `TASKS.md` schema versions 1, 2, and 3 keep their exact normalized shapes, so installing v4 support
  cannot stale an untouched project's `STATUS.md`. Schema 4 is forward-only like v2 and v3 before it,
  and the version rises only when an operator actually reorders.

### Fixed

- Request-time project containment moved into `ProjectCatalog.register`, judged on the resolved real
  path so a symlinked ancestor no longer rejects a legitimate child, and decided on the parent before
  the leaf is touched so out-of-root paths cannot be probed for existence. Omitting the containment
  decision fails loudly instead of opening. Immutable-history ancestor checks compare path segments
  instead of string prefixes.
- A Studio watcher that cannot rebind after a project root is replaced now reports its stream
  degraded rather than going quietly dead, and the client clears that warning only on an explicit
  server-stated liveness edge. Timeline drag suppression can no longer swallow a click on an
  unrelated bar.
- `.gitattributes` rules match the real artifact paths, and the `.gitignore` `dist/` line that hid
  tracked Studio assets is gone.

## [1.8.0] — 2026-08-15

### Added

- Read-only MCP App: a stdio MCP server exposing validated project facts as tools, with an inline
  status card and a fullscreen board rendered inside supporting hosts. Model-facing tools return a
  compact summary while full project data stays in app-only tools; hosts without MCP App rendering
  receive the text result, and all project mutation remains with the agent, skill, and CLI scripts.
- MCP App project selection by the agent: model-facing tools accept a project folder path as well as
  a configured ID or name, and the server starts with no project arguments, so no absolute path has
  to be written into host configuration. A configured projects root remains available as opt-in
  confinement, and views receive only opaque project keys.
- Explicit `npm run release:version -- <semver>` and `npm run version:check` commands keep the
  Agent Plugin manifest, standalone skill header, MCP server, and embedded App on one release
  version. Invalid, repeated, or already-drifted bumps fail without rewriting release files.

### Changed

- Project Manager is now distributed as a root-native Agent Plugins 1.0 package for direct GitHub
  installation.
- GitHub installation documentation now separates the complete root plugin from Codex's standalone
  `skills/project-manager/` installation, which intentionally excludes MCP tools and views.
- `plugin.json` is now the canonical product release version. Plugin builds validate every
  release-bearing file before replacing generated artifacts, while the private npm workspace keeps
  its non-product `0.0.0` version.
- The MCP server and embedded App now report the shared Project Manager release version instead of
  separate hard-coded `1.0.0` values.

### Fixed

- The status card's **Open board** action now loads the actual lane-based board before requesting
  fullscreen. Previously it only enlarged the status card. The action is also compact and
  right-aligned instead of stretching across the card.

## [1.7.0] — 2026-08-15

### Added

- Workspace-root initialization now writes the active installed skill path to ignored
  `.projects/.env.local` and creates canonical `studio.sh` and `studio.cmd` launchers at the workspace
  root.
- `project-init-workspace.js` validates and installs the project plus launch support as one contained,
  rollback-safe transaction, generating `STATUS.md` from authoritative project files.

### Changed

- Repeated workspace initialization preserves unrelated local configuration and existing projects,
  while symlinked paths and operator-owned launcher conflicts fail before exposure.

## [1.6.0] — 2026-08-15

### Added

- Studio now watches the selected project and refreshes automatically after CLI, agent, or editor
  changes, while deferring reconciliation until task and schedule drafts are safe.

### Changed

- RPD-assigned work is now decomposed as cohesive end-to-end software stories suitable for one full
  RPD flow. Project plans and task-quality review reject stage, file, layer, test, review,
  documentation, and commit fragments that belong inside RPD's own architecture plan.

## [1.5.2] — 2026-08-13

### Fixed

- Studio now opens every safely identified project even when a task has invalid execution state. Affected tasks
  remain visible with task-scoped warnings, unrelated planning edits continue to work, and execution plus standard
  validation commands remain strict.
- Timeline bars preserve lifecycle colors without severity borders. Amber and red dots mark planning or execution
  issues, while task details explain the issue and distinguish dependency tasks, free-text blocker notes, and
  schedule conflicts.
- Task warnings no longer repeat as page-level banners. Technical diagnostics, including stale `STATUS.md` state,
  remain available through the API and validation output.

## [1.5.1] — 2026-08-13

### Fixed

- An unavailable executor root now produces a project-validation and Studio warning instead of blocking
  the project from opening. Executor-root structure still fails closed, and governed execution still
  requires the selected task root to be an existing real directory before issuing or advancing work.
- Cancelled tasks now use a distinct grey treatment in Kanban and Timeline instead of sharing the
  orange treatment reserved for deferred work and active warnings.

## [1.5.0] — 2026-08-12

### Added

- Built-in `project-start-agent.js` and `project-ingest-agent-manifest.js` commands for issuing immutable
  agent Task Contracts and ingesting exact Evidence Manifest payloads without generated project-local
  execution helpers.
- Governed agent orchestration: the main agent coordinates dependency-ready, capacity-bounded waves and
  delegates one clean/minimal-context bounded worker per task while retaining project-state mutation and
  evidence-ingestion ownership.

### Changed

- Agent workers now use an exact terminal-manifest return protocol with worker-only limits of 65,536
  serialized UTF-8 bytes and 8,192 UTF-8 bytes per JSON string. Direct CLI ingestion retains the
  existing Evidence Manifest schema boundary.
- Execution preflight now makes capacity and mutation isolation explicit: shared or uncertain roots and
  write surfaces serialize, null-root work is limited to read-only or explicit non-filesystem targets,
  and post-issuance spawn failures preserve a visible governed attempt.
- Human approval tasks act as explicit dependency gates without redefining all human work as
  approval-only. Human and RPD execution routes remain unchanged.
- Agent start, blocked retry, and verified completion now move the latest applicable `CHANGES.md`
  re-verification binding through `pending`, `in_progress`, and `complete` in the same atomic mutation.

## [1.4.0] — 2026-08-12

### Added

- `project execute-rpd <folder>`, a one-line governed execution route that schedules active RPD tasks
  in dependency-ready waves, gives each mutating worker its own Git worktree, reserves independent
  review capacity, integrates task branches in dependency order, and advances project state only from
  validated Evidence Manifests.

### Changed

- Project Manager now carries the worktree, subagent, review-invalidation, integration-verification,
  and stopping rules that previously had to be repeated in every execution prompt.
- RPD project execution now accepts natural-language requests in English and Chinese with a project
  name. A deterministic resolver selects one exact project from the validated workspace `.projects`
  catalog and rejects missing or ambiguous names instead of guessing.

## [1.3.0] — 2026-08-11

PMI alignment through documented tailoring.

### Added

- `PROJECT.md` **schema version 2**, adding a required declare-only `tailoring` block covering the ten
  PMBOK 6 knowledge areas. Each area is recorded as applied or tailored out, and tailoring an area out
  requires a rationale. Tailoring never obliges a project to practice an area and never enters the task
  specification hash or Task Contract.
- Optional modules `ASSUMPTIONS.md` (`ASM-`), `ISSUES.md` (`ISS-`), `STAKEHOLDERS.md` (`STK-`),
  `LESSONS.md` (`LES-`), and `CLOSURE.md` (`CLO-`), each fail-closed on its own exact schema once
  present. An issue log is distinct from task `blocked_by` strings, which remain the execution-level
  blocker mechanism.
- `RISKS.md` **schema version 2**, adding PMI response strategy, threat/opportunity direction, trigger,
  and residual risk. Strategies are constrained to the direction, so an opportunity cannot be
  "mitigated".
- Validation `TAILORING_CONTRADICTION`: configuring `RISKS.md` while risk is tailored out, or
  `STAKEHOLDERS.md` while stakeholder is tailored out, now fails. The declaration cannot become fiction.
- Closure integrity rules: accepted project closure requires project completion, accepted milestone
  closure requires that milestone complete, acceptance requires an acceptor, date, and evidence, and
  duplicate project- or milestone-scoped records are rejected.
- `npm run demo` materializes a persistent Studio demo at `demo/pm-studio-demo` for the current
  checkout.

### Changed

- Status and report data move to **schema version 3**, exposing the tailoring declaration and the five
  new modules. A tailored-out area is reported as tailored out with its recorded rationale, never as a
  zero or as "on track"; an undeclared area on a schema-version-1 project is reported as undeclared.
- README and both user guides describe PMI alignment as PMBOK 7 principles-aligned with documented
  tailoring, explicitly not PMI certification.
- The Studio demo is generated rather than committed. Task Contracts bind an absolute canonical project
  root and `contract_id` hashes that payload, so no committed demo can be valid across clones. The
  previously committed demo had been broken since the repository moved paths.
- RPD is no longer presented as a dependency in user-facing positioning. It remains a fully supported
  optional executor provider with no code change.

### Compatibility

- `PROJECT.md` schema version 1 is unchanged, rejects `tailoring` as an unknown field, and needs no
  migration.
- `RISKS.md` schema version 1 rejects the new fields and keeps its exact normalized shape.
- A project configuring none of the new modules produces a byte-identical `source_sha256`, so no
  existing `STATUS.md` becomes stale.
- Cost, Earned Value, `TASKS.md` effort estimates, typed dependencies, float, and critical path remain
  unimplemented by design. Declare them tailored out, or record where they are managed instead.

## [1.2.0] — 2026-08-11

### Changed

- Rewrote onboarding to be user-centered: manage through outcomes, events, constraints, evidence, and
  decisions rather than field edits, status changes, or card movements.
- Positioned Project Manager as an AI project manager you brief through conversation.

### Added

- Studio persists Summary and Filters expanded/collapsed state independently in guarded browser
  storage, with Filters as an accessible native-hidden disclosure.

## [1.1.1] — 2026-08-10

### Added

- Studio exposes a copyable RPD command for every task, preferring an issued contract when one exists.
- Kanban lane titles and counts stay visible as one sticky row, pinned below the application header,
  with synchronized horizontal scrolling between lane titles and bodies.
- Timeline allocates a readable weekly width and scrolls horizontally instead of compressing labels,
  with a frozen Task column and a separate sticky date header.

## [1.1.0] — 2026-08-09

### Added

- Rigor profiles. `minimal` and `standard` complete eligible ordinary human work from one explicit
  approval while still creating the canonical immutable Task Contract and verified Evidence Manifest.
  `controlled` human work, and every RPD, agent, and external task, stay on the governed execution path.
- `TASKS.md` **schema version 3** task dispositions. `deferred` pauses actionability and may reactivate;
  `cancelled` is terminal. Neither satisfies a dependency or proves success, and evidence observed after
  the disposition timestamp cannot advance the task.

### Changed

- Split Project Manager into a standalone repository.

## [1.0.1] — 2026-08-09

### Fixed

- Correctness and consistency fixes across the skill contract and deterministic scripts.

## [1.0.0] — 2026-08-08

Initial release of the folder-native project manager.

### Added

- Generic Markdown project state: `PROJECT.md` and `TASKS.md` as truth, `STATUS.md` as a derived cache,
  with optional `MILESTONES.md`, `RISKS.md`, `DECISIONS.md`, `SOURCES.md`, `TRACEABILITY.md`, and
  `CHANGES.md` modules.
- Task Contract to Evidence Manifest execution boundary with immutable attempts, canonical hashing,
  staged evidence requirements, acceptance mappings, and replay-fingerprint rejection.
- Lifecycle `planned → ready → in_progress → implemented → verification → verified → done`, with
  blocking separate from lifecycle and change-driven re-verification.
- Human, RPD, agent, and external executor providers with per-provider default evidence requirements.
- Six read-only deterministic scripts for validation, status, next work, blockers, coverage, and report
  data, with a locked exit-code and envelope contract.
- Project Manager Studio: one loopback-authenticated local server with URL-addressable Kanban and
  Timeline sibling views over the same validated snapshot.
- `TASKS.md` **schema version 2** schedule metadata with paired inclusive dates, canonical clearing,
  legacy v1 source-hash compatibility, and no impact on contract or specification hashes.
- Studio project selection defaulting to `<launch-working-directory>/.projects`, with server-issued
  opaque keys binding reads and saves to one catalog entry, and no client-supplied filesystem paths.

[1.12.1]: https://github.com/yysun/project-manager/releases/tag/v1.12.1
[1.12.0]: https://github.com/yysun/project-manager/releases/tag/v1.12.0
[1.11.0]: https://github.com/yysun/project-manager/releases/tag/v1.11.0
[1.10.0]: https://github.com/yysun/project-manager/releases/tag/v1.10.0
[1.9.0]: https://github.com/yysun/project-manager/releases/tag/v1.9.0
[1.8.0]: https://github.com/yysun/project-manager/releases/tag/v1.8.0
[1.7.0]: https://github.com/yysun/project-manager/releases/tag/v1.7.0
[1.6.0]: https://github.com/yysun/project-manager/releases/tag/v1.6.0
[1.5.2]: https://github.com/yysun/project-manager/releases/tag/v1.5.2
[1.5.1]: https://github.com/yysun/project-manager/releases/tag/v1.5.1
[1.5.0]: https://github.com/yysun/project-manager/releases/tag/v1.5.0
[1.4.0]: https://github.com/yysun/project-manager/releases/tag/v1.4.0
[1.3.0]: https://github.com/yysun/project-manager/releases/tag/v1.3.0
[1.2.0]: https://github.com/yysun/project-manager/releases/tag/v1.2.0
[1.1.1]: https://github.com/yysun/project-manager/releases/tag/v1.1.1
[1.1.0]: https://github.com/yysun/project-manager/releases/tag/v1.1.0
[1.0.1]: https://github.com/yysun/project-manager/releases/tag/v1.0.1
[1.0.0]: https://github.com/yysun/project-manager/releases/tag/v1.0.0
