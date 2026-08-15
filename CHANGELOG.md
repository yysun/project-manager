# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers are
the `project-manager` skill version recorded in
[`skills/project-manager/SKILL.md`](skills/project-manager/SKILL.md). Studio and repository tooling
ship alongside the skill and are noted under the release they landed in.

State-file schema versions are independent of the skill version and are called out per release. A
project written by an older release keeps loading unchanged; no release has required a migration.

## [Unreleased]

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
