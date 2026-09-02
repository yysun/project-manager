---
name: test-manager
description: Manage QA strategy, suites, cases, test execution, evidence, defects, traceability, and release gates as folder-native state under the current workspace's .tests directory. Use for testing work and quality decisions; do not use for product-delivery coordination, .projects state, standalone operational UX audits, or implementing product fixes unless separately requested.
metadata:
  version: "1.12.1"
  source: "https://github.com/yysun/project-manager/tree/main/skills/test-manager"
---

# Test Manager

**Version:** `1.12.1`
**Repository:** https://github.com/yysun/project-manager
**Source:** https://github.com/yysun/project-manager/tree/main/skills/test-manager

Manage testing as durable workspace state through `strategy → design → readiness → execution → triage → reporting → closure`.

The default test root is `<cwd>/.tests`. Its direct child directories are test suites. Do not search upward, use a repository as implicit test state, or create a parallel test root when the user has not selected one.

## Operating boundary

- Own test strategy, risk coverage, suite and case design, readiness, execution records, evidence, defect linkage, traceability, quality gates, and reporting.
- Own `.tests` state, not product-delivery coordination, task dependencies, or `.projects` state. When both kinds of state exist, keep their authority separate and report QA evidence across that boundary only when the user's workflow requires it.
- Test the requested system through the appropriate surface. For visible UI business testing, operate the UI and use API/database access only as read-only secondary evidence unless the user authorizes another method.
- For an authorized visible-UI execution, complete the entry gate and then open and operate the requested browser, preferring the in-app Browser when it is available and the user did not choose another surface. Planning, status review, and opening Studio do not by themselves authorize opening or changing the target system.
- Do not implement product fixes, mutate production data, create external tickets, or waive a quality gate unless the user explicitly asks.
- Treat permissions, environments, production writes, notifications, payments, and destructive actions as separate authorization boundaries.

## Resolve the test root

1. Use an explicit test root or suite folder when supplied.
2. Otherwise resolve the current working directory and use its direct `.tests` child.
3. A valid root contains `TESTING.md`, `SUITES.md`, and `STATUS.md` as regular, non-symlinked files.
4. Every visible direct child directory of `.tests` must be one suite containing `SUITE.md`, `CASES.md`, and `RUNS.md`. `STEPS.md` and `evidence/` are optional suite-local additions.
5. If `.tests` is absent and the request implies creating or planning managed tests, initialize it. If a non-empty invalid `.tests` exists, stop and explain the conflict instead of overwriting it.

Use the deterministic helper for structure and derived facts:

```bash
node <absolute-skill-dir>/scripts/test-manager.mjs init [--root <tests-root>] [--title <title>]
node <absolute-skill-dir>/scripts/test-manager.mjs create-suite <suite-slug> [--root <tests-root>] [--title <title>]
node <absolute-skill-dir>/scripts/test-manager.mjs validate [--root <tests-root>] [--json]
node <absolute-skill-dir>/scripts/test-manager.mjs status [--root <tests-root>] [--json] [--write]
node <absolute-skill-dir>/scripts/test-manager.mjs prompt <case-id> [--root <tests-root>] [--json]
node <absolute-skill-dir>/scripts/test-manager-studio.mjs [--root <tests-root>] [--port <port>] [--no-open]
```

`--root` defaults to `<cwd>/.tests`. Resolve this skill directory from this `SKILL.md`, never relative to the product repository.

## Natural-language operating intents

Infer the appropriate route from the user's goal; do not require command syntax.

1. **Initialize** — establish the root strategy and empty suite registry.
2. **Create or plan a suite** — define scope, risks, test levels, data, environments, entry criteria, and exit criteria.
3. **Design or update cases** — add stable, observable, risk-linked cases and select suitable design techniques.
4. **Add execution guidance when needed** — use optional Case-level `Runner Instructions` for constraints, tools, evidence, and comparison requirements; create `STEPS.md` only when an exact procedure is justified.
5. **Review readiness** — challenge missing oracle, data, environment, ownership, negative coverage, recovery, or traceability before execution.
6. **Execute** — run only ready cases against a recorded build and known starting state. Let the
   project-owned Runner Prompt and Case instructions define any specialized execution method.
7. **Record results** — append an immutable run row and suite-local evidence; link failures and blockers to a defect or explicit reason.
8. **Triage and retest** — preserve the failed run, execute a new run after change, and link both; never rewrite history into a pass.
9. **Status or report** — calculate facts first, then tailor the narrative for tester, test lead, release owner, or executive.
10. **Review or close** — validate exit criteria, residual risk, waivers, evidence retention, and regression obligations.

## Current assessment and recommended next action contract

- Do not use `First action` as a formal heading. Before acting, give a brief unlabelled progress update naming the initial operation only when it helps the user follow the work. It is execution visibility, not a summary of the current state.
- After readiness review, status, execution, triage, retest, or reporting, lead with **Current assessment**. Summarize the present quality conclusion, the decisive evidence or unknown, and the leading blocker or residual risk when one exists. Separate observed facts from judgment.
- If managed work remains and cannot continue immediately, follow with exactly one **Recommended next action**. Name the suite or Case ID when known, explain why it is next, and identify any unmet prerequisite or owner. Do not stop at an assessment or present a menu of generic possibilities.
- Select the recommendation from explicit user intent, entry blockers, business risk, dependencies, current-build coverage, defect severity, and retest/regression need; do not simply choose the next ID or the oldest card.
- If the recommended action is safe, in scope, and already authorized, perform it in the same turn and reassess instead of presenting it as advice. If user input, login, approval, data reset, or another external change is required, stop at that boundary and request the one concrete unblocker.
- When no executable test work remains, recommend the applicable quality-gate decision, residual-risk decision, or closure report. When the managed test effort is fully closed, omit the recommendation rather than inventing work.
- `Current assessment` and `Recommended next action` are derived response elements. Never persist them as case, suite, run, or root state, and use these exact English headings whenever the sections are shown.

## Studio

Launch Studio when the user asks to show or manage the test board, Kanban, Timeline, schedule, or run history. It binds to loopback only and prints a tokenized URL.

- `init` creates `RUNNER_PROMPT.md`, `studio.sh`, `studio.cmd`, `.env.local`, and `.gitignore` in the managed test root. From that root, use `./studio.sh` on macOS/Linux or `studio.cmd` on Windows; both pass the root explicitly to the installed Studio.
- `.env.local` contains only the installed skill path and is ignored by Git. `init` uses `~/...` when the skill is inside the current home directory and an absolute path otherwise. Launchers parse it as data, never source or execute it, expand only a leading `~/` (`~\` is also accepted by `studio.cmd`), and reject missing, duplicate, other relative, or invalid paths.

- **Kanban** separates case design state from the latest run result: Draft, Ready/Not run, Passed, Failed, Blocked, and Other.
- The Studio defaults to `All suites`. Its Suite toolbar filter scopes Kanban, Timeline, Runs, and run entry to one Suite when selected; aggregate metrics and the release gate remain root-wide.
- **Timeline** combines optional Case and Suite planning dates with a labeled weekly date scale, a neutral Suite start marker, an orange Suite target marker, case state, ownership, risk, design method, and latest-run context. Visible Suite dates establish the canvas even when Cases are unscheduled, and Suite markers span the full visible Case grid. Schedule changes never alter evidence or test results.
- **Runs** shows immutable execution history and provides a validated form for appending a run.
- **Case detail** emphasizes Objective, Runner Instructions, and Expected Outcome. It displays the concise, copy-ready Runner Prompt rendered by Test Manager core from the test root's optional `RUNNER_PROMPT.md`; the complete Case remains authoritative and the project owns presentation. The same prompt is available without Studio through `test-manager.mjs prompt <case-id>`.
- Studio may update `DRAFT / READY / RETIRED` and planned dates. It must pass the same validator; incomplete cases cannot be promoted to `READY`.
- A card cannot be dragged or edited into `PASS`. Only a new valid Run row with build, environment, data, executor, and required evidence can change the current result.

## State model and invariants

- `TESTING.md`, optional `RUNNER_PROMPT.md`, `SUITE.md`, `CASES.md`, and `RUNS.md` are authoritative. `RUNNER_PROMPT.md` controls presentation only; `SUITES.md` is the suite registry and `STATUS.md` is derived.
- Case design state is `DRAFT / READY / RETIRED`. Execution result is `PASS / FAIL / BLOCKED / SKIPPED / INVALID`. Never conflate readiness with result.
- `PASS` requires observable evidence against the expected outcome. `FAIL` and `BLOCKED` require a defect, blocker, or explicit reason. `INVALID` does not count as executed coverage.
- A case is not ready without a stable ID, objective, risk or requirement link, preconditions, data needs, expected outcome/oracle, priority, and test type.
- A run records environment, build, data identity, executor, time, result, and evidence. Preserve prior runs; correction or retest creates a new Run ID.
- Missing capability or UI entry is a product result, not a reason to delete the case or use a hidden write path to manufacture a pass.
- Test only the smallest level that can prove the risk. Use E2E for cross-boundary business outcomes, not as the default for every rule.
- UI/design findings accompany the task outcome and never replace functional assertions.

## QA workflow

Before planning or changing schemas, read [references/conventions.md](references/conventions.md). When designing coverage, read [references/test-design.md](references/test-design.md). When executing, triaging, gating, or reporting, read [references/execution-and-reporting.md](references/execution-and-reporting.md).

Apply risk-based QA:

1. Establish quality objectives, scope, non-goals, stakeholders, environments, data policy, and release decision authority.
2. Identify product and operational risks by impact, likelihood, detectability, reversibility, and exposure.
3. Choose test levels and design techniques that directly prove those risks.
4. Make entry and exit criteria observable. Unknown evidence remains unknown; it is not green.
5. Execute from a controlled start state, record actual behavior, and collect the minimum sufficient evidence.
6. Triage failures by business impact and reproducibility; distinguish product defect, environment defect, bad data, test defect, and unsupported capability.
7. Retest the fix and run impact-based regression. Do not close a defect from implementation claims alone.
8. Report coverage, results, blockers, residual risk, and release recommendation separately.

## Cases, runner instructions, and steps

Prefer outcome-oriented cases. A business E2E or exploratory case may be a natural-language mission plus oracle, allowing the tester or browser agent to discover the UI.

Use Case-level `Runner Instructions` to tell a human tester or browser agent how to execute without prescribing a brittle click sequence. Good instructions start with the concrete execution surface or tool, then define the safety boundary, evaluator order, comparison target, evidence discipline, and stop conditions in a few short commands. Test Manager core renders them with the project's `RUNNER_PROMPT.md`; core must not contain product names, URLs, project labels, product-specific execution profiles, extraction rules, or operational-UX metrics. Studio and exports consume the same projection; they do not own or duplicate it. `Runner Instructions` are optional and do not replace the oracle.

Keep classification concerns separate: Case `Type` identifies what or where the risk is proved,
regression is a coverage purpose, and `Automation` identifies the execution mechanism. Specialized
runner behavior belongs to the project-owned prompt or an independent skill, not a Test Manager
profile registry. Do not create sibling functional, regression, or integration tester skills inside
Test Manager; a distinct audit methodology remains an independent skill.

Add exact steps only when at least one applies:

- a regulated or safety-critical procedure must be reproducible;
- destructive or financial actions need a controlled sequence;
- a novice or external tester needs handoff detail;
- setup is fragile or multi-system;
- a defect reproduction requires exact ordering;
- the user explicitly requests procedural cases.

Do not encode CSS selectors, coordinates, or transient button locations as business expectations. Keep reusable setup in suite-level preconditions instead of copying it into every case.

## Mutation and validation

- Use `init`, `create-suite`, and `status --write` for their structural or derived changes. Edit authoritative Markdown deliberately, then run `validate` and `status --write`.
- Preserve user-authored content and unrelated suites. Never replace a populated root, silently rename stable IDs, or delete evidence during cleanup.
- Store secrets nowhere under `.tests`. Use opaque test-data IDs and redact tokens, credentials, personal data, payment details, and screenshots as needed.
- If execution changes external state, confirm the environment and authorized data scope before the first write. Stop on uncertain submission state before retrying a non-idempotent action.
- Report validation errors exactly. Do not mark a run passed merely to satisfy an exit gate.

## Reporting contract

Lead with the quality decision, then facts:

- scope/build/environment and data state;
- planned, ready, executed, passed, failed, blocked, skipped, and invalid counts;
- requirement/risk coverage and important gaps;
- open defects and blockers by severity;
- retest/regression status;
- residual risk, waivers, and release recommendation;
- links to suite Run IDs and evidence.

Separate facts, unknowns, judgment, and recommendation. A high pass rate never overrides an untested or failed critical risk.
