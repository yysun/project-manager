# Initialize a Project

Require an explicit target folder and objective or source. A project is the folder, not its repository.

Create only `PROJECT.md`, `TASKS.md`, and `STATUS.md`. Derive a safe stable project ID, state an objective, write at least one measurable success criterion, and start with no tasks unless decomposition is already supported. Include `human` in adapters; add other providers only when requested and usable.

Accept a nonexistent target or an existing directory proven empty. Prepare and validate a same-filesystem candidate, then rename it into place atomically. Refuse a non-empty target. Never initialize sibling folders or add Git files.

`PROJECT.md` uses JSON-valued frontmatter and Markdown sections:

```markdown
---
schema_version: 1
id: "OFFICE-MOVE"
name: "Office Move"
status: "planning"
owner: null
start_date: null
target_date: null
current_milestone: null
profile: "minimal"
adapters: ["human"]
created: "2026-08-08"
updated: "2026-08-08"
---

## Objective

Move the team without interrupting customer operations.

## Success Criteria

- [SC-OPERATIONS] No customer-facing outage during the move.
```

`TASKS.md` begins with frontmatter `schema_version: 1`. `STATUS.md` is a derived cache, never the source of task truth.

An optional workspace-level `PROJECTS.md` is only a discovery index. It is never loaded by ordinary project commands and never changes project identity.
