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
