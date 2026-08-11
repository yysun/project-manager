# Persist Dashboard Panel State

## Summary

- Summary and Filters now persist their expanded/collapsed choices independently in guarded browser
  local storage and restore them on reload.
- Filters is an accessible native-hidden disclosure; collapsing it removes every filter control from
  view and accessibility navigation while leaving the disclosure operable.
- The Filters label sits directly above Search and aligns exactly with Priority at desktop, 800px,
  and phone widths; later controls wrap without separating the leading Search/Priority pair.
- Missing, malformed, partial, non-boolean, or unavailable storage falls back to both panels expanded
  without blocking Studio or subsequent control updates.
- The packaged Studio was rebuilt and the complete installable skill was synchronized globally.

## Verification

- `npm run typecheck` passed; focused panel-preference tests passed 4/4; post-review
  `npm run test:pm` passed 87/87; `npm run build` passed.
- Packaged-browser E2E passed at 1440×900, 800×900, and 390×844 for exact Filters/Priority alignment,
  independent reload restoration, collapsed accessibility, hidden active filters, project reset,
  Kanban/Timeline behavior, non-persisted filter values, and a clean console.
- `git diff --check`, skill validation, repository/global installation comparison, AR, CR, and VR all
  passed.

## Notes

- Filter values, project/view selection, scroll position, and dialogs remain intentionally
  non-persistent; no API, server state, dependency, schema, or account preference system was added.
