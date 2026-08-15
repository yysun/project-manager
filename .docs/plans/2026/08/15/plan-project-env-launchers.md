# Project Environment Launchers Plan

## Goal

Workspace-root project initialization must leave a portable Studio entry point whose only machine-local value is stored in ignored `.projects/.env.local`, while standalone project-folder initialization remains unchanged.

## Current Context

- `skills/project-manager/SKILL.md` routes `project init` to `references/init.md`, states that a minimal project contains only its three state files, and currently says initialization does not add Git files.
- `skills/project-manager/references/init.md` is the executable instruction contract for initialization. It currently creates only the selected project folder and has no workspace-support file behavior.
- `skills/project-manager/assets/` packages skill-owned resources and can carry canonical launcher bytes without embedding the installation path.
- `skills/project-manager/scripts/lib/mutations.js` already provides exact project-folder replacement and failure injection, but it does not transact workspace-root support files with a new project.
- Studio already discovers `<launch-working-directory>/.projects` and accepts additional arguments through `skills/project-manager/scripts/project-manager-studio.js`; no Studio server change is needed.
- `skills/project-manager/tests/project-manager.test.js` is the installable skill's contract suite and currently has no assertions for initialization instructions or generated launcher contracts.
- `skills/project-manager/README.md`, `skills/project-manager/README.zh-CN.md`, and `CHANGELOG.md` are the relevant user and release documentation.
- The repository requires the complete `skills/project-manager/` directory to be synced to `~/.agents/skills/project-manager/` after any installable-skill edit.

## Decisions

- Put `.env.local` and its `.gitignore` in the workspace's `.projects` container; put `studio.sh` and `studio.cmd` at the workspace root so launching from either file naturally makes the workspace the Studio working directory.
- Store canonical, path-independent launchers as `skills/project-manager/assets/studio.sh` and `skills/project-manager/assets/studio.cmd`; workspace initialization copies those exact bytes. Exact byte identity is the managed-file discriminator. A matching POSIX launcher with mode drift is repaired to executable; any non-symlink launcher with different bytes is an operator-owned conflict and aborts preflight.
- Use a single literal `KEY=value` line contract for `PROJECT_MANAGER_SKILL_PATH`. Launchers clear any inherited value and parse only that key rather than sourcing or executing `.env.local`, which avoids treating local configuration as code and preserves spaces or additional `=` characters after the first `=`.
- Make workspace support conditional on workspace-root initialization. An explicitly selected standalone project target retains the strict three-file behavior and receives no sibling support files.
- Require init to preserve unrelated `.env.local` lines and `.gitignore` rules, replace or add only one managed skill-path key and the exact `/.env.local` ignore entry, and reject duplicate managed keys before mutation. Existing canonical launchers may be reused; unrelated files with either launcher name cause a clear refusal.
- Before staging, resolve the selected workspace with `realpath`; require `.projects` to be a real contained directory or a not-yet-created path; inspect every project/support target with `lstat`; and refuse symlinks, non-regular support targets, escaping paths, or temporary/backup roots outside their intended parent.
- Add `scripts/project-init-workspace.js` backed by `scripts/lib/workspace-init.js`. The command accepts an absolute selected workspace root, safe project slug, and one bounded stdin JSON object containing exactly the fully rendered `PROJECT.md` and `TASKS.md` documents. It infers the active skill root from its own installed location, regenerates `STATUS.md` from those authoritative files, rejects a still-stale private candidate, validates it with the existing project loader, and owns the complete support-plus-project transaction. Init instructions must call this command rather than coordinating workspace writes ad hoc; caller-supplied status content is never accepted.
- If installation commits but backup/work-root cleanup fails, return `COMMITTED_CLEANUP_FAILED` with the live project identity and structured `{committed:true,recovery_path}` data. This prevents a caller from retrying a project that already exists and exposes retained local-config cleanup explicitly.
- Treat `.projects`, the project target, and all changed support paths as one rollback unit inside `workspace-init.js`. Complete all validation and conflict checks first; record exact prior bytes, modes, and absent/empty-directory states; prepare every candidate in a unique marker-bound same-filesystem work root under the selected workspace; expose support files with atomic renames and the project last; on any failure, roll back replacements in reverse order and restore every recorded prior state before reporting failure. Preserve the marker-bound recovery root and stop if exact rollback itself fails.
- Export the transaction function with test-only injected failure options matching the existing mutation convention: failure after each exposure index and rollback failure. The public CLI exposes no injection flags.
- Snapshot every managed target's absence or `lstat` identity, type, mode, and content digest during preflight, then revalidate that snapshot immediately before moving or replacing that target. Snapshot each installed candidate after exposure and revalidate it before rollback removal. A detected pre-exposure change aborts and reverses earlier owned exposures; a changed exposed target is preserved and forces a hard rollback failure with the original backup retained in the recovery root.
- Treat initialization as an exclusive workspace mutation. The command closes ordinary stale-snapshot gaps with immediate synchronous revalidation, but Node's pathname APIs cannot provide a no-clobber compare-and-swap against an uncooperative writer in the instruction interval between `lstat` and `rename`. Document that operational boundary instead of claiming hostile-race atomicity.
- Keep launchers dependency-free. `studio.sh` is mode `0755`, changes to its own workspace directory, uses POSIX shell facilities, forwards `"$@"`, and `exec`s Node so Studio's exit status is preserved. `studio.cmd` uses `setlocal`, built-in `for /f` without delayed expansion, `cd /d "%~dp0"`, quoted paths, `%*`, and an explicit `exit /b` with Studio's status.
- Both launchers require exactly one non-empty managed key, validate that it is absolute for their platform, require the configured `scripts/project-manager-studio.js` to be a regular file, and fail with a diagnostic otherwise. They never fall back to an inherited variable or another install location.
- This is a user-facing cross-platform launch flow, so E2E coverage is required in `.docs/tests/test-project-env-launchers.md`. POSIX scenarios run on POSIX. Windows runtime execution is required when verification runs on Windows; non-Windows verification records the unavailable runtime lane and must still pass explicit batch-contract tests covering every portable invariant.
- Do not add feature flags, fallback skill locations, environment discovery, or Studio server changes.

## Phased Tasks

### Phase 1 - Contract and safety boundaries

- [x] Update `skills/project-manager/references/init.md` to distinguish workspace-root initialization from standalone target-folder initialization and define exact support-file locations.
- [x] Specify preflight, preservation, idempotency, and conflict behavior for `.projects/.env.local`, `.projects/.gitignore`, `studio.sh`, and `studio.cmd` before any project state is exposed.
- [x] Record launcher parsing, path-with-spaces, working-directory, argument-forwarding, and failure requirements without introducing fallback locations or executable environment loading.
- [x] Define canonical-byte ownership, mode handling, `lstat` containment checks, full preflight, exposure order, exact reverse rollback, and recovery preservation for the complete workspace write set.

### Phase 2 - Initialization templates

- [x] Add canonical POSIX and Windows launcher templates at `skills/project-manager/assets/studio.sh` and `skills/project-manager/assets/studio.cmd`; document `.env.local` and `.gitignore` transformations in `skills/project-manager/references/init.md` using the active skill's resolved absolute directory only in local configuration.
- [x] Implement the complete transaction in `skills/project-manager/scripts/lib/workspace-init.js`, including bounded payload validation, safe-slug and containment checks, symlink/special-file refusal, canonical launcher conflict detection, config/ignore preservation, candidate validation, ordered exposure, exact reverse rollback, and recovery preservation.
- [x] Add `skills/project-manager/scripts/project-init-workspace.js` as the strict CLI boundary that reads one exact bounded stdin JSON payload containing only `project_md` and `tasks_md`, rejects caller-supplied or unknown fields, resolves its own active skill root, invokes the transaction, and returns the repository's standard JSON success/error envelope.
- [x] Regenerate `STATUS.md` inside the private project candidate and reject stale candidate state before any workspace path is exposed.
- [x] Update `skills/project-manager/SKILL.md` and `skills/project-manager/references/init.md` so workspace-root initialization uses the built-in command while the minimal-project and standalone atomic-mutation rules retain the three-file project boundary.
- [x] Ensure the launcher templates invoke `scripts/project-manager-studio.js`, anchor execution to the workspace root, validate the configured script, and forward all supplied arguments.

### Phase 3 - Contract tests

- [x] Add focused assertions in `skills/project-manager/tests/project-manager.test.js` for the init contract, exact launcher asset paths, managed environment key, transaction and symlink rules, conflict behavior, standalone-folder exception, and both argument-forwarding forms.
- [x] Add executable POSIX launcher tests in `skills/project-manager/tests/project-manager.test.js` using a temporary workspace and fake skill path containing spaces to prove launcher-relative cwd, argument forwarding, local-config precedence, exit-status propagation, and missing/invalid/duplicate configuration failures.
- [x] Add Windows launcher contract tests for `setlocal`, inherited-value clearing, one-key parsing without delayed expansion, absolute-path checks, quoted script invocation, `%*` forwarding, and exit-status propagation; run the matching E2E scenario on Windows when a Windows command runtime is available.
- [x] Add temporary-workspace transaction tests for every exposure failure index and an injected rollback failure, asserting exact tree bytes and modes, absence restoration, empty-directory restoration, and named recovery preservation.
- [x] Add table-driven transaction tests for a workspace and skill path containing spaces; every invalid local-config form; symlinked, escaping, special-file, and noncanonical-launcher conflicts; repeat initialization preservation; and standalone-init non-participation.
- [x] Add injected change tests proving the transaction rejects a stale next target before replacement and, separately, preserves a modified already-exposed file and its recovery backup instead of deleting the external edit during rollback.
- [x] Add spawned `project-init-workspace.js` tests for missing, duplicate, and unknown arguments; relative workspace paths; unsafe slugs; empty, malformed, trailing, and oversized stdin; missing, unknown, and caller-supplied status fields; documented exit classes; exact success/error envelope shape; and committed cleanup failure with live project and recovery metadata.
- [x] Add a regression test showing supplied or mismatched `STATUS.md` is rejected and the command-generated status is current against the authoritative project files.
- [x] Run `node --test skills/project-manager/tests/project-manager.test.js` and record a passing result.
- [x] Run `npm run typecheck` and `npm run build` to confirm the instruction and test changes do not break the packaged Studio workspace.

### Phase 4 - User and release documentation

- [x] Update `skills/project-manager/README.md` with the workspace initialization output and direct Studio launcher commands.
- [x] Update `skills/project-manager/README.zh-CN.md` with equivalent workspace initialization and launcher guidance.
- [x] Bump the installable skill minor version and add a `CHANGELOG.md` release entry describing local configuration and cross-platform launchers.

### Phase 5 - Installation sync and final evidence

- [x] Sync the complete `skills/project-manager/` directory to `~/.agents/skills/project-manager/` and verify the installed copy matches the repository copy.
- [x] Run the full `npm test` suite after the sync and record the final result.
- [x] Confirm the diff contains no generated workspace secrets, no hard-coded installation path in launcher templates, and no changes to Studio runtime behavior.

## Validation

- `node --test skills/project-manager/tests/project-manager.test.js` must pass all installable-skill contract tests.
- `npm run typecheck` must complete without diagnostics.
- `npm run build` must rebuild the server and client successfully.
- `diff -qr skills/project-manager "$HOME/.agents/skills/project-manager"` must report no differences after sync.
- `node -e 'for (const p of process.argv.slice(1)) { if ((require("node:fs").statSync(p).mode & 0o777) !== 0o755) process.exit(1) }' skills/project-manager/assets/studio.sh "$HOME/.agents/skills/project-manager/assets/studio.sh"` must confirm exact source and installed mode `0755`.
- `npm test` must pass the full build and test suite.
- Execute `.docs/tests/test-project-env-launchers.md` with available platform tools; record POSIX runtime evidence and the Windows runtime result when a Windows command runtime is available, otherwise record the exact unavailable lane and the static contract evidence used.
- Review must confirm both English and Chinese guides name all generated paths, explain that the skill path is local and ignored, show their platform launcher command, and state the principal invalid-config/conflict failure behavior.
- Review must confirm launcher assets parse rather than source `.env.local`, fail if the configured Studio script is unavailable, preserve arguments and exit status, and contain no resolved local skill path.

## Rollback / Risk

- The main risk is overwriting an operator-owned `studio.sh` or `studio.cmd`; initialization must preflight and refuse conflicts before creating the project or support files.
- Partial workspace writes could leave launch support inconsistent. The workspace transaction must restore exact prior bytes, modes, and absence in reverse order; a failed rollback preserves a named recovery root instead of claiming success.
- Symlinked managed paths can escape the workspace or redirect secrets. Initialization rejects them during preflight and rechecks parent identity before exposure.
- Detected edits after preflight invalidate rollback assumptions. The transaction revalidates each exact target immediately before synchronous replacement and revalidates installed candidates before rollback removal. A modified exposed target is never deleted; initialization hard-fails with recovery preserved. Operators must still avoid uncooperative workspace mutation during the narrow `lstat`/`rename` interval because Node exposes no atomic path compare-and-swap.
- Windows command parsing differs from POSIX shell parsing. Restrict the shared file format to literal `KEY=value`, parse only the first `=`, avoid delayed expansion, and test every portable invariant even when a Windows runtime is unavailable locally.
- Rollback restores the complete pre-init workspace state; it never blindly removes a pre-existing managed key, ignore rule, launcher, or empty project directory.
