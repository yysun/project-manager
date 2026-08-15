# Project Environment Launchers E2E Specification

## Scenario: Initialize a workspace and launch Studio on POSIX

- Given a selected real workspace whose path contains spaces, an active Project Manager skill whose absolute path contains spaces, and no conflicting managed paths
- When Project Manager initializes a project from that workspace root and the operator runs `./studio.sh --no-open --port 43123`
- Then the project contains only `PROJECT.md`, `TASKS.md`, and `STATUS.md`
- And `.projects/.env.local` contains exactly one active `PROJECT_MANAGER_SKILL_PATH` pointing to the active skill
- And `.projects/.gitignore` contains `/.env.local`
- And Studio is invoked from the workspace root with `--no-open --port 43123`
- And the launcher returns Studio's exit status

## Scenario: Launch Studio on Windows

- Given a selected Windows workspace whose path contains spaces and a valid `.projects/.env.local` containing one absolute `PROJECT_MANAGER_SKILL_PATH`
- When the operator runs `studio.cmd --no-open --port 43123`
- Then the launcher changes to its own workspace directory
- And it invokes the configured `scripts\project-manager-studio.js` with `--no-open --port 43123`
- And it returns Studio's exit status without using an inherited skill-path value

## Scenario: Reject invalid local configuration

- Given a generated launcher, an inherited `PROJECT_MANAGER_SKILL_PATH` that would otherwise be usable, and separate fixtures where `.projects/.env.local` is missing, lacks the managed key, has an empty value, has a relative value, has duplicate managed keys, points to a missing directory, or points to a skill without `scripts/project-manager-studio.js`
- When the launcher is executed once against each invalid fixture
- Then the launcher exits nonzero with a diagnostic identifying the invalid workspace-local configuration
- And it does not launch Studio from the inherited value or another fallback location

## Scenario: Reinitialize a workspace without destroying local configuration

- Given a workspace with canonical launchers, unrelated `.env.local` keys, unrelated `.projects/.gitignore` rules, and one existing initialized project
- When Project Manager initializes another project in the same workspace
- Then it updates or adds only the single `PROJECT_MANAGER_SKILL_PATH` line
- And it preserves unrelated environment lines and ignore rules
- And it reuses byte-identical launchers, repairing only executable mode drift on `studio.sh`
- And both projects remain valid selectable direct children of `.projects`

## Scenario: Refuse unsafe workspace paths without partial initialization

- Given separate selected-workspace fixtures where each managed path in turn is a symlink, escapes containment, has an unsupported file type, or an existing launcher differs from the canonical asset
- When Project Manager runs the deterministic initialization command once against each unsafe fixture
- Then initialization fails before exposing any project or support-file change
- And every pre-existing byte, mode, and absent-path state remains unchanged

## Scenario: Restore the workspace after an exposure failure

- Given a fully preflighted temporary-workspace initialization with recorded prior state and the library-level failure-injection options enabled only in the test process
- When the transaction test injects a failure after every exposure index in turn, and separately injects rollback failure after a moved pre-existing target
- Then initialization rolls replacements back in reverse order
- And every pre-existing byte, mode, empty-directory state, and absent path is restored exactly
- And a rollback failure preserves a named recovery root and reports that recovery is required

## Scenario: Preserve an external edit detected during rollback

- Given a temporary-workspace transaction that has exposed a managed file and retained its original backup
- When an injected external writer replaces that exposed file before a later transaction step fails
- Then rollback detects that the exposed file no longer matches its installed candidate snapshot
- And the external file remains untouched
- And the original backup remains in a named recovery root
- And initialization hard-fails instead of claiming exact restoration

## Scenario: Report cleanup failure after a committed initialization

- Given workspace initialization has committed a valid live project and retained a pre-existing local-config backup
- When deletion of the backup or marker-bound work root fails
- Then the CLI exits nonzero with `COMMITTED_CLEANUP_FAILED`
- And its structured error names the live project ID and root
- And its data reports `committed` as true and names the retained `recovery_path`
- And the live project remains valid so the caller does not retry initialization

## Scenario: Initialize an explicit standalone project folder

- Given an explicit standalone target project folder and no selected workspace root
- When Project Manager initializes that project
- Then the target contains only `PROJECT.md`, `TASKS.md`, and `STATUS.md`
- And no `.projects/.env.local`, `.projects/.gitignore`, `studio.sh`, or `studio.cmd` is created beside it
