# Report Project State

Run `project-report-data.js` first. Narrative must preserve its facts.

Accepted audiences:

- `operator`: executable work, blockers, dependencies, acceptance, and evidence gaps.
- `project-manager`: progress, next work, milestone health, risks, decisions, changes, and ownership.
- `executive`: outcome confidence, material variance, major risk, decisions required, and immediate recommendation.
- `board`: strategic outcome, material exposure, governance decisions, and confidence limits.

Reject any other audience before constructing a filename. Saved reports use collision-safe timestamps and never overwrite history.

Keep unknowns visible. Do not turn absent milestones into “on track,” absent traceability into zero coverage, or unsupported forecasts into dates.

## Tailored-out areas

A knowledge area declared tailored out is a recorded decision, not a gap and not a zero. Report it as
tailored out together with its recorded rationale, exactly as `project-report-data.js` supplies it.

- Correct: “Cost: tailored out — no project budget; effort absorbed by the standing team.”
- Wrong: “Cost: $0”, “Cost: on track”, “Cost: not available”, or silently omitting the area.

An area is only tailored out when the project declares it so. On a schema version 1 project, tailoring
is undeclared: say so plainly rather than implying every area is applied or that any area was skipped.
Never present a tailored-out area as a finding against the project, and never invent a rationale the
project did not record.
