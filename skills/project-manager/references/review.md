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
8. Return three short sections — `Blocking defects`, `Recommendations`, and `Strong properties` — using
   `None` where a section has no items. This mirrors the output contract `project validate-task` uses
   for one task in [tasks.md](tasks.md), applied here to the whole project.
