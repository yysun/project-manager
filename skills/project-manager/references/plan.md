# Plan a Project

Plan from outcome to executable work:

1. Confirm the selected folder and current objective.
2. Tighten success criteria until completion can be demonstrated.
3. Decompose work into independently verifiable outcomes, not activity labels.
4. Give each task a stable project-owned ID, outcome, and unique acceptance strings.
5. Add dependencies only where one outcome truly gates another. Maintain exact reverse `blocks` links.
6. Identify ownership, executor, explicit blockers, sources, and evidence requirements only where needed.
7. Add milestones, risks, decisions, sources, or traceability when they change coordination or reporting.
8. Validate and regenerate derived status.

## Decompose RPD work as stories

When a task will use the `rpd` executor, make the project task the input to one complete RPD flow:
`REQ → AP → AR → SS/CR → TT → ET when needed → VR → DD → GC`.

- Define one cohesive repository behavior or contract change with observable acceptance criteria that
  RPD can carry through requirements, implementation, testing, review, verification, documentation,
  and commit in one governed attempt.
- Keep the task at the requirement boundary: state what must become true, the constraints that must
  remain true, and meaningful non-goals. Do not prescribe a file-by-file implementation plan.
- Do not create project tasks for RPD stages or implementation slices such as requirements, design,
  backend, frontend, tests, review, documentation, or commit. Those fragments are not independently
  valuable or verifiable; RPD's AP decomposes the story internally.
- Split RPD work only at independently deliverable behavior boundaries, different executor roots,
  real dependency or approval gates, or materially different rollback and risk boundaries. A split
  task must have acceptance criteria that VR can prove without relying on an unfinished sibling.
- Keep prerequisites outside the RPD task and express them as dependencies. Do not hide pending human
  decisions, unavailable external systems, or another repository's required change inside the story.
- Avoid both extremes: do not bundle unrelated outcomes into one story, and do not fragment one
  behavior across tasks that cannot be verified or committed safely on their own.

Do not create schedule precision from task counts. A milestone forecast is valid only with a forecast date, update date, and evidence.

Project completion requires every task evidence-backed done or terminally cancelled, every configured
milestone complete, and every project success criterion mapped to at least one non-cancelled done task.
Cancellation never satisfies a dependency or success criterion.

## Estimate schedules

`scheduled_start` and `scheduled_end` are written by judgment; the engine derives no duration and
validates only that the pair is well-formed and ordered. A schedule is therefore exactly as honest as
the reasoning recorded beside it.

1. Fix the executor and its throughput unit before estimating. Person-days, agent-hours, and CI minutes
   are different units, and a `human` task and an `rpd` task covering the same behavior do not share a
   ruler. Ask which unit applies; do not assume one.
2. Estimate the cost of proving the outcome, not of producing it. Where acceptance items and evidence
   requirements exist, verification scaffolding routinely exceeds the change itself: one behavior change
   that must be shown consistent across many entry points costs more than a large mechanical edit.
3. Prefer a range to a point. The schema holds one inclusive span, so carry uncertainty in the width of
   that span and record what would narrow it. A single date claims precision no estimate has.
4. Leave explicit rework allowance. Some fraction of first attempts fail; blocked manifests and retry
   contracts are ordinary, not exceptional. Measure that fraction where attempt history exists, and
   assume it is non-zero where it does not.
5. Treat estimates as decaying. Recalibrate against the first actuals rather than committing a long
   horizon at once, and move `forecast_date`, `forecast_updated`, and `forecast_evidence` together
   whenever the basis changes.
6. Record estimation risk with magnitude and trigger, not sentiment. "May be off" is not a risk; "if
   this span is exceeded by more than 30%, M-2 and M-3 re-sequence" is, and `RISKS.md` schema v2 has
   `trigger` for exactly that. Post-hoc estimation error belongs in `LESSONS.md` under `estimation`.
7. Separate declared assumptions from derived facts in every artifact. Team size, parallelism, and the
   working calendar are assumptions until confirmed; record them in `ASSUMPTIONS.md` with
   `impact_if_false` instead of burying them inside a date.

## Dependency density decides wall time

A dependency is a commitment that one task cannot begin until another finishes. Declared
dependencies set a floor on elapsed time that no executor, no added concurrency, and no scheduler
can go below, so decomposition — not orchestration — is the dominant control on how long a plan
takes to run.

After drafting tasks, read `concurrency` from `project-status.js`:

- `critical_path` — the longest chain of dependent tasks. This is the minimum number of sequential
  task-slots the plan needs.
- `concurrency_ceiling` — remaining tasks divided by that path: the best speedup any scheduler could
  ever achieve. A plan with 13 tasks and a 9-level path is capped near `1.4x` no matter how it runs.
- `widest_level` — the most tasks that can ever be ready at once. Never plan for more concurrency
  than this.
- `serial_prefix` — leading levels that admit exactly one task. This is dead time at the start of the
  run, when the most capacity is idle and the least work is committed.

Treat a low ceiling as a decomposition question before accepting it as a fact:

- Declare a dependency only when the dependent task genuinely cannot be **started** without the other
  finishing. Shared subject matter, an expected merge conflict, a preferred review order, or "it
  would be tidier afterwards" are not dependencies. Sequence those with priority instead, which
  guides order without forbidding overlap.
- Prefer a dependency on the specific task that establishes a needed contract over a dependency on
  everything upstream of it. Transitive edges restated as direct ones do not change correctness and
  do not change the critical path, but they do obscure it.
- A long `serial_prefix` usually means foundation work was split into stages. If those stages have no
  independently verifiable acceptance criteria, they are one story, and merging them shortens the
  path without weakening any gate.
- When the ceiling is genuinely low because the work is genuinely sequential, say so in the plan.
  A stated `1.1x` ceiling sets correct expectations; an unstated one gets misread later as an
  execution failure.

