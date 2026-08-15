# Project Environment Launchers

## Problem

Project initialization creates durable project state but leaves each workspace without a stable way to find the installed Project Manager skill or launch Studio. Operators must reconstruct an installation-specific Node command, and copying that absolute path into a tracked launcher would make the workspace machine-specific.

## Requirement

When Project Manager initializes a project from a selected workspace root, it must also establish a workspace-local Studio launch contract: keep the absolute installed skill path in ignored local configuration under `.projects`, and provide shell and Windows command launchers at the workspace root that load that configuration before starting Studio for the workspace catalog.

## Acceptance Criteria

- [x] Workspace-root initialization writes `.projects/.env.local` with `PROJECT_MANAGER_SKILL_PATH` set to the absolute directory of the active Project Manager skill.
- [x] `.projects/.gitignore` ignores `.env.local` without requiring the workspace to be a Git repository or discarding unrelated existing ignore rules.
- [x] Workspace-root initialization creates `studio.sh` and `studio.cmd` at the workspace root, and both launchers read `PROJECT_MANAGER_SKILL_PATH` from `.projects/.env.local` instead of embedding an installation path.
- [x] Both launchers are platform-native entry points that start `scripts/project-manager-studio.js` from the configured skill, preserve caller-supplied Studio arguments and exit status, and resolve `.projects` relative to the launcher workspace; POSIX behavior is runtime-tested on POSIX and Windows behavior is runtime-tested whenever verification runs on Windows.
- [x] The initialization contract defines clear failures for missing or invalid local configuration and does not silently overwrite unrelated existing launcher files.
- [x] Workspace initialization refuses symlinked or escaping managed paths, revalidates targets immediately before synchronous replacement and before rollback removal, and restores every pre-existing byte, mode, empty-directory state, and absent-path state if a write fails; if exact rollback is unsafe or itself fails, initialization hard-fails, preserves external changes, and retains a named recovery root instead of claiming restoration.
- [x] If project installation commits but backup/work-root cleanup fails, the CLI returns `COMMITTED_CLEANUP_FAILED`, identifies the valid live project, reports `data.committed` as true with a retained recovery path, and directs callers to clean recovery state without retrying initialization.
- [x] Explicit initialization of a standalone target project folder preserves the existing three-file project contract and does not create workspace launch support without a selected workspace root.
- [x] User-facing English and Chinese guidance explains the generated launchers and the local, ignored skill-path configuration.

## Constraints

- Keep `PROJECT.md`, `TASKS.md`, and `STATUS.md` as the only files inside each initialized project folder.
- Do not make Git a prerequisite for project initialization.
- Workspace-root initialization must use the installable skill's deterministic initialization command rather than asking an agent to coordinate the multi-path transaction ad hoc.
- Keep `.env.local` usable by both POSIX shell and Windows command launchers, including installation paths containing spaces.
- Repeated initialization in the same workspace must preserve unrelated `.env.local` keys and `.gitignore` rules.
- Treat a missing, empty, relative, duplicated, or non-Studio `PROJECT_MANAGER_SKILL_PATH` as invalid; an inherited process variable must not substitute for workspace-local configuration.
- Workspace initialization is an exclusive local mutation. It detects changes visible at each immediate revalidation boundary but does not claim race-free behavior against an uncooperative process that mutates a path between a successful check and the following synchronous rename.

## Non-Goals

- Adding a general environment-file parser or dependency.
- Installing, locating, or upgrading the Project Manager skill automatically.
- Adding PowerShell, desktop shortcut, service, or package-manager launchers.
- Changing Studio's server, catalog, authentication, or browser behavior.
