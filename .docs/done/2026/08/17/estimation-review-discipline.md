# Schedule Estimation Rules and Review Judgment Discipline

## Summary

- Added `## Estimate schedules` to `references/plan.md`, stating first what the engine actually does:
  `scheduled_start`/`scheduled_end` are written by judgment, and validation checks only that the pair
  is well-formed and ordered. No duration is derived anywhere, so the dates carry exactly as much
  honesty as the reasoning recorded beside them.
- Wrote seven estimation rules against existing schema affordances rather than as free-floating advice:
  throughput unit before estimate (a `human` and an `rpd` task do not share a ruler), cost of proving
  over cost of producing, uncertainty carried in the span width, explicit rework allowance, decay and
  recalibration through the all-or-nothing `forecast_*` triple, estimation risk recorded with magnitude
  and trigger via `RISKS.md` v2 `trigger`, and assumptions declared in `ASSUMPTIONS.md` with
  `impact_if_false` instead of buried inside a date.
- Added `## Judgment discipline` to `references/review.md`, scoped to bind `project review`,
  `project validate-task`, impact analysis, and status narrative — not the review route alone, because
  the revision-confirmation rule matters most during `execute-rpd`, where worktrees make "assessed the
  wrong ref" a live failure mode.
- Added two compressed pointers in `SKILL.md` (Plan, Quality bar) so an agent that never opens the
  references still gets the rule.
- Added a matching pushback bullet to `README.md` and `README.zh-CN.md`: a task date estimated without
  saying who executes it is something Project Manager challenges.
- No schema, script, or state-file behavior changed. `SKILL.md` stays at 1.9.0 and the entry sits under
  `[Unreleased]`, matching how 2b6d82d accumulated changes between releases.

## Verification

- `npm run build` — clean, and produced byte-identical Studio output (no `dist/` churn in `git status`).
- `npm test` — 227 passed, 0 failed on the final tree.
- Every schema reference in the new text was checked against source before it was written, not after:
  the no-derived-duration claim against `scripts/lib/project-state.js:347-351`, and `RISKS.md` v2
  `trigger`, `LESSONS.md` category `estimation`, `ASSUMPTIONS.md` `impact_if_false`, the `forecast_*`
  triple, and `M-` milestone IDs against `references/conventions.md`.
- CR ran and found four issues, all fixed: the new plan.md section had been inserted above the
  document-level project-completion rule and was swallowing it; both READMEs were unpatched; a
  CHANGELOG paragraph sat outside any `###` subsection with no precedent in the file; and a duplicate
  `Read [plan.md]` pointer. Build and tests were rerun after the fixes.
- Installed skill synced with `rsync -a --delete skills/project-manager/ ~/.claude/skills/project-manager/`.

## Notes

- This story took the direct path and has no REQ or AP. Standalone `AR` was therefore reported
  `AR blocked` — a pre-implementation gate has nothing to review when the artifacts do not exist and
  the change has already landed. The honest routing call is that it should have been planned: the
  direct-path condition "clear expected behavior and verification" is not satisfied by LLM-facing prose,
  since neither the build nor the 227 tests exercise a single line of it.
- `VR` did not run and no acceptance criteria exist for it to judge. This completion document records
  what was done and verified; it is not evidence that a requirement was met, because no requirement was
  written.
- Test 165 (`production SSE watcher reports external edits...`) is flaky, failing 2 of 10 runs
  independently of this change. It passed on the final run.
- AR and CR both ran in the primary agent rather than an independent subagent, because this session
  prohibits spawning agents unless asked. Delegation changes review independence, not pass criteria.
- Unrelated Studio and `App.tsx` edits present at session start were resolved outside this session.
  Working tree was re-read immediately before staging rather than trusted from the earlier snapshot.
- Follow-up worth considering: nothing enforces these rules. A schedule filled in at human pace for an
  `rpd` task still validates clean. Teeth would mean a new challenge in `review.md` step 6 flagging
  spans implausible for their executor's provider, or dates with no corresponding `ASSUMPTIONS.md`
  entry — a real feature, and one that should go through REQ.
