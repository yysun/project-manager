# Project Manager

**An AI project manager you work with through conversation.**

Brief Project Manager as you would a human colleague: explain the outcome, constraints, authority,
and what is changing in the real world. It takes responsibility for the working plan—decomposing the
outcome, coordinating dependencies and owners, maintaining schedules and risks, tracking evidence,
and following changes through.

You set direction and make the business decisions that require your authority. Project Manager
manages the project. You do not have to convert reality into card movements, field edits, statuses,
dependencies, or reports.

![Four-panel overview of working with Project Manager as an AI project manager](skills/project-manager/assets/project-manager-ai-employee-en.jpg)

> “The vendor API will not be available until September 15. The launch date cannot move. Show me the
> credible options.”

Project Manager traces the affected work, tests the plan against the constraint, updates what the
facts support, and brings back the real tradeoff. One conversation can change tasks, dependencies,
schedules, risks, decisions, evidence, and reporting together.

```text
project reality → reasoning → coordinated change
```

## What you get

- An AI project manager that builds and maintains a verifiable plan tied to your outcome and success
  criteria.
- A current view of progress: what changed, what can move, what is blocked, what threatens the
  outcome, and which decision is needed.
- Connected updates across tasks, dependencies, schedules, risks, and decisions when reality changes.
- Completion backed by evidence, with missing information called out instead of invented.
- Status reports shaped for operators, project managers, executives, or boards without changing the
  underlying facts.
- One coherent project record even when work is split across people, agents, external executors, and
  [RPD](https://github.com/yysun/rpd).

Project truth stays in a durable, versionable Markdown folder and is validated before changes are
saved. Kanban and Timeline visualize that state; they do not become a second source of truth.

## User guides

- [English user guide](skills/project-manager/README.md) — manage through outcomes, events,
  constraints, evidence, and decisions.
- [中文使用指南](skills/project-manager/README-cn.md) — 通过目标、事件、约束、证据和决策管理项目。

## Studio

Kanban shows planned, ready, active, completed, deferred, and cancelled work.

![Project Manager Studio Kanban view](docs/images/project-manager-studio-kanban.jpg)

Timeline shows schedules, dependencies, blockers, and date conflicts.

![Project Manager Studio Timeline view](docs/images/project-manager-studio-timeline.jpg)

## Install

In your AI agent app, ask:

> Install the `project-manager` skill from `yysun/project-manager`.

## Development

```bash
npm ci
npm test
npm run pm-studio:dev
```

The development server uses a disposable demo project by default. To open a specific project:

```bash
npm run pm-studio:dev -- --project /absolute/path/to/project
```

The installable skill is in `skills/project-manager/`, Studio source is in
`src/project-manager-studio/`, and an example project is in `demo/pm-studio-demo/`.

## Technical documentation

- [Skill contract](skills/project-manager/SKILL.md)
- [Project conventions](skills/project-manager/references/conventions.md)
