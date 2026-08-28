# Home-relative Project Manager skill path

## Problem

Workspace-root initialization generates `.projects/.env.local`, `.projects/.gitignore`, `studio.sh`, and `studio.cmd`, but the managed `PROJECT_MANAGER_SKILL_PATH` is always machine-specific and the launchers accept only absolute paths. Home-directory installations cannot use the conventional portable `~/...` form.

The root English and Chinese READMEs show Studio but do not explain the generated workspace launch support. The detailed skill guides describe the launchers but do not state the safe path forms.

## Requirement

Allow the managed Project Manager skill path to use a narrowly defined home-relative form, keep `.env.local` data-only, and document the generated workspace launch workflow consistently in English and Chinese.

## Acceptance Criteria

- [x] Workspace-root initialization writes `PROJECT_MANAGER_SKILL_PATH` as `~/...` when the resolved skill root is inside the current user's home directory, and retains an absolute path otherwise.
- [x] Repeated initialization preserves unrelated `.env.local` settings while updating only the managed entry to the canonical home-relative or absolute value.
- [x] `studio.sh` expands only a leading `~/` through an absolute `$HOME`, while rejecting other relative forms and never sourcing `.env.local`.
- [x] `studio.cmd` expands a leading `~/` or `~\` through `%USERPROFILE%`, while rejecting other relative forms and never executing `.env.local`.
- [x] Previously published canonical `.projects` launchers are recognized and upgraded transactionally to the new launcher bytes; unrelated launcher content remains a conflict.
- [x] Automated coverage proves canonical path serialization, controlled POSIX `~/` launch behavior, invalid-home rejection, and continued ordinary-relative rejection.
- [x] Root and skill-level English and Chinese READMEs describe the init-generated files, launcher commands, supported path forms, and data-only parsing boundary.
- [x] `SKILL.md` and `references/init.md` match the implemented contract.
- [x] The plugin package is rebuilt, the full suite passes, and complete affected installed units are synchronized through supported installation paths.

## Constraints

- Preserve atomic workspace initialization, conflict refusal, rollback, recovery, and retired-launcher behavior.
- Preserve loopback-only, token-protected Studio behavior.
- Do not interpret literal `$HOME` references, command substitutions, `~user`, or arbitrary shell syntax from `.env.local`.
- Preserve unrelated local configuration and the exact `/.env.local` ignore rule.
- Preserve the exact-byte ownership boundary for launcher upgrades; do not broaden it to name-based ownership.
- Do not add runtime dependencies or change the release version.

## Non-Goals

- General dotenv parsing or variable interpolation.
- Supporting arbitrary relative paths.
- Changing standalone three-file project initialization.
- Changing Studio APIs, catalog selection, authentication, or browser behavior.
- Publishing a release.

## Open Questions

None.
