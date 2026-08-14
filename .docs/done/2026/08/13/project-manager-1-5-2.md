# Project Manager 1.5.2

## Summary

- Studio catalog startup now isolates task execution-state failures instead of failing the entire project catalog.
- Affected tasks stay visible with readable task-local warnings while strict execution and validation boundaries remain unchanged.
- Timeline bars preserve lifecycle color and use borderless severity dots; details distinguish dependency tasks, blocker notes, schedule conflicts, and execution issues.
- Non-actionable task warnings and stale-status notices no longer repeat as page-level banners.
- Packaged Studio assets, the installable skill version, tests, and changelog were updated for 1.5.2.

## Verification

- `npm run typecheck` — passed.
- `npm test` — passed: 119 tests.
- `git diff --check` — passed.
- Independent code review — passed with no major findings.

## Notes

- Existing project state remains compatible; no project-file schema migration is required.
- Execution and standard validation commands remain strict even when Studio renders task-scoped warnings.
