---
name: project-manager
description: Plan, coordinate, execute, track, review, and report product-delivery work as folder-native .projects state. Use to manage outcomes, tasks, dependencies, blockers, evidence, executors, impact, and stakeholder reporting; do not use for QA suite, case, or run management under .tests.
---

# Project Manager

**Version:** `1.11.0`
**Repository:** https://github.com/yysun/project-manager
**Source:** https://github.com/yysun/project-manager/tree/main/skills/project-manager

Manage the selected project through `plan → coordinate → execute → track → report`.

Treat a project as a first-class folder containing structured Markdown state. Never infer that a repository is the project. For a new project, require an explicitly selected workspace root or target project folder; workspace-default placement derives `<root>/.projects/<safe-project-slug>`. For an existing project, use an explicit project folder when the user or calling context supplies one. If no project is selected, discover valid project folders only below the calling context's selected workspace root: select the sole valid project directly without asking, ask for selection when more than one is valid, and ask for a folder when none is valid. Studio and `execute-rpd` may also resolve one exact name, ID, or folder from a validated projects root; ambiguity is not selection. Multiple project folders may live in one repository or workspace; read and write only the selected one. The default workspace container is `.projects`, never `projects`.

Project Manager uses unique marker-bound `.project-manager-work-<24-hex>` siblings for same-filesystem atomic work and crash recovery. They are internal recovery roots, not projects; valid explicitly selected projects are never rejected merely for a similar basename.

## Operating boundary

- Project Manager owns project state, decomposition, dependency coordination, prioritization, blockers, evidence ingestion, impact analysis, and reporting.
- Project Manager owns `.projects` delivery coordination, not QA case design, test execution, Run history, or `.tests` state. Quality evidence may inform a project task without making project state authoritative for testing.
- Executors own task work. Governed execution and lightweight human completion both persist through the same Task Contract → Evidence Manifest boundary.
- RPD is optional and owns `understand → implement → test → correct → verify` for a software task. Do not reproduce RPD inside this skill.
- Git, source code, issue trackers, and storage providers are optional context. Never make them authoritative project state.

## Interpret project-management intent

Natural language about the project is the interface. Users should describe outcomes, events,
constraints, evidence, risks, decisions, tradeoffs, and questions. Never require them to translate
reality into field edits, status changes, card movements, or one route from a command menu.

Infer and coordinate the necessary internal operations. One user intent may affect several connected
parts of the project and may require more than one route. The ten routes below are internal operating
intents and explicit escape hatches, not the product interaction model:

1. `project init <folder> <objective-or-source>` — create the minimal three-file project atomically. Read [init.md](references/init.md).
2. `project plan <folder>` — clarify success, decompose outcomes, and establish dependencies. Read [plan.md](references/plan.md).
3. `project update <folder> <change-or-evidence>` — add/update a task, change disposition, issue a Task Contract, complete eligible human work, or ingest evidence. Read [track.md](references/track.md); for task structure also read [tasks.md](references/tasks.md).
4. `project status <folder>` — show the MCP App status view when the user asks to show, display, or open status; otherwise calculate current facts with `project-status.js`.
5. `project next <folder>` — rank executable work with `project-next.js`.
6. `project report <folder> <operator|project-manager|executive|board>` — calculate report facts, then write the audience narrative. Read [report.md](references/report.md).
7. `project review <folder>` — validate state, challenge plan quality, blockers, risks, evidence, and success coverage. Read [review.md](references/review.md).
8. `project validate-task <folder> <task-id>` — validate the folder, then use LLM judgment to review task quality. Read [tasks.md](references/tasks.md).
9. `project execute-rpd <folder|project-name>` — execute every eligible RPD task from a dependency-ready queue using isolated Git worktrees and subagents, then ingest verified evidence. Natural-language equivalents in English and Chinese are preferred. Read [execute-rpd.md](references/execute-rpd.md).
10. `project studio [folder]` — launch local Project Manager Studio with Kanban and Timeline views;
   an explicit folder is isolated, while no folder uses selectable direct children of `.projects`.

For source or scope changes, read [impact.md](references/impact.md). For exact schemas, lifecycle rules, and output contracts, read [conventions.md](references/conventions.md).

## Render plugin views

When the Project Manager MCP tools are available, treat display intent as an explicit UI request:

- For “show status”, “display status”, “open status”, or an equivalent request, call `pm_project_status` once. Its tool metadata attaches the status card. Do not substitute `project-status.js` or call both routes.
- For “show the board”, “open the board”, or an equivalent request, call `pm_open_board` once. Its tool metadata attaches the full board. Do not substitute Studio or a board-audience report.
- Use the deterministic status scripts for fact-only analysis, reports, reviews, and any workflow that needs their JSON. If the required MCP tool is unavailable or fails, fall back to the scripts and say that the interactive view was unavailable.

## Load state safely

1. Resolve an explicit folder with `realpath`. For an `execute-rpd` project name, run `project-resolve.js` against the calling context's validated `.projects` root and use its returned absolute root.
2. When no project folder or selector was supplied, resolve the calling context's selected workspace root with `realpath` and search only its descendants for directories containing `PROJECT.md`, `TASKS.md`, and `STATUS.md`. Do not search upward, inspect siblings outside that root, follow symlinked directories, or treat the workspace or repository itself as a project unless it contains those three files. Prune a subtree only when its directory name exactly matches `.project-manager-work-<24-lowercase-hex>` and it contains a real regular `.rpd-project-manager-work-v1` file whose exact contents are `RPD Project Manager work area v1\n`; this proves it is an internal recovery root. A similar name without that exact marker is not enough to hide a legitimate project or candidate error.
3. Reject symlinked or escaping known state paths. Validate every discovered candidate with `node <absolute-skill-dir>/scripts/project-validate.js <candidate> --json`. A candidate is valid only when that command succeeds.
4. If discovery yields exactly one valid project, select its real path and continue without asking. If it yields more than one, present the valid candidates and ask the user to select one. If it yields none, ask for the project folder and report any candidate validation failures that explain why discovery found no valid project.
5. After selection, read and write only that project. Resolve this skill's absolute directory and run `node <absolute-skill-dir>/scripts/project-validate.js <folder> --json` before relying on state.
6. Treat `PROJECT.md` and `TASKS.md` as truth. Treat `STATUS.md` as a derived cache.
7. Add optional modules only when they answer a real operating need.

The minimal project folder contains only:

- `PROJECT.md`
- `TASKS.md`
- `STATUS.md`

Optional modules are `MILESTONES.md`, `RISKS.md`, `DECISIONS.md`, `SOURCES.md`, `TRACEABILITY.md`, `CHANGES.md`, `ASSUMPTIONS.md`, `ISSUES.md`, `STAKEHOLDERS.md`, `LESSONS.md`, `CLOSURE.md`, `handoffs/`, and `reports/history/`.

Workspace-root initialization also installs workspace support outside the project folder: ignored
`.projects/.env.local` records this active skill's `~/...` path when it is inside the current home and
its absolute path otherwise; canonical `.projects/studio.sh` plus `.projects/studio.cmd` launch Studio
for that workspace. Always use `project-init-workspace.js` for that
multi-path transaction; read [init.md](references/init.md). Standalone target-folder initialization
retains the three-file-only contract and creates no workspace support.

## Tailor to PMI

`PROJECT.md` schema version 2 requires a `tailoring` block declaring each of the ten PMBOK 6 knowledge
areas applied or tailored out, with a rationale required for every area tailored out. Version 1 keeps
its exact field set, rejects `tailoring`, and needs no migration.

Tailoring is declare-only. It never obliges a project to practice an area, never requires module
content, and never enters the task specification hash or Task Contract. Its purpose is to make an
omission a recorded decision, which is what PMI tailoring actually requires.

- Never fabricate a rationale, and never add a tailoring block the user did not decide.
- Report a tailored-out area as tailored out with its rationale; never as zero, absent, or on track.
- Configuring `RISKS.md` while risk is tailored out, or `STAKEHOLDERS.md` while stakeholder is tailored
  out, is a validation failure. The declaration cannot become fiction.
- Cost, Earned Value, and critical-path scheduling are not implemented. Tailor them out, or record that
  they are managed outside this project.

## Plan

- Make the outcome and project success criteria explicit before expanding structure.
- Keep a small task compact: title, outcome, and acceptance criteria are usually enough; defaults supply the rest.
- Decompose work assigned to `rpd` into cohesive, end-to-end software stories that one RPD flow can
  take from requirement through verified commit. State observable behavior and boundaries; do not
  create separate project tasks for RPD stages, files, implementation layers, tests, reviews, docs,
  or commits. RPD's AP owns that internal decomposition. Read [plan.md](references/plan.md).
- Write task schedules as recorded judgment, never as engine output. Fix the executor's throughput unit
  before estimating, size the cost of proving the outcome rather than producing it, carry uncertainty in
  the span, and keep assumptions and estimation risk explicit.
- Treat “add this task” as `project update`; do not add another route.
- Use stable project-owned IDs. External tracker IDs are display-only mappings.
- Resolve dependencies within the selected project only.
- Distinguish explicit blocker descriptions from unfinished dependency task IDs.
- Promote optional modules monotonically. Do not rename project or task IDs when structure grows.

## Coordinate

Choose an enabled executor per task. A task needs active disposition before you issue a contract or
ingest a manifest.

Starting governed work means issuing **one immutable Task Contract** bound to the selected project,
the current task specification, the current sources, and the provider's evidence requirements.
Contract issuance alone authorizes `ready → in_progress`.

Executor success comes from validated evidence. A closed issue, a commit, a file's presence, and
confident prose are not evidence.

### Agent tasks: the coordinator role

The main agent is the **coordinator**, not the task worker. It owns project validation, capacity and
isolation preflight, contract issuance, scheduling, returned-payload checks, manifest ingestion, and
final reporting.

For each dependency-ready `agent` task:

1. Before issuing a contract, prove a subagent can be spawned, retain the coordinator's own capacity
   slot, and confirm a safe execution target. With no available slot the task waits, and the project
   is not mutated.
2. Start or explicitly retry only through the installed built-in command. Generating
   `.pm-agent-exec.js`, or any other project-local or executor-local execution helper, is out of
   bounds.
3. Spawn one bounded worker with clean or minimal context. Pass only: the readable absolute Task
   Contract path, the resolved executor root when present, a task-local instruction to satisfy that
   contract, and the exact return protocol. When clean or minimal-context spawning is available, the
   coordinator's accumulated conversation stays out of the worker.
4. Require exactly one concise canonical Evidence Manifest payload JSON object in return, with
   terminal status `verified` or `blocked`.
5. Let the worker create executor artifacts, and keep `PROJECT.md`, `TASKS.md`, `STATUS.md`,
   `CHANGES.md`, and `handoffs/` out of its reach. The coordinator alone validates and ingests the
   returned payload.

**Worker return limits.** At most 65,536 UTF-8 bytes serialized, and at most 8,192 UTF-8 bytes per
JSON string. Reject prose, transcripts, malformed JSON, non-object JSON, nonterminal status, and
over-limit output. These are worker-protocol limits; they do not narrow direct use of the
manifest-ingestion CLI.

### Agent tasks: what may run in parallel

Run dependency- and mutation-independent agent tasks in capacity-bounded parallel. Distinct
dependency chains alone are not sufficient — prove all three of these are non-overlapping:

- resolved executor roots;
- artifact paths;
- external write surfaces.

Serialize on shared roots, shared targets, or uncertain mutation surfaces.

A null executor root carries **no local write authority**. It permits filesystem-read-only work, or
an explicitly identified non-filesystem artifact or write target. When local mutation is required or
the target is uncertain, stop before contract issuance until a safe project-scoped or absolute root
is assigned.

### Agent tasks: failure after issuance

- A concrete spawn failure becomes an exact blocked manifest naming that runtime blocker.
- A failure you cannot classify truthfully leaves the attempt visibly `in_progress`. Ingest nothing
  and stop that task.
- Redispatch the same immutable contract only after the runtime proves the earlier worker is
  terminated **and** project validation proves no manifest was ingested. Otherwise require explicit
  operator resolution. A concurrent second worker for one attempt is never correct.

### Human tasks are gates

Human tasks remain human-owned.

- A human task whose explicit outcome is approval is a dependency gate: dependent `agent` and `rpd`
  tasks stay `planned` until specific approval evidence makes that task `done` under the project
  profile.
- Human completion does not automatically promote dependents. Revalidate all blockers and
  dependencies, then use an ordinary coordination update to move each eligible dependent
  `planned → ready` before its execution route starts.
- Not every human task is approval-only. Human-authored or custom-evidence work follows its
  applicable human execution policy and remains a gate until evidence-backed done.

### Built-in agent state commands

```bash
node <absolute-skill-dir>/scripts/project-start-agent.js <project-folder> <task-id> [--created-at <RFC3339-UTC>] [--retry-blocker <exact-blocker>|--retry-blocker=<exact-blocker>] --json
node <absolute-skill-dir>/scripts/project-ingest-agent-manifest.js <project-folder> <task-id> --json
```

- Supply exactly one Evidence Manifest payload JSON object to ingest on standard input, followed only
  by whitespace.
- Start returns the immutable contract ID and absolute contract path.
- Ingest persists only the next gap-free manifest, and advances only the lifecycle that validated
  evidence supports.
- Read [track.md](references/track.md) for the complete eligibility and failure rules.

### RPD tasks

1. Confirm the task selects provider `rpd` and an existing absolute execution root.
2. Create an attempt-qualified story and immutable Task Contract.
3. Present RPD with the readable absolute contract path and exact deterministic prompt.
4. Let RPD own its complete workflow.
5. Snapshot exact-story RPD artifacts into the project attempt before manifest ingestion.

For dependency-aware multi-task RPD execution, read [execute-rpd.md](references/execute-rpd.md) and
use its scheduling, worktree, integration, delivery, and review-capacity and stopping rules.

Keep the one-line user command a one-line command rather than a confirmation ceremony. The single
closing delivery question is not a ceremony: ask it once when the request did not already state
delivery intent, and obtain that intent before merging into a base branch or removing a coordinator
worktree.

## Track

Only a validated Evidence Manifest may advance governed work to `implemented`, `verification`, `verified`, or `done`. Validate its contract ID, task specification hash, source bindings, sequence, transition, typed evidence, acceptance mappings, and replay fingerprint.

Profiles select human rigor, not separate lifecycle engines:

- `minimal` and `standard`: a never-started active human task may be completed in one update when one specific approval satisfies its evidence requirements, every dependency is done, no blocker exists, and every bound source is verifiable. Use `project-complete-human.js`; it atomically creates the existing contract/verified-manifest audit trail and marks the task done.
- `controlled`: human work must use governed start and evidence progression.
- Every `agent`, `external`, and `rpd` task uses governed execution in every profile.

Lifecycle: `planned → ready → in_progress → implemented → verification → verified → done`.

Ordinary presentation projects this as `Planned → Ready → Active → Done`. Keep internal stages available in audit detail.

- Blocking is separate from lifecycle.
- `done` requires a current verified manifest, completed dependencies, and no blockers.
- If dependencies clear after verification, revalidate the stored verified manifest and advance without inventing a new one.
- Preserve immutable attempts. A blocked retry creates a new contract.
- On source or task-spec change, regress stale active state and preserve history.
- When the latest `CHANGES.md` record requires re-verification, start moves that task's binding from
  `pending` to `in_progress` with the new contract; retry rebinds it to the strictly later retry
  contract; only a verified manifest that supports `done` moves it to `complete`. Intermediate,
  blocked, or verified-but-not-done ingestion leaves the binding `in_progress`.
- Disposition is orthogonal: `deferred` pauses actionability and may reactivate; `cancelled` is terminal. Neither satisfies dependencies or success. Evidence observed after deferral/cancellation cannot advance lifecycle.

## Report

Calculate facts before writing narrative:

Resolve the absolute directory containing this `SKILL.md` once, then invoke scripts from that directory. Do not resolve `scripts/` relative to the caller's project or current working directory.

```bash
node <absolute-skill-dir>/scripts/project-status.js <project-folder> --json
node <absolute-skill-dir>/scripts/project-next.js <project-folder> --json
node <absolute-skill-dir>/scripts/project-blocked.js <project-folder> --json
node <absolute-skill-dir>/scripts/project-coverage.js <project-folder> --json
node <absolute-skill-dir>/scripts/project-report-data.js <project-folder> --json
```

Change emphasis by audience, never facts. Keep absent schedule, forecast, or coverage evidence explicitly `unknown` or `unconfigured`.

## Validate task quality

`project validate-task` is semantic LLM review, not the deterministic project validator. Load and
validate the explicit folder first, then judge the named task using the checklist and output contract
in [tasks.md](references/tasks.md). Do not mutate the task unless the user separately asks to apply
revisions.

## Studio

Studio is one local operating surface with sibling Kanban and Timeline views.

**Studio never edits** actual execution dates, task IDs, evidence, attempts, or re-verification
state.

**What it may edit**, each under its own authority:

| Edit | Allowed for | Changes contract identity? |
|---|---|---|
| Specification, and `planned` ↔ `ready` | Genuinely never-started tasks only | — |
| Timeline schedule (`scheduled_start`/`scheduled_end`) | Eligible non-completed work, including active evidence-backed tasks | No |
| Disposition — active ↔ deferred, or to terminal cancelled | Eligible unfinished work | No |
| Timeline row order | Any task, including done, cancelled, and evidence-backed work; refused only on a complete project | No |

**Row order** is a persisted task property. Every task has an `order` number, defaulting to the
derived date arrangement and overridable by dragging a row. It is display metadata only. Resetting
clears the stored numbers and restores generated defaults.

**Two buttons worth distinguishing:** “Check changes” is deterministic whole-project validation.
“Copy LLM review command” only copies the semantic route above — it calls no model.

Resolve this skill's absolute directory. With no selector, Studio discovers valid direct-child projects
under `.projects` in the launch working directory and lets the operator switch between them:

```bash
node <absolute-skill-dir>/scripts/project-manager-studio.js
```

Use an explicit project for isolated single-project mode, an explicit root for a selectable catalog,
or both to choose the initial direct-child project:

```bash
node <absolute-skill-dir>/scripts/project-manager-studio.js --project <folder>
node <absolute-skill-dir>/scripts/project-manager-studio.js --projects-root <folder>
node <absolute-skill-dir>/scripts/project-manager-studio.js --projects-root <folder> --project <direct-child-folder>
```

After workspace-root initialization, operators can use the generated launcher instead. It reads the
machine-local skill path from the ignored `.projects/.env.local` beside it, anchors discovery to the
workspace that contains that projects root, and forwards any Studio arguments:

```bash
./.projects/studio.sh
```

```bash
.projects\studio.cmd
```

The command prints a tokenized loopback URL. Report it to the user. Use `--no-open` only for automated
verification; `--port` accepts an explicit local port. Catalog discovery is non-recursive, rejects
symlinked or invalid project children and duplicate project IDs, and never falls back to `projects`.
Marker-bound `.project-manager-work-<24-hex>` recovery roots are excluded from discovery; similarly
named valid projects remain selectable. Never substitute the current repository for a project merely
because it is the current directory; explicit selection or the single-valid-project rule must resolve it.

## Never hand-roll a state mutation

Project state changes go through exactly two routes: the built-in commands, and Studio. Writing a
bespoke script that edits `PROJECT.md`, `TASKS.md`, `STATUS.md`, `CHANGES.md`, or `handoffs/` is out
of bounds even when it claims to be atomic — a hand-rolled mutation reimplements the candidate copy,
the immutability guard, the validation gate, and the rollback, and it will get one of them wrong.

**Where no command exists** — completing a milestone is the current example — edit the single
Markdown record directly, then run `project-validate.js` and regenerate `STATUS.md`. One small edit
that fails validation loudly is safer than a script that silently half-applies a change.

Observed in a real run: a coordinator with no milestone-completion command wrote its own
`complete-milestone.js` to clear `current_milestone` "atomically", outside every guarantee this skill
provides.

## Mutate atomically

Most deterministic scripts are read-only. `project-init-workspace.js` is the dedicated mutating
exception for workspace-root initialization; do not reproduce its multi-path transaction manually.
For other skill-led changes:

1. Validate live state.
2. Build the full change in a same-filesystem candidate copy.
3. Regenerate `STATUS.md` from the candidate's authoritative state, then validate the candidate privately with no stale-status warning.
4. Replace only intended project paths atomically.
5. Validate live state again.
6. Restore exact prior bytes and remove new paths if any step fails.

Initialization accepts only a nonexistent folder or a directory proven empty immediately before apply. Refuse non-empty targets.

## Quality bar

- Make project status evidence-backed, not optimistic.
- Separate facts, unknowns, judgments, and recommendations.
- Verify before asserting: the intended revision, the decision record behind an apparent gap, and the
  difference between absent and unreachable. Read [review.md](references/review.md).
- Challenge missing ownership, circular dependencies, stale sources, unsupported completion, and fake forecasts.
- Keep generic projects free of software ceremony.
- Keep software execution out of Project Manager; coordinate it through the contract boundary.
