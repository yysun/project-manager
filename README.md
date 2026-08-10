# Project Manager

Project Manager turns a folder into a durable project workspace that Codex can plan, coordinate,
track, review, and report. Project facts stay in versionable Markdown, while Project Manager Studio
adds Kanban and Timeline views over the same source of truth.

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

## Documentation

- [End-user guide](skills/project-manager/README.md)
- [Skill contract](skills/project-manager/SKILL.md)
- [Project conventions](skills/project-manager/references/conventions.md)
