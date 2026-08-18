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

## Execution telemetry

`project-report-data.js` returns an `execution` projection alongside the other report data: per task
the number of attempts, elapsed seconds, and totals for LLM calls, tool calls, and input and output
tokens; and the same totals per recorded run.

Each metric is `{reported, unreported}`. `reported` is the sum of the counts executors actually
supplied; `unreported` counts the manifests that supplied none. Report an unreported count as
unreported. Never present it as zero, never estimate it, and never present a partial `reported`
total as complete when `unreported` is non-zero. When `configured` is false the project has no
recorded attempts, which is not the same as a project that consumed nothing.

Telemetry is observational. It never explains why work is ready, blocked, or done, and it must not
be offered as evidence that acceptance criteria were met.

## Concurrency ceiling

`project-status.js` returns a `concurrency` projection describing what the remaining plan's
dependency graph permits: `critical_path`, `widest_level`, `serial_prefix`, and
`concurrency_ceiling`. It is derived from `depends_on` alone and measured in task counts, not
durations.

Report elapsed wall time against the ceiling, never against serial execution. A run that finishes at
`1.0x` on a plan whose ceiling is `1.12x` performed near-optimally; reporting it as a scheduling
loss is wrong and sends the reader after the wrong fix. When the ceiling is low, say that the limit
was set at planning time.

