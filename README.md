# Project Manager

Project Manager turns a folder into a durable project workspace that Codex can plan, coordinate,
track, review, and report. Project facts stay in versionable Markdown, while Project Manager Studio
adds Kanban and Timeline views over the same source of truth.

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
