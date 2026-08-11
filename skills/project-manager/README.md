# Project Manager Skill — End-User Guide

**Users manage the project, not the project-management tool.** Work in terms of outcomes,
constraints, risks, priorities, and decisions instead of boards, fields, statuses, and dependency
settings.

**One user intent can become many coordinated, validated project actions.** Project Manager can
interpret a change, find affected work, update connected project state, validate the result, and
report the impact. Natural language is intent; Project Manager is reasoning and action; Markdown
project state is truth; Kanban and Timeline are visualization; humans, RPD, and other agents are
execution.

Project Manager keeps the resulting truth in a durable, versionable folder that Codex can plan,
coordinate, track, review, and report. Project Manager Studio provides Kanban and Timeline views
without becoming a second source of truth.

## Quick start

Tell Codex what outcome you want and where the project workspace should live. Ordinary language is
the interface; you do not need to learn commands or run scripts. Mention `$project-manager` when you
want to select the skill explicitly.

```text
Use $project-manager to create a project at /work/.projects/website-launch for safely launching the new website.
Plan the work needed to deliver this project.
Open Project Manager Studio for it.
```

A project is the selected folder, not the surrounding repository. Select that folder when starting
or switching projects; after that, Codex keeps it as the current project for the conversation. If you
ask for the workspace default, new projects are created under `.projects/`.

## Manage the project conversationally

**Tell Project Manager what happened, what you want, or what you're worried about—you don't need to
translate project management into field updates and card movements.**

You do not need to decide whether a change belongs in a task, dependency, schedule, risk, decision,
or report. Describe the situation and the intended outcome. Project Manager inspects the selected
project, works out which connected facts and plans are affected, applies the safe changes, validates
the result, and explains the consequences.

| Management intent | Example |
| --- | --- |
| Rejected outcome | `The client rejected the design. They want a new version by Friday.` |
| Scope change | `Offline mode is no longer part of MVP1. Move it to MVP2 and adjust dependent work.` |
| Diagnosis | `Why are we not ready to start implementation?` |
| Prioritization | `We only have two developers this week. What should they focus on?` |
| Impact analysis | `If TASK-API slips by ten days, what happens to the launch?` |
| Risk reasoning | `What are the three biggest threats to the target date?` |
| Gap detection | `What have we forgotten in this plan?` |
| Progress synthesis | `What changed since last week?` |
| Exception management | `Which tasks need my attention today?` |
| Decision capture | `We chose Vendor B because Vendor A cannot meet the security requirement. Record the decision and update affected work.` |
| Replanning | `Legal approval will not arrive until Friday. Replan around it without moving the launch date if possible.` |
| Human coordination | `John is away next week. Move anything only he can do and show me the consequences.` |
| Executive reporting | `Give me a 30-second CEO update: progress, problems, and decisions needed.` |
| What-if analysis | `What could we cut if we had to launch two weeks earlier?` |
| Visual follow-up | `Update the plan, then open the timeline so I can inspect it.` |

Project Manager does not blindly convert every sentence into mutations. It preserves immutable
execution history, requires evidence for lifecycle progress, keeps unsupported dates and forecasts
unknown, and surfaces a decision when the requested outcome cannot be achieved safely from the
available facts.

## Common conversations

### A result was rejected

> `The client rejected the design. They want a new version by Friday.`

Project Manager inspects the design task, its acceptance criteria, current evidence, dependencies,
and schedule. It determines whether the new information means a blocker, failed acceptance, new
revision work, changed scope, or a combination of these. It then updates what the project facts
support and reports the delivery impact. It does not falsely mark the original work complete or ask
you to name the fields that need changing.

### A constraint changed but the outcome did not

> `Legal approval will not arrive until Friday. Keep the launch date.`

Project Manager records the constraint, traces the work that depends on approval, reschedules
eligible tasks, and tests whether the launch plan still holds. If it does not, it makes the conflict
explicit and identifies the smallest decisions—scope, staffing, sequencing, or date—that could
resolve it.

### Capacity dropped

> `We only have two developers this week. What should they focus on?`

Project Manager ranks work using readiness, dependencies, priority, blockers, and success coverage.
It recommends a defensible focus and shows what will wait. If the project does not contain enough
ownership, effort, or availability information to make a credible allocation, it says so rather
than inventing a capacity plan.

## What Project Manager can reason about

- **Consequences:** which tasks, milestones, dependencies, schedules, risks, and success criteria a
  change may affect.
- **Readiness and priority:** what is executable now, what is blocked, and which work best advances
  the project outcome.
- **Plan quality:** missing work, circular or incomplete dependencies, weak acceptance criteria,
  unsupported completion, and uncovered success criteria.
- **Options and tradeoffs:** what can move, defer, cancel, reassign, or escalate when a constraint
  changes.
- **Attention and communication:** exceptions requiring intervention and concise updates for
  operators, project managers, executives, or boards.

Reasoning is bounded by the project's evidence. Project Manager separates facts, unknowns,
judgments, and recommendations; it does not turn an assumption into project truth merely because a
plan would look cleaner.

## What you can ask

| Goal | What to ask Codex |
| --- | --- |
| Create a project | `Create a project for safely launching the new website. Use the default workspace.` |
| Select an existing project | `Work with the website-launch project at /work/.projects/website-launch.` |
| Break the outcome into work | `Plan the work needed to deliver this project.` |
| Add or revise work | `Add a task for confirming the launch vendor.` |
| Record a decision, blocker, or evidence | `Record that legal approved TASK-CONTRACTS.` |
| See current facts | `Show me the current project status.` |
| Find the best executable work | `What should we work on next?` |
| Challenge the plan and evidence | `Review this project for gaps, weak evidence, and hidden risks.` |
| Review one task's quality | `Check whether TASK-CONTRACTS is well defined.` |
| Create an audience report | `Prepare an executive update for this project.` |
| Open Kanban and Timeline | `Open Project Manager Studio for this project.` |

The folder is project context, not a parameter you must repeat. Codex asks for it only when no project
has been selected or when the reference could match more than one project.

## Project Manager Studio

Ask Codex to open Studio for one isolated project:

```text
Open Project Manager Studio for /absolute/path/to/project.
```

From a workspace containing `.projects/`, ask to choose among its valid direct-child projects:

```text
Open Project Manager Studio and let me choose a project from this workspace.
```

Studio opens a token-protected local page. Kanban and Timeline share the same project snapshot,
filters, task details, validation, and save boundary.

### Kanban

- Use Kanban to see ordinary flow: Planned, Ready, Active, and Done, with Deferred and Cancelled side states.
- Search or filter by priority, owner, and blockers.
- Open a task to inspect its outcome, acceptance criteria, dependencies, blockers, evidence state,
  and schedule.
- Only genuinely never-started tasks can change specification fields or switch between `planned`
  and `ready`.

### Timeline setup

Timeline requires project start and target dates to anchor the complete project range. In
`PROJECT.md`, set both values as date-only strings:

```yaml
start_date: "2026-09-01"
target_date: "2026-11-30"
```

`target_date` is the project's planned end date. Missing task dates remain explicitly unscheduled;
the skill does not invent dates from task status, dependencies, creation time, or evidence.

### Timeline usage

- Weekly columns and the sticky task column provide a spreadsheet-style planning view.
- Blue schedule blocks represent planned or active work, orange highlights verified or blocked
  work, and green identifies completed work. Status text remains visible in the task column.
- Drag a schedule block to move its full date range.
- Drag the left or right handle to resize the start or end.
- Use Left Arrow or Right Arrow on a focused block or handle for one-day keyboard adjustments.
- Dragging and keyboard changes create a draft only. Select **Save schedule** to persist it, or
  **Cancel** to discard it.
- Open an unscheduled task and enter both scheduled start and scheduled end dates. Clear both dates
  together to return it to the unscheduled state.
- Dependency-date conflicts are warnings. They do not silently change the schedule or the task's
  lifecycle blockers.

Schedules are planning metadata, not actual execution dates, progress, effort, forecasts, or
completion evidence.

## Editing and lifecycle rules

Project Manager deliberately separates planning authority from execution evidence:

- Never-started tasks may edit planning fields and use `planned` or `ready` status.
- Eligible unfinished tasks may be rescheduled even after execution has started.
- Eligible unfinished tasks may be deferred/reactivated or terminally cancelled independently from specification and schedule edits.
- Completed tasks, tasks in completed milestones, and tasks in completed projects cannot be
  rescheduled in Studio.
- Studio never edits task IDs, actual execution dates, contracts, manifests, evidence, attempts, or
  re-verification state.
- **Check changes** validates the complete candidate project without saving.
- **Save** rechecks project and task revisions, validates the complete candidate, and then applies
  the change atomically.

Task lifecycle is evidence-backed:

```text
planned → ready → in_progress → implemented → verification → verified → done
```

Starting work requires a Task Contract. Later lifecycle progress requires validated Evidence
Manifests. A commit, closed ticket, or confident status message is not completion evidence by
itself.

Studio normally projects `in_progress`, `implemented`, `verification`, and `verified` as **Active**.
The detailed lifecycle, contract, and manifest remain visible in task inspection.

### Rigor profiles

- `minimal` and `standard`: eligible never-started human tasks may be completed in one natural-language
  update using a specific approval. Project Manager still writes the normal immutable contract and
  verified manifest atomically.
- `controlled`: human work must be started and advanced through governed evidence stages.
- Agent, external, and RPD tasks are governed in every profile.

The lightweight path rejects blockers, incomplete dependencies, existing attempts, deferred/cancelled
work, custom evidence one approval cannot prove, and unverifiable bound sources.

### Deferred and cancelled work

Disposition is separate from lifecycle. Deferred work is paused and may be reactivated. Cancellation is
terminal. Neither state is next work; cancellation does not satisfy dependencies or prove success.

## Project files

Every project starts with three files:

- `PROJECT.md` — project identity, objective, success criteria, owner, status, and project dates.
- `TASKS.md` — task definitions, lifecycle state, dependencies, blockers, and optional schedules.
- `STATUS.md` — derived cache regenerated from authoritative state; do not edit it as project truth.

Optional files add milestones, risks, decisions, sources, traceability, changes, reports, and
immutable execution attempts only when the project needs them.

## Task schedules

A scheduled task stores an inclusive date range in `TASKS.md` schema v2 or v3:

```json
{"outcome":"Launch assets are ready.","acceptance":["Marketing approves every asset."],"scheduled_start":"2026-09-08","scheduled_end":"2026-09-12"}
```

Both schedule fields must be present or both absent, and the start cannot be later than the end.
The first saved schedule upgrades only `TASKS.md` from schema v1 to v2. Clearing all task schedules
does not silently downgrade the file.

The first disposition change upgrades TASKS to schema v3 while preserving schedules. Schema v3 stores
only non-active dispositions with their RFC3339 change timestamp.

## Common problems

### Timeline has no useful project range

Set both `start_date` and `target_date` in `PROJECT.md`, then validate or refresh the project.

### A task cannot be edited

The task may already have execution history, belong to a completed milestone, be completed itself,
or belong to a completed project. Inspect the read-only reason in the task dialog.

### A task cannot become Ready

Ready tasks must have no explicit blockers and every dependency must already be Done.

### Studio says the project changed

Another process changed the project after Studio loaded it. Refresh, review the latest facts, and
apply the edit again rather than overwriting concurrent work.

### `STATUS.md` is stale

Treat `PROJECT.md` and `TASKS.md` as truth. Ask Project Manager to validate or update the project so
the derived status cache is regenerated safely.

## Safety model

- Project Manager reads and writes only the selected project folder.
- Studio binds only to loopback and requires its generated access token.
- Candidate changes receive full-project validation before atomic replacement.
- Existing contracts, evidence, reports, and attempt history remain immutable.
- Unknown dates, forecasts, ownership, or coverage stay visible as unknown rather than being
  inferred.

For exact file schemas and integration details, see `SKILL.md` and the `references/` directory.
