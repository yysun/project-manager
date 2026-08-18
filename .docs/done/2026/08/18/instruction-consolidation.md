# Instruction Consolidation and Execution-Log Findings

## Summary

- **Restructured the skill's instructions as procedure plus rationale.** Numbered imperatives now
  carry the steps; reasoning moved into marked "Why" blocks. Negation-dense prose that buries an
  imperative inside its justification is the form a small model most reliably misreads, and two
  references (`init.md`, `tasks.md`) had no list structure at all.
- **Measured effect:** negations 264 → 239, list items 167 → 267, average sentence length down in
  every file that changed. `conventions.md` went 13 → 41 list items; `SKILL.md`'s Coordinate section
  (748 words, 48 sentences, 10 bullets) became seven subsections. Overlapping-authority prose became
  tables in `SKILL.md` (Studio), `tasks.md` (row order vs. rescheduling vs. specification), and
  `init.md` (profiles).
- **Fixed three defects found while restructuring.** Stale `wave` references in `execute-rpd.md`,
  `SKILL.md`, and `track.md` survived the earlier ready-queue change — Integration still said "in
  ascending task ID within a wave" for a scheduler with no waves. Two scheduler steps stated one
  concurrency rule twice with different criteria.
- **Added a waiting and escalation policy** to `execute-rpd.md` from fresh log analysis: request every
  permission during preflight, declare a human-gated wait once rather than polling it, use blocking
  waits instead of fixed sleeps, and run Delivery the moment the last task settles.
- **Added a no-hand-rolled-mutation rule** to `SKILL.md`, with the documented safe path where no
  command exists.

## Verification

- 242 tests passing; `npx tsc --noEmit` clean; plugin rebuilt; installed skill resynced.
- **"Presentation only" was proved, not asserted.** Every backtick code span and numeric literal was
  diffed against the previous revision across all ten instruction files. One difference:
  `planned|ready` now renders as `planned` ↔ `ready` in a table column. All worker byte limits, ID
  patterns, exit codes, and command signatures are byte-identical.
- 22 high-stakes rules asserted still present, including the worker return limits, the
  no-concurrent-second-worker rule, the nested-subagent blocker, no auto-resolve against the base
  branch, and evidence-free `done` being unreachable. One initially flagged as missing was a regex
  failing to span a line wrap, not a lost rule.

## Log findings acted on

Re-mined the four run logs rather than trusting the source review's summary.

- **Corrected my own first measurement.** An initial count of 66 sleep calls / 321 minutes for
  M-RUNTIME was double-counting echoed command text. Counting actual `tool/call` invocations gives
  **22 sleeps / 107 minutes**, matching the source review exactly.
- **Confirmed ~8 hours of dead wall time** across three runs, none of it worker, review, or
  integration time: 149 minutes waiting on an external package publish, ended only when the operator
  typed "stop wait, continue"; 165 minutes of idle tail after the last worker finished; 162 minutes
  blocked on a sandbox escalation first requested 43 minutes into the run.
- **The contrast is instructive and now documented:** M-HOST used 114 blocking `job_output` waits and
  **zero** sleeps; M-RUNTIME used 22 fixed sleeps. M-PM used zero sleeps and had the lowest handoff
  overhead of the four.
- **Found an unaddressed gap:** M-RUNTIME wrote `/tmp/pm-rpd/complete-milestone.js` — "Mark a
  milestone complete and clear PROJECT.md current_milestone (atomic)" — because no
  milestone-completion command exists. It reimplemented the candidate copy, immutability guard,
  validation gate, and rollback outside every guarantee the skill provides.

## Notes

- **The real fix for milestone completion is a CLI, not a rule.** This story documents the safe
  interim path (edit the single Markdown record, then validate and regenerate `STATUS.md`) and names
  the gap explicitly. A `project-complete-milestone.js` command remains unwritten, and until it
  exists the pressure that produced the hand-rolled script is still there.
- **`plan.md`, `review.md`, and `impact.md` were deliberately left alone** — already list-structured
  at 25, 19, and 6 items with no packed paragraphs. Restructuring them would have been churn.
- **The consolidation is unmeasured against an actual small model.** The metrics here — negation
  count, sentence length, list density — are proxies for comprehension, not evidence of it. Running
  a route end to end on a smaller model is the test that would settle it.
- The pre-existing flaky test (`production SSE watcher reports external edits, atomic root
  replacement, and later new-root edits`) surfaced twice more during this work and passed on every
  retry. Still unrelated, still open.
