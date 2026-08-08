# Project Manager Studio Timeline

## Summary

- Added one Project Manager Studio with URL-addressable Kanban and Timeline sibling views over the same validated snapshot, filters, dialog, API, and loopback-authenticated server.
- Added exact `TASKS.md` schema v2 schedule metadata with one-way v1 migration, paired inclusive dates, canonical clearing, legacy v1 source-hash compatibility, and no contract/specification hash impact.
- Added UTC date-scaled bars, unscheduled rows, project and milestone markers, explicit unknown forecasts, dependency-date warnings, blocker context, and responsive keyboard-accessible interaction.
- Split server-side authority so eligible unfinished active work may be rescheduled while status/specification edits remain limited to genuinely never-started `planned|ready` tasks; completed task, milestone, and project boundaries remain locked.

## Verification

- Architecture review passed; code review found and drove fixes for v1 hash compatibility, blocker visibility, marker accessibility, and denial-boundary coverage, then passed on re-review.
- `npm run typecheck`, `npm run build`, the skill validator, and `git diff --check` passed; `npm run test:pm` passed 54/54 tests.
- Packaged-browser E2E passed at desktop and 390×844 for routing, filtering, edits, drag/resize drafts, keyboard save, lifecycle protection, completed-state locks, responsive overflow, and zero console errors or warnings.
- Independent verification review mapped and passed all 13 acceptance criteria, constraints, and non-goals.

## Notes

- Schedule dates are planning metadata, not actuals, progress, effort, or evidence. Date conflicts warn but never alter lifecycle blockers or ranking.
- Rollback requires reverting source and generated packaged Studio assets together; schema-v2 files can only be manually downgraded after every schedule is cleared and the project is revalidated.
