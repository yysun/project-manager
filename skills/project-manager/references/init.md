# Initialize a Project

Require an explicit target folder and objective or source. A project is the folder, not its repository.
When the user requests workspace-default placement without naming a path, use
`<workspace>/.projects/<safe-project-slug>`; never default to `<workspace>/projects`.

Create only `PROJECT.md`, `TASKS.md`, and `STATUS.md`. Derive a safe stable project ID, state an objective, write at least one measurable success criterion, and start with no tasks unless decomposition is already supported. Include `human` in adapters; add other providers only when requested and usable.

Choose `minimal` for ordinary lightweight work, `standard` when delegated executors or regular reporting
are expected, and `controlled` when even human work requires explicit pre-issued contracts and staged
evidence. Minimal and standard share the safe one-step human completion path; delegated executors remain
governed in every profile.

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

Project Manager Studio does not require that index. Its default catalog is the valid direct-child
projects under `<launch-working-directory>/.projects`.
