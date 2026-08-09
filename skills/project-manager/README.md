# Project Manager Skill — End-User Guide

Project Manager turns a folder into a durable project workspace that Codex can plan, coordinate,
track, review, and report. Project facts live in Markdown files you can inspect and version. The
skill also includes Project Manager Studio, with Kanban and Timeline views over the same project.

## Quick start

Invoke the skill as `$project-manager`, or use the natural-language project routes below.

```text
project init /absolute/path/.projects/website-launch "Launch the new website safely"
project plan /absolute/path/.projects/website-launch
project studio /absolute/path/.projects/website-launch
```

A project is the selected folder, not the surrounding repository. Use an explicit absolute path
when possible. If you ask for the workspace default, projects are created under `.projects/`.

## Everyday commands

| Goal | What to ask Codex |
| --- | --- |
| Create a project | `project init <folder> <objective>` |
| Break the outcome into work | `project plan <folder>` |
| Record a change, blocker, or evidence | `project update <folder> <change-or-evidence>` |
| See current facts | `project status <folder>` |
| Find the best executable work | `project next <folder>` |
| Challenge the plan and evidence | `project review <folder>` |
| Review one task's quality | `project validate-task <folder> <task-id>` |
| Create an audience report | `project report <folder> <operator\|project-manager\|executive\|board>` |
| Open Kanban and Timeline | `project studio [folder]` |

Natural language is fine. For example:

```text
Use $project-manager to show what is blocked in /work/.projects/launch.
Use $project-manager to record that legal approved TASK-CONTRACTS.
Use $project-manager to prepare an executive report for /work/.projects/launch.
```

## Project Manager Studio

Run Studio for one isolated project:

```text
project studio /absolute/path/to/project
```

Run Studio without a folder from a workspace containing `.projects/` to select among its valid
direct-child projects:

```text
project studio
```

Studio opens a token-protected local page. Kanban and Timeline share the same project snapshot,
filters, task details, validation, and save boundary.

### Kanban

- Use Kanban to see lifecycle flow: Planned, Ready, Active, Verified, and Done.
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

## Project files

Every project starts with three files:

- `PROJECT.md` — project identity, objective, success criteria, owner, status, and project dates.
- `TASKS.md` — task definitions, lifecycle state, dependencies, blockers, and optional schedules.
- `STATUS.md` — derived cache regenerated from authoritative state; do not edit it as project truth.

Optional files add milestones, risks, decisions, sources, traceability, changes, reports, and
immutable execution attempts only when the project needs them.

## Task schedules

A scheduled task stores an inclusive date range in `TASKS.md` schema v2:

```json
{"outcome":"Launch assets are ready.","acceptance":["Marketing approves every asset."],"scheduled_start":"2026-09-08","scheduled_end":"2026-09-12"}
```

Both schedule fields must be present or both absent, and the start cannot be later than the end.
The first saved schedule upgrades only `TASKS.md` from schema v1 to v2. Clearing all task schedules
does not silently downgrade the file.

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
