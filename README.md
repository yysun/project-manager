# Project Manager

**Users manage the project, not the project-management tool.**

**Tell Project Manager what happened, what you want, or what you're worried about—you don't need to
translate project management into field updates and card movements.**

Project Manager lets people work in project terms: outcomes, constraints, risks, priorities, and
decisions. Say “the vendor is late,” “we cannot move the launch date,” or “what is blocking us?”
instead of translating the situation into boards, fields, statuses, dependency settings, and
timeline edits.

**One user intent can become many coordinated, validated project actions.**

This is more than replacing clicks with chat. Project Manager interprets a high-level change, finds
the affected work, updates the connected project state, checks it for consistency, and reports the
impact. Traditional interfaces are mostly **one action → one change**. Project Manager supports
**one intent → reasoning → many changes**.

The product model is deliberately simple:

- **Natural language** is intent.
- **Project Manager** is reasoning and action.
- **Project state** is truth.
- **Kanban and Timeline** are visualization.
- **Humans, RPD, and other agents** are execution.

Project Manager stores that truth in a durable, versionable folder that Codex can plan, coordinate,
track, review, and report. Project Manager Studio adds Kanban and Timeline views without becoming a
second source of truth.

## One instruction, coordinated project changes

> “The client rejected the design. They want a new version by Friday.”

Project Manager inspects the current design work and its dependents, determines whether the rejection
creates a blocker, revision, risk, or scope change, updates the supported project facts, and reports
the schedule and decision impact. It does not pretend the design was completed or invent missing
dates, ownership, or evidence.

> “The vendor API is delayed until September 15. Keep the launch date.”

Project Manager records the constraint, finds dependent tasks, analyzes the schedule, reschedules
eligible work, surfaces new risks or scope pressure, validates the resulting state, and reports what
changed and what still needs a decision.

> “Alice is unavailable next week. Do not move the milestone.”

Project Manager finds Alice's scheduled and owned work, identifies dependency and capacity effects,
moves work that can safely move, flags work that needs reassignment, updates the risk picture, and
checks whether the milestone remains credible.

> “We need to cut scope. Preserve the onboarding launch.”

Project Manager traces work to the required outcome, identifies lower-priority scope, updates task
dispositions and dependencies, rechecks success coverage, records the decision and its risks, and
summarizes the delivery impact.

## User guides

### [English user guide →](skills/project-manager/README.md)

Installation, project setup, planning, task tracking, Studio, and reporting.

### [中文使用指南 →](skills/project-manager/README-cn.md)

安装、项目初始化、规划、任务跟踪、Studio 与报告。

## Studio

Kanban keeps planned, ready, active, completed, deferred, and cancelled work visible in one operating
view.

![Project Manager Studio Kanban view](docs/images/project-manager-studio-kanban.jpg)

Timeline exposes schedule sequencing, dependencies, blockers, and date conflicts without replacing
the folder-native project state.

![Project Manager Studio Timeline view](docs/images/project-manager-studio-timeline.jpg)

## Install

```bash
npx skills add yysun/project-manager --skill project-manager
```

The installable skill lives in `skills/project-manager/`. Its complete user guide, runtime scripts,
schemas, and operating rules live with the skill.

## Development

```bash
npm install
npm test
npm run pm-studio:dev -- /absolute/path/to/project
```

The Studio source is in `src/project-manager-studio/`; builds are written into the installable skill.
The repository also includes an isolated example project under `demo/pm-studio-demo/`.

## Technical documentation

- [Skill contract](skills/project-manager/SKILL.md)
- [Project conventions](skills/project-manager/references/conventions.md)
