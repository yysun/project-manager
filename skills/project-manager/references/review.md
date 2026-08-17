# Review a Project

`project review` is read-only. It never mutates project state; recommend `project plan` or
`project update` as follow-up work instead of applying changes here.

1. Run `project-validate.js` first. Treat any semantic failure as blocking and stop before
   qualitative review; a project that fails deterministic validation cannot be reviewed for quality.
2. Run `project-status.js`, `project-blocked.js`, `project-coverage.js`, and `project-report-data.js`
   to gather current facts. Narrative must not contradict them or restate optimism the facts do not
   support.
3. Challenge plan quality: outcomes written as activities rather than states, acceptance too vague to
   be observable, tasks too large to verify without hidden decomposition, and dependencies that do not
   truly gate one outcome on another.
4. Challenge blockers and dependencies: circular intent, blockers with no path to resolution or owner,
   and `depends_on` entries that reference work marked done without the completed-dependency guarantees
   `project-blocked.js` reports.
5. Challenge evidence: thin or generic evidence records, approvals lacking specificity, and current
   sources that remain unverifiable (no immutable version or content hash) despite gating verified work.
6. Challenge risks and forecasts: missing mitigation or ownership, milestone forecasts asserted without
   `forecast_date`, `forecast_updated`, and `forecast_evidence` all populated together, and schedule
   precision invented from task counts rather than evidence.
7. Challenge coverage: success criteria with no mapped task, and coverage or milestone health reported
   as healthy when traceability or milestones are simply unconfigured rather than actually on track.
8. Challenge tailoring drift when the project declares it: an area tailored out whose rationale no
   longer matches reality (cost tailored out on a project that has started committing spend, stakeholder
   tailored out once external parties appeared), a rationale that restates the omission instead of
   justifying it, and an applied area with nothing behind it. On a schema version 1 project, note that
   tailoring is undeclared where that materially weakens the project's governance story — but treat
   adopting version 2 as a recommendation, never a blocking defect.
9. Return three short sections — `Blocking defects`, `Recommendations`, and `Strong properties` — using
   `None` where a section has no items. This mirrors the output contract `project validate-task` uses
   for one task in [tasks.md](tasks.md), applied here to the whole project.

## Judgment discipline

These bind any assessment of project state: `project review`, `project validate-task`, impact analysis,
and every status claim made in narrative.

1. Confirm you are reading the intended revision before assessing anything. Where several repositories,
   worktrees, or branches are in play, check each checked-out ref individually. A diverged branch turns
   completed work into a false report silently, and reading the code never surfaces that class of error.
2. Read the decision record before naming a gap. Cancelled is not forgotten and deliberately excluded is
   not missing; `DECISIONS.md`, task disposition, and tailoring rationales carry that context. Gap
   analysis without it reports design judgment as a defect.
3. Never assert state from memory. Re-read the files and re-run the fact scripts immediately before
   asserting; facts established earlier in the same conversation may already be stale.
4. Distinguish "does not exist" from "cannot be reached". Code can exist and be dead, data can exist with
   no read path, work can be committed and unmerged. The three carry different conclusions and different
   dispositions, and a dead-code finding requires confirming callers rather than absence of a definition.
5. Mark which findings were verified and which were inferred, and name what could not be executed. If a
   build or test suite would not run, state that once and clearly as a limit on every conclusion drawn.
6. Demand evidence for completion, never artifacts. A present file, a closed ticket, a confident commit
   message, and tidy documentation prove nothing on their own; only a validated Evidence Manifest does.
