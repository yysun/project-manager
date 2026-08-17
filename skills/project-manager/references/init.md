# Initialize a Project

Require an objective or source plus either an explicit target project folder or an explicitly
selected workspace root. A project is the resulting project folder, not its repository. When the
workspace root is selected and the user does not name a project path, derive a safe slug and use
`<workspace>/.projects/<safe-project-slug>`; never default to `<workspace>/projects`.

Inside the initialized project folder, create only `PROJECT.md`, `TASKS.md`, and `STATUS.md`. Derive a safe stable project ID, state an objective, write at least one measurable success criterion, and start with no tasks unless decomposition is already supported. Include `human` in adapters; add other providers only when requested and usable.

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

Accept a nonexistent target or an existing directory proven empty. Refuse a non-empty target.

## Workspace-root initialization

When a workspace root is selected, do not write the project or workspace support paths manually.
Resolve the absolute directory containing this `SKILL.md`, render authoritative `PROJECT.md` and
`TASKS.md` in memory, and pass exactly one JSON object to the built-in transaction:

```bash
node <absolute-skill-dir>/scripts/project-init-workspace.js <absolute-real-workspace-root> <safe-project-slug> --json
```

Standard input must contain exactly:

```json
{"project_md":"<complete PROJECT.md>","tasks_md":"<complete TASKS.md>"}
```

The command generates `STATUS.md` itself, validates the private candidate with its logical final root,
and atomically establishes this workspace layout:

```text
<workspace>/
└── .projects/
    ├── .env.local
    ├── .gitignore
    ├── studio.sh
    ├── studio.cmd
    └── <safe-project-slug>/
        ├── PROJECT.md
        ├── TASKS.md
        └── STATUS.md
```

`.projects/.env.local` contains exactly one managed entry:

```dotenv
PROJECT_MANAGER_SKILL_PATH=<absolute-skill-dir>
```

The file may contain unrelated local settings. Initialization preserves those lines, replaces or adds
only the single managed entry, and rejects duplicate managed entries. `.projects/.gitignore` preserves
unrelated rules and contains the exact `/.env.local` rule. Git is not required; the local ignore file
only prevents accidental tracking when the workspace is inside a repository.

The projects-root launchers are exact copies of `assets/studio.sh` and `assets/studio.cmd`. They clear
inherited `PROJECT_MANAGER_SKILL_PATH`, parse rather than execute the `.env.local` beside them, require
exactly one non-empty absolute value and an existing configured `scripts/project-manager-studio.js`,
change to the workspace that contains the projects root, forward every caller argument, and return
Studio's exit status. The shell launcher is mode `0755`. Operators launch Studio with
`./.projects/studio.sh` on POSIX or `.projects\studio.cmd` on Windows.

Earlier releases installed the launchers at the workspace root. Initialization retires those copies in
the same transaction: it removes a root `studio.sh` or `studio.cmd` only when it is a regular file whose
bytes are exactly what a published release wrote, and reports every removal in
`data.removed_retired_launchers`. Any other root file, directory, or symlink at those names belongs to
the operator and is left untouched rather than refused.

Preflight the complete write set before exposure. Refuse a symlinked, escaping, special-file, or
non-empty project target. Reuse only byte-identical launchers; repair mode drift on the canonical shell
launcher, but refuse to overwrite different `.projects/studio.sh` or `.projects/studio.cmd` content. The built-in command
revalidates each target before replacement, rolls its own changes back in reverse order on failure, and
revalidates its installed candidate before removing anything during rollback. A changed exposed target
is preserved with the original backup in the recovery root. Otherwise rollback restores prior bytes,
modes, empty directories, and absent paths. If exact rollback is unsafe or itself fails, stop and report
the preserved recovery root. Never claim that initialization succeeded in that state. Treat the command
as an exclusive local workspace mutation; it does not promise protection from an uncooperative process
that changes a pathname inside the unavoidable interval between a successful check and synchronous rename.
If project installation commits but backup/work-root cleanup fails, the command reports
`COMMITTED_CLEANUP_FAILED`, the committed project root, and the retained recovery path instead of
silently leaving local configuration copies behind. Treat `data.committed: true` as committed work
that requires recovery cleanup: report and preserve `data.recovery_path`, and never rerun initialization
for that project.

Repeated workspace initialization uses the same command and may add another direct-child project while
preserving existing projects and unrelated local configuration.

## Standalone target-folder initialization

When the user explicitly selects a standalone target project folder rather than a workspace root,
prepare and validate a same-filesystem candidate, regenerate `STATUS.md`, then rename it into place
atomically under the ordinary mutation rules. Create only the three project files. Do not create
`.projects/.env.local`, `.projects/.gitignore`, `.projects/studio.sh`, or `.projects/studio.cmd` beside a
standalone target.
Never initialize sibling project folders or add unrelated Git files.

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
