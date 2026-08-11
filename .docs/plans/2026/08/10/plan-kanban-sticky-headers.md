# Kanban Sticky Headers Plan

## Goal

Keep Kanban lifecycle context visible during page scrolling without allowing the lane-title row to
overlap the application header or drift away from horizontally scrolled lane bodies.

## Current Context

- `src/project-manager-studio/client/App.tsx` renders the application header, filters, six-lane
  Kanban board, lane headings/counts, and Timeline sibling view.
- `src/project-manager-studio/client/styles.css` makes `.board` both the six-column grid and the
  horizontal overflow container. Each `.lane>header` currently scrolls with its lane.
- A sticky descendant inside `.board` would use that overflow element as its nearest scrolling
  ancestor and would not reliably follow document vertical scrolling.
- `src/project-manager-studio/client/components/Timeline.tsx` already measures `.topbar` with
  `ResizeObserver` and places its sticky date header below the measured height, using zero when the
  responsive top bar is not sticky.
- The current worktree is clean at commit `2a2c7d6`. The root package provides unambiguous
  `typecheck`, `build`, and `test:pm` commands, and packaged Studio output lives under
  `skills/project-manager/studio/dist/`.

## Decisions

- Split Kanban into a sticky lane-title viewport and a separate horizontally scrollable lane-body
  viewport, matching the proven Timeline header/body architecture. Do not attempt sticky lane
  headings inside the horizontal overflow element.
- Keep one canonical lane-title row. Move, rather than duplicate, the existing title/count markup;
  retain stable heading IDs so each lane remains labelled through `aria-labelledby`.
- Measure `.topbar` once in `App.tsx` through a ref and `ResizeObserver`. Pass that value to Timeline
  and use it for the Kanban sticky row so both views share one responsive boundary and observer.
- Synchronize the clipped Kanban header viewport's `scrollLeft` from the keyboard-focusable lane-body
  scroll region. Use identical grid templates, gaps, padding, and responsive widths for exact
  alignment.
- Keep page-level vertical scrolling, existing card/lane rendering, counts, filters, dialog behavior,
  and phone-width columns unchanged.
- Add no feature flag, fallback mode, environment variable, dependency, compatibility layer, custom
  scrollbar, drag-and-drop behavior, or broad Kanban redesign.

## Phased Tasks

### Phase 1 - Scope and layout boundary

- [x] Inspect `App.tsx`, `Timeline.tsx`, and Kanban rules in `styles.css` to confirm the application
      header, lane-title markup, horizontal overflow, and sticky offset ownership.
- [x] Confirm `.board` horizontal overflow is the structural blocker for viewport-relative sticky
      lane headers and that page-level vertical scrolling must remain unchanged.
- [x] Record task-card freezing, virtualization, lane reordering, drag-and-drop, and filter changes as
      non-goals so the implementation remains layout-only.

### Phase 2 - Shared sticky offset and Kanban structure

- [x] Move responsive top-bar measurement into `App.tsx`, bind it to the real `.topbar` element, and
      pass the measured sticky offset into `Timeline.tsx` without changing Timeline behavior.
- [x] Restructure the Kanban markup in `App.tsx` into one sticky heading/count grid and one
      horizontally scrollable lane-body grid while preserving stable lane heading IDs.
- [x] Synchronize Kanban header `scrollLeft` from the lane-body region and keep that region keyboard
      focusable with a meaningful accessible name.

### Phase 3 - Visual and responsive behavior

- [x] Update `styles.css` with matched Kanban header/body grid geometry, a sticky row below the shared
      offset, visible focus for the scroll region, and unchanged desktop lane minimum widths.
- [x] Update narrow-width Kanban rules so 84vw lane/header columns remain aligned and the sticky row
      uses viewport top when the application header becomes relative.
- [x] Inspect Kanban cards, filters, counts, empty states, lane labelling, dialogs, and Timeline sticky
      positioning to confirm no unplanned behavior or compatibility path was introduced.

### Phase 4 - Verification and packaged delivery

- [x] Run `npm run typecheck`, `npm run test:pm`, and `npm run build`; fix relevant failures and record
      zero-error, complete-pass, and successful packaged-asset evidence.
- [x] Execute `.docs/tests/test-kanban-sticky-headers.md` in the packaged Studio at desktop,
      intermediate, and phone widths, recording vertical offsets, horizontal alignment, focus,
      accessibility associations, and browser console state.
- [x] Run `git diff --check`, validate `skills/project-manager`, inspect the scoped diff, and sync the
      complete rebuilt `skills/project-manager/` directory to the global installation.

## Validation

- `npm run typecheck` exits 0 without TypeScript diagnostics.
- `npm run test:pm` exits 0 with every project-manager and Studio test passing.
- `npm run build` exits 0 and regenerates the packaged Studio assets.
- `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager`
  prints `Skill is valid!`.
- `git diff --check` exits 0 and repository/global skill trees match after synchronization.
- Browser E2E follows `.docs/tests/test-kanban-sticky-headers.md` with a multi-row fixture and records
  exact header-boundary and header/body-alignment evidence with no runtime console errors.

## Rollback / Risk

- Sticky positioning fails if the heading row remains inside the horizontal overflow element. Keep
  the sticky row outside the lane-body scroller and the overall Kanban section overflow visible.
- Header/body alignment drifts if templates, gaps, padding, or responsive widths differ. Both grids
  must use the same values and one synchronized horizontal offset.
- Centralizing top-bar measurement could regress Timeline if its offset or mobile zero behavior
  changes. Browser E2E must cover both Kanban and Timeline boundaries after the refactor.
- Separate heading markup can weaken lane semantics if IDs or `aria-labelledby` are lost. Preserve
  the existing stable IDs and verify each section's accessible name.
- Rollback reverts `App.tsx`, `Timeline.tsx`, `styles.css`, and matching generated assets together.
  No data migration or persistence rollback is required.
