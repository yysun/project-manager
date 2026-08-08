# Project Manager Kanban Studio E2E Evidence

Executed on 2026-08-08 against a generated, validated `KANBAN-DEMO` project and isolated sibling.

## Browser and HTTP

- Token handshake redirected to a token-free URL; API requests used the session cookie.
- Desktop 1440×900: all five lanes rendered ten tasks covering every exact lifecycle state; totals,
  blockers, owner gaps, success evidence, and next-work rank matched the server projection.
- Search `analytics` reduced the visible card set to one and Clear filters restored the board.
- `TASK-PLAN` Check Changes passed without mutation; Save changed owner to `Rina`, regenerated
  `STATUS.md`, and refreshed the board.
- A dependency cycle edit returned `Dependency cycle includes TASK-PLAN`; two repeated checks left
  the exact tree revision unchanged at
  `5574c7c0d3404e855ed304ee1f13f4b1df967479c9525e271ea0edf7615568b5`.
- After a valid external project edit, the open task check returned
  `Project changed since this task was loaded`. Refresh displayed the authoritative edit with the
  explicit stale-`STATUS.md` warning and performed no write.
- Refreshing after an invalid external success-criteria edit replaced the entire board with the
  `Project could not be loaded` error state. The exact invalid-tree revision stayed unchanged at
  `d7fc95192d31a5dca28d68e9677b6faa7f8ad5b7fd1bb4b121456949cfcad144`.
- `TASK-INPROGRESS` exposed inspection and Copy LLM review command but no Save control.
- Clipboard value was
  `project validate-task "/private/var/.../pm-studio-cuByKu" TASK-INPROGRESS`; Studio made no model call.
- Phone 390×844: summary tiles, filters, horizontal lanes, cards, and task dialog remained usable.
- Keyboard dialog verification confirmed background content becomes inert, Shift+Tab from the first
  control wraps to Save, Tab wraps back to Close, Escape closes, and focus returns to the opening card.
- Browser console warnings/errors: none.
- Final screenshots: `desktop.png` (1440×900) and `phone.png` (390×844), captured from the packaged
  build after the invalid-refresh fallback fix.

## LLM task-quality route

The explicit folder first passed `project-validate.js --json`. `TASK-VAGUE` was then reviewed from
validated state.

### Blocking defects

- Outcome `Make launch better.` names no observable end state or bounded deliverable.
- Acceptance `Looks good.` is subjective and cannot be evidenced consistently.

### Recommendations

- Name the specific launch artifact or operating result that must change.
- Replace subjective approval with observable acceptance conditions and identify the approver or
  artifact that proves each one.
- Add constraints only after the intended scope is concrete.

### Strong properties

- The task is structurally valid, has a stable project-owned ID, and introduces no dependency cycle.
- Its default human approval evidence is valid once acceptance is made specific.

Exact pre/post tree revision remained
`16287ccd41edcbddb0d91f8f93985321b454c4d7f9c38b257e03a01e74b8ce52`; semantic review was read-only.
