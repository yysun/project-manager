# Project Manager Kanban Studio — Done

## Outcome

Delivered a packaged local Kanban Studio for the project-manager skill. It launches against one
explicit project folder, renders validated lifecycle state in five lanes, supports search and
operating filters, exposes evidence-aware task detail, and safely edits genuinely never-started
tasks through full-candidate validation and atomic replacement.

The implementation follows Agent World Studio's useful delivery boundary—React/Vite source,
loopback Express server, bundled no-install runtime, token handshake, and packaged static assets—
without copying its watcher, graph editor, prompt editor, or run controls.

## Product decisions

- Keep folder-native Markdown authoritative, with strict JSON metadata inside task records. Pure
  JSON would improve machine mutation but would weaken human narrative, diffs, and existing skill
  compatibility without solving semantic task quality.
- Separate deterministic validity from semantic quality. Studio's **Check changes** proves schema,
  graph, lifecycle, revision, and atomic-save safety. `project validate-task <folder> <task-id>` is
  the LLM review route for clarity, testability, scope, dependencies, constraints, and evidence.
- Do not add a persistent project flag. Explicit `project studio <folder>` selection is the authority
  boundary; the project schema remains unchanged.
- Edit only never-started `planned` or `ready` tasks. Attempt history, execution pointers, and
  re-verification state make a task read-only and route changes through `project update`.

## Safety and verification

- Full-tree exact mutation revisions, task revisions, coherent reads, candidate-copy equality,
  pre-replacement checks, serialized saves, rollback, and root-symlink rejection protect edits.
- CRLF task documents remain editable without line-ending conversion; narrative and unrelated task
  bytes remain intact except mechanically required reverse dependency links.
- Packaged runtime binds only to `127.0.0.1`, uses a 256-bit random token and HttpOnly
  SameSite=Strict cookie, and exposes only project GET, task check, and task save APIs.
- Node.js 22.22.0; dependency install passed; audit reported zero vulnerabilities; typecheck passed;
  all 44 Node tests passed; skill validation passed; `git diff --check` passed.
- Two complete builds produced identical aggregate SHA-256
  `d89a8e17f4b343489ab0e91897ddcf35d5ed69c5aee620505a57aad878fc3558`.
- On a 10,001-entry, 100 MiB project, authenticated project GET median was 362.14 ms and the slowest
  exact revision was 224.10 ms.
- Browser E2E passed at 1440×900 and 390×844 with saved screenshots, keyboard focus/inert checks,
  invalid/stale/edit/read-only flows, and zero warnings or errors in the final clean session.

## RPD gates

AR passed: no blocking architecture flaws

CR passed: no major findings

VR passed: all acceptance criteria verified.

## Evidence

- Requirements: `.docs/reqs/2026/08/08/req-project-manager-kanban.md`
- Plan: `.docs/plans/2026/08/08/plan-project-manager-kanban.md`
- E2E specification: `.docs/tests/test-project-manager-kanban.md`
- Execution results: `.docs/tests/results/project-manager-kanban/`
