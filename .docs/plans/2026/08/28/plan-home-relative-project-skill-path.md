# Plan: Home-relative Project Manager skill path

## Goal

Make generated Project Manager Studio launch support portable for home-directory installations without weakening local-config parsing or workspace transaction guarantees.

## Current Context and Decisions

- `initializeWorkspaceProject` already owns `.projects/.env.local`, `.gitignore`, both launchers, and the new project as one transaction.
- The managed environment line may coexist with unrelated local settings; only `PROJECT_MANAGER_SKILL_PATH` is replaced.
- `~/` is shell shorthand, not a general relative path. Unix uses an absolute `$HOME`; Windows uses an absolute `%USERPROFILE%` and accepts both slash styles.
- The initializer prefers `~/...` only when the real skill root is inside the current home. Out-of-home paths stay absolute.
- Existing launcher assets remain the managed byte identity. The initializer will recognize the exact hashes of the immediately previous `.projects` launchers and replace them transactionally; retired workspace-root launcher hashes are historical and must not change.
- The existing POSIX launcher test is the executable regression surface; Windows receives explicit static batch-contract coverage when no Windows runtime is available.
- The repository root already has standard English and Chinese READMEs, so the work updates those files rather than creating a duplicate Chinese naming convention.

## Tasks

- [x] Update `skills/project-manager/scripts/lib/workspace-init.js` to serialize in-home skill roots as `~/...`, preserve unrelated config lines, and recognize the previously published `.projects` launcher bytes for transactional upgrade.
- [x] Update `skills/project-manager/assets/studio.sh` and `studio.cmd` to expand only the supported home-relative prefix before absolute-path validation.
- [x] Extend `skills/project-manager/tests/project-manager.test.js` with focused serialization, POSIX expansion/rejection, Windows contract assertions, and a prior-launcher upgrade regression.
- [x] Align `skills/project-manager/SKILL.md` and `skills/project-manager/references/init.md` with the safe path contract.
- [x] Update `README.md`, `README.zh-CN.md`, and both skill guides with generated launcher/config behavior.
- [x] Run focused launcher and initialization tests, then review the complete implementation diff.
- [x] Run `npm run build:plugin`, typecheck, the full `npm test` suite, skill validation, and the temporary-workspace launcher/API smoke flow.
- [x] Synchronize complete affected installed units without editing Codex cache snapshots directly, and verify the supported installed copy matches.

## Validation

- `node --test --test-name-pattern='workspace initialization|Studio launcher|initialization instructions' skills/project-manager/tests/project-manager.test.js`
- `npm run typecheck`
- `npm run build:plugin`
- `npm test`
- Skill quick validator against `skills/project-manager`
- `.docs/tests/test-home-relative-project-skill-path.md`
- Source/install tree comparison for the supported plugin or standalone skill installation when present

## Risk

Non-low risk: this changes configuration parsing at a cross-platform execution boundary and updates managed launcher bytes. The implementation limits expansion to a leading `~/`, quotes resolved paths, validates the home base as absolute, preserves regular-file checks, and leaves the existing workspace transaction untouched.
