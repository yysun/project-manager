# Project Manager Kanban Studio E2E Specification

Use `node tests/project-manager-studio/create-browser-fixture.js` to create the selected project and
sibling. Use 1440×900 for desktop and 390×844 for phone checks. Save browser evidence under
`.docs/tests/results/project-manager-kanban/`.

## Scenario 1 - Launch one selected project securely

Given the generated valid project and its different sibling project

When `project studio <selected-folder>` launches Studio

Then the host resolves the installed skill-relative server, passes exactly the selected folder,
reports a tokenized `127.0.0.1` URL, loads only the selected project, and leaves both project trees
byte-identical

## Scenario 2 - Enforce the browser session

Given the generated project and a running Studio server

When a client performs the token handshake and also attempts API access without the resulting cookie

Then the handshake redirects to a token-free URL with an HttpOnly SameSite=Strict cookie, the
unauthenticated request returns 401 with no project data, and two independent launches expose
different 64-character lowercase hexadecimal tokens

## Scenario 3 - Scan exact work state without lifecycle lies

Given the generated project contains tasks across all seven lifecycle states plus explicit and
dependency blockers

When the board loads at 1440×900

Then every task appears once in Planned, Ready, Active, Verified, or Done; every card retains its
exact lifecycle badge; totals, owner gaps, success coverage, priority, milestone, blockers, and
next-work emphasis match engine facts; absent optional facts remain unconfigured; and no card is
draggable

## Scenario 4 - Filter the board

Given the loaded board contains different titles, IDs, priorities, owners, and blockers

When the user searches, selects priority and owner filters, and toggles blocked-only

Then only matching cards remain, every lane count reflects the filtered set, and empty lanes explain
that the current filters removed their tasks

## Scenario 5 - Inspect a task

Given a visible task has outcome, acceptance, executor, dependency, blocker, milestone, date, and
evidence-pointer detail

When the user opens its card and then closes the semantic task dialog with Escape

Then the dialog shows each fact without inventing missing values and focus returns to the card that
opened it

## Scenario 6 - Check and save an eligible task

Given a never-started planned task has no attempt or re-verification history and has narrative,
dependencies, blockers, acceptance, and an immutable ID

When the user edits allowlisted fields, activates Check Changes, and then saves

Then check reports candidate validity without changing live bytes, save atomically updates task and
derived status data, reverse links remain exact, narrative and unrelated content remain present,
the dialog receives new revisions, and the refreshed board shows the saved result

## Scenario 7 - Reject an invalid edit

Given an eligible task editor is open with captured project and task revisions

When the user creates an invalid dependency and activates Check Changes

Then Studio returns actionable deterministic errors and the complete live project stays byte-identical

## Scenario 8 - Reject a stale edit

Given an eligible task editor is open with captured project and task revisions

When an external project-manager operation changes the project before the user checks or saves

Then Studio returns a conflict with current revisions and does not overwrite the newer live project

## Scenario 9 - Keep evidence-backed work outside Studio editing

Given the board includes contract-bound and evidence-backed tasks

When the user opens those task dialogs

Then every task remains inspectable, editing controls are disabled with a reason directing changes
through `project update`, immutable attempt bytes remain unchanged, and no control offers an
unsupported evidence transition

## Scenario 10 - Copy the semantic review command

Given one editable never-started task dialog and one read-only historical task dialog are available

When the user activates Copy LLM review command once in each dialog

Then Studio copies the matching `project validate-task <absolute-selected-folder> <task-id>` for both
task classes, confirms each copy, and makes no model call or project mutation

## Scenario 11 - Execute semantic task validation

Given generated task `TASK-VAGUE` is structurally valid but has weak outcome or acceptance wording
and the project tree hash is recorded

When an agent host executes `project validate-task <selected-folder> TASK-VAGUE`

Then the skill first validates the explicit project, judges outcome clarity, acceptance testability,
scope, dependencies, constraints, and evidence quality, separates blocking defects,
recommendations, and strong properties, applies no revisions, and leaves the tree hash unchanged

## Scenario 12 - Refresh a valid external change without writing

Given Studio is open on a valid project snapshot

When the selected project tree hash is recorded, an external project-manager operation changes state
and regenerates `STATUS.md`, the new hash is recorded, and the user activates Refresh

Then Studio shows the new validated snapshot and a post-refresh tree hash remains identical to the
post-operation hash

## Scenario 13 - Surface invalid external state without writing

Given Studio is open and an external edit makes the selected project invalid

When the invalid tree hash is recorded and the user activates Refresh

Then Studio shows the structured validation error, does not fall back to an old snapshot, and leaves
the invalid tree hash unchanged

## Scenario 14 - Surface stale derived status without writing

Given Studio is open and an external edit changes authoritative task state without regenerating
`STATUS.md`

When the stale tree hash is recorded and the user activates Refresh

Then Studio shows the newly validated authoritative state with a stale-status warning and leaves the
stale tree hash unchanged

## Scenario 15 - Remain usable on phone and keyboard

Given the board is open at 390×844

When the user navigates summaries, filters, lanes, cards, dialog fields, Check Changes, Save, copy,
and close controls by keyboard

Then focus remains visible, controls expose meaningful roles and names, lanes scroll without
overlapping or clipping primary content, the dialog remains operable, and browser console inspection
reports no runtime error
