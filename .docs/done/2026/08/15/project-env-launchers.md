# Project Environment Launchers — Done

## Summary

- Added deterministic workspace initialization that writes the active absolute skill path to ignored `.projects/.env.local` while preserving unrelated environment and ignore rules.
- Added path-independent `studio.sh` and `studio.cmd` launchers that resolve the workspace locally, validate configuration, forward arguments, and preserve Studio's exit status.
- Kept explicit standalone initialization on the existing three-file project contract.
- Added transactional preflight, conflict refusal, reverse rollback, external-change preservation, and named recovery for unsafe rollback or committed cleanup failures.
- Updated the installable skill contract, English and Chinese guidance, release notes, and version, then synced the complete skill tree to the global installation.

## Verification

- Architecture review passed; code-review findings were fixed and the rerun passed; independent verification completed all nine acceptance criteria.
- The full `npm test` suite passed 155/155, including typecheck and production builds.
- Focused workspace-init and launcher E2E coverage passed 8/8; POSIX launcher behavior ran natively.
- Windows command runtime was unavailable on the macOS verification host; the explicit static batch-contract test passed.
- Repository and global skill trees matched, both `studio.sh` copies were mode `0755`, and `git diff --check` passed.

## Notes

- Initialization detects changes at its immediate synchronous revalidation boundaries; operators must still avoid uncooperative concurrent workspace mutation in the narrow pathname check/rename interval.
