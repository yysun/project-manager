---
name: project-manager
description: Plan, coordinate, execute, track, review, and report folder-native projects. Use when Codex needs to initialize or manage a project folder, decompose outcomes into tasks, select next work, track blockers or evidence, coordinate human/agent/external/RPD executors, execute dependency-ready RPD tasks with subagents and Git worktrees from English or Chinese natural-language requests, assess change impact, or create operator, project-manager, executive, or board status reports. Generic Markdown project state is the core; Git, source code, trackers, and RPD are optional integrations.
---

# Project Manager

**Version:** `1.4.0`
**Repository:** https://github.com/yysun/project-manager
**Source:** https://github.com/yysun/project-manager/tree/main/skills/project-manager

Manage the selected project through `plan → coordinate → execute → track → report`.

Treat a project as a first-class folder containing structured Markdown state. Never infer that a repository is the project. For a new project, require an explicitly selected workspace root or target project folder; workspace-default placement derives `<root>/.projects/<safe-project-slug>`. For an existing project, require the user or calling context to select the project folder explicitly. Studio and `execute-rpd` may resolve one exact name, ID, or folder from a validated projects root; ambiguity is not selection. Multiple project folders may live in one repository or workspace; read and write only the selected one. The default workspace container is `.projects`, never `projects`.

Project Manager uses unique marker-bound `.project-manager-work-<24-hex>` siblings for same-filesystem atomic work and crash recovery. They are internal recovery roots, not projects; valid explicitly selected projects are never rejected merely for a similar basename.

## Operating boundary

- Project Manager owns project state, decomposition, dependency coordination, prioritization, blockers, evidence ingestion, impact analysis, and reporting.
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
4. `project status <folder>` — calculate current facts with `project-status.js`.
5. `project next <folder>` — rank executable work with `project-next.js`.
6. `project report <folder> <operator|project-manager|executive|board>` — calculate report facts, then write the audience narrative. Read [report.md](references/report.md).
7. `project review <folder>` — validate state, challenge plan quality, blockers, risks, evidence, and success coverage. Read [review.md](references/review.md).
8. `project validate-task <folder> <task-id>` — validate the folder, then use LLM judgment to review task quality. Read [tasks.md](references/tasks.md).
9. `project execute-rpd <folder|project-name>` — execute every eligible RPD task in dependency-ready waves using isolated Git worktrees and subagents, then ingest verified evidence. Natural-language equivalents in English and Chinese are preferred. Read [execute-rpd.md](references/execute-rpd.md).
10. `project studio [folder]` — launch local Project Manager Studio with Kanban and Timeline views;
   an explicit folder is isolated, while no folder uses selectable direct children of `.projects`.

For source or scope changes, read [impact.md](references/impact.md). For exact schemas, lifecycle rules, and output contracts, read [conventions.md](references/conventions.md).

## Load state safely

1. Resolve an explicit folder with `realpath`. For an `execute-rpd` project name, run `project-resolve.js` against the calling context's validated `.projects` root and use its returned absolute root.
2. Do not search upward for Git or inspect siblings.
3. Reject symlinked or escaping known state paths.
4. Resolve this skill's absolute directory and run `node <absolute-skill-dir>/scripts/project-validate.js <folder> --json` before relying on state.
5. Treat `PROJECT.md` and `TASKS.md` as truth. Treat `STATUS.md` as a derived cache.
6. Add optional modules only when they answer a real operating need.

The minimal project contains only:

- `PROJECT.md`
- `TASKS.md`
- `STATUS.md`

Optional modules are `MILESTONES.md`, `RISKS.md`, `DECISIONS.md`, `SOURCES.md`, `TRACEABILITY.md`, `CHANGES.md`, `ASSUMPTIONS.md`, `ISSUES.md`, `STAKEHOLDERS.md`, `LESSONS.md`, `CLOSURE.md`, `handoffs/`, and `reports/history/`.

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
- Treat “add this task” as `project update`; do not add another route.
- Use stable project-owned IDs. External tracker IDs are display-only mappings.
- Resolve dependencies within the selected project only.
- Distinguish explicit blocker descriptions from unfinished dependency task IDs.
- Promote optional modules monotonically. Do not rename project or task IDs when structure grows.

## Coordinate

Choose an enabled executor per task. Require active disposition before issuing a contract or ingesting a manifest. Starting governed work means issuing one immutable Task Contract bound to the selected project, current task specification, current sources, and provider evidence requirements. Contract issuance alone authorizes `ready → in_progress`.

For RPD:

1. Confirm the task selects provider `rpd` and an existing absolute execution root.
2. Create an attempt-qualified story and immutable Task Contract.
3. Present RPD with the readable absolute contract path and exact deterministic prompt.
4. Let RPD own its complete workflow.
5. Snapshot exact-story RPD artifacts into the project attempt before manifest ingestion.

For dependency-aware multi-task RPD execution, read [execute-rpd.md](references/execute-rpd.md) and
use its scheduling, worktree, integration, review-capacity, and stopping rules. Do not expand the
one-line user command into a confirmation ceremony.

Never infer executor success from a closed issue, commit, file presence, or confident prose.

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

Studio is one local operating surface with sibling Kanban and Timeline views. Specification and
`planned|ready` status edits remain limited to genuinely never-started tasks. Timeline schedules use
explicit `scheduled_start`/`scheduled_end` planning metadata and may be edited for eligible
non-completed work, including active evidence-backed tasks, without changing Task Contract identity.
Studio does not edit actual execution dates, task IDs, evidence, attempts, or re-verification state.
Disposition has separate authority: eligible unfinished work may move between active/deferred or to
terminal cancelled without changing Task Contract identity.
“Check changes” is deterministic whole-project validation; “Copy LLM review command” only copies the
semantic route above and does not call a model.

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

The command prints a tokenized loopback URL. Report it to the user. Use `--no-open` only for automated
verification; `--port` accepts an explicit local port. Catalog discovery is non-recursive, rejects
symlinked or invalid project children and duplicate project IDs, and never falls back to `projects`.
Marker-bound `.project-manager-work-<24-hex>` recovery roots are excluded from discovery; similarly
named valid projects remain selectable. Never substitute the current repository for an explicit project folder.

## Mutate atomically

Deterministic scripts are read-only. For skill-led changes:

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
- Challenge missing ownership, circular dependencies, stale sources, unsupported completion, and fake forecasts.
- Keep generic projects free of software ceremony.
- Keep software execution out of Project Manager; coordinate it through the contract boundary.
