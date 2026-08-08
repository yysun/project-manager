# Studio Project Selection

## Problem

Project Manager Studio is bound to one project folder at process startup. Operators managing several folder-native projects must stop and relaunch Studio to move between them, and there is no implemented default projects container despite the workflow needing one predictable place for project discovery.

## Requirement

Project Manager Studio must let the operator select among valid projects available to the running Studio instance. When no explicit project or projects root is supplied, Studio must use `.projects` under the launch working directory as its default projects root. Explicit project selection must remain available for projects outside that default container.

## Acceptance Criteria

- [x] Starting Studio without `--project` or `--projects-root` uses `<launch-working-directory>/.projects` as the projects root and opens when that directory contains at least one valid direct-child project.
- [x] Studio presents the available valid projects and switching the selected project refreshes Kanban, Timeline, filters, dialogs, and mutations to use only the newly selected project.
- [x] Project discovery and selection cannot escape the configured projects root through absolute paths, nested traversal, symlinks, stale client input, or arbitrary filesystem paths.
- [x] Project selection is isolated per browser tab/request so a stale refresh, dialog, Timeline action, or second tab cannot read, render, or mutate a different project after a selection change.
- [x] Duplicate project identities and an empty, missing, or invalid projects root fail clearly instead of silently selecting an ambiguous or unrelated folder.
- [x] `--project <folder>` remains supported as an explicit single-project launch and does not expose unrelated sibling folders unless a projects root is also explicitly configured.
- [x] Project Manager documentation names `.projects` as the default projects root and documents explicit project and projects-root Studio launch modes.

## Constraints

- Preserve the tokenized loopback session boundary and existing task edit validation, revision checks, atomic writes, and selected-project root replacement protections.
- Bind every project read and mutation to a server-issued selection identity. The server rejects missing, unknown, path-stale, symlinked, or project-ID-drifted keys before state is changed; the client rejects late responses whose returned key or request generation no longer matches the tab's current selection.
- Discover only direct-child real directories; do not search repositories, parents, or arbitrary descendants.
- Do not require or make `PROJECTS.md` authoritative for Studio discovery.
- Do not add environment variables, feature flags, fallback to `projects`, or compatibility scanning of multiple default roots.
- Treat Studio as a same-user local tool. Validate paths and revisions at request/mutation boundaries, but do not claim protection from a malicious process owned by the same OS user racing filesystem replacement between system calls.

## Non-Goals

- Creating, deleting, renaming, or moving projects from Studio.
- Editing the `PROJECTS.md` discovery index.
- Persisting the last selected project across Studio processes or browser sessions.
- Selecting arbitrary folders through a browser filesystem picker.
- Defending the project files from a concurrent malicious local filesystem actor with the same user permissions as Studio.
