# Initialize a Project

Require an objective or source plus either an explicit target project folder or an explicitly
selected workspace root. A project is the resulting project folder, not its repository. When the
workspace root is selected and the user does not name a project path, derive a safe slug and use
`<workspace>/.projects/<safe-project-slug>`; never default to `<workspace>/projects`.

Create only `PROJECT.md`, `TASKS.md`, and `STATUS.md`. Derive a safe stable project ID, state an objective, write at least one measurable success criterion, and start with no tasks unless decomposition is already supported. Include `human` in adapters; add other providers only when requested and usable.

Choose `minimal` for ordinary lightweight work, `standard` when delegated executors or regular reporting
are expected, and `controlled` when even human work requires explicit pre-issued contracts and staged
evidence. Minimal and standard share the safe one-step human completion path; delegated executors remain
governed in every profile.

Choose the project schema version next. Version 1 is the ordinary default and stays exactly as it is.
Choose version 2 when the project must show PMI-aligned tailoring; it requires a `tailoring` block
declaring all ten PMBOK 6 knowledge areas as applied or tailored out. Ask the user which areas genuinely
apply rather than guessing, and record a real reason for each area tailored out — the rationale is the
part that makes the omission a decision instead of an oversight. Never fabricate a rationale, and never
add a tailoring block to a version 1 project.

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

A schema version 2 project adds one required frontmatter key:

```markdown
tailoring: {"integration":{"applied":true,"rationale":null,"decided":"2026-08-11"},"cost":{"applied":false,"rationale":"No project budget; effort absorbed by the standing team.","decided":"2026-08-11"}}
```

All ten areas must appear on that one line as complete single-line JSON. Every remaining v1 field keeps
its exact meaning.

`TASKS.md` begins with frontmatter `schema_version: 1`. `STATUS.md` is a derived cache, never the source of task truth.

An optional workspace-level `PROJECTS.md` is only a discovery index. It is never loaded by ordinary project commands and never changes project identity.

Project Manager Studio does not require that index. Its default catalog is the valid direct-child
projects under `<launch-working-directory>/.projects`.
