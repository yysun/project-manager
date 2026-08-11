# Timeline Scroll Layout Plan

## Goal

Keep long timelines readable and navigable by separating horizontal schedule movement from page
vertical movement, while preserving visible task and date context and removing the obsolete footer.

## Current Context

- `src/project-manager-studio/client/components/Timeline.tsx` renders one CSS grid containing the
  sticky Task header, date scale, Task labels, and schedule tracks. The original implementation
  gave the date axis a fixed 1020px minimum regardless of the number of weeks.
- `src/project-manager-studio/client/styles.css` originally used `overflow:auto` and `max-height:66vh`
  on `.timeline-scroll`, coupling horizontal movement to an independent vertical scrolling box.
- `.timeline-label` already supplies the frozen left column, and timeline bar geometry is expressed
  as percentages of the explicit UTC range in `timeline-model.mjs`.
- `src/project-manager-studio/client/App.tsx` renders the footer after either main view and owns the
  responsive sticky `.topbar` whose actual height determines the safe sticky date-header offset.
- `tests/project-manager-studio/timeline-model.test.js` is the focused pure-geometry regression
  location. The root package provides unambiguous `typecheck`, `build`, and `test:pm` commands.
- The current worktree contains an uncommitted candidate implementation created before RPD was
  explicitly invoked. SS must reconcile it against this plan after AR passes rather than assume it
  is correct.

## Decisions

- Derive a minimum date-canvas width from the inclusive range at 88px per weekly tick, while keeping
  the existing 1020px minimum for short ranges. This fixes the causal compression without adding a
  zoom model or changing schedule geometry.
- Render the pinned header outside the horizontally scrollable row body. Mirror the body's
  `scrollLeft` into a clipped header viewport so dates and tracks stay aligned while Task context
  remains fixed.
- Measure the existing top bar with `ResizeObserver` and use zero offset when the responsive top bar
  is no longer sticky. Reject fixed breakpoint-specific offsets because the top bar has dynamic
  content and wraps at intermediate widths.
- Remove the Timeline height cap and vertical containment. Retain horizontal overflow on the row
  body and page-level document scrolling for rows.
- Shorten weekly labels to month/day, adding the year at the first tick and year boundaries. Preserve
  the ISO date through accessible naming and a title.
- Delete the footer markup and obsolete footer CSS. Do not relocate or replace the copy.
- Add no feature flag, fallback mode, environment variable, dependency, compatibility layer, zoom
  control, or broad layout refactor.

## Phased Tasks

### Phase 1 - Scope and causal layout model

- [x] Confirm `Timeline.tsx`, `styles.css`, `App.tsx`, and `timeline-model.mjs` are the complete
      rendering path for the date canvas, sticky context, page scroll, and footer.
- [x] Confirm the fixed 1020px date canvas and `max-height:66vh` overflow container are the causes of
      overlapping labels and boxed vertical scrolling.
- [x] Record zoom controls, virtualization, custom scrollbars, schema changes, and Kanban redesign as
      non-goals so the implementation stays surgical.

### Phase 2 - Timeline sizing and sticky structure

- [x] Add a pure range-to-content-width helper in `timeline-model.mjs` and its declaration so long
      ranges receive a stable minimum weekly width without changing UTC date or bar geometry.
- [x] Restructure `Timeline.tsx` into a sticky Task/date header plus a horizontally scrollable row
      body, synchronizing header `scrollLeft` from the body and retaining a keyboard-focusable region.
- [x] Measure the actual `.topbar` height in `Timeline.tsx` so the timeline header pins below a sticky
      top bar and returns to viewport top when the responsive top bar is not sticky.
- [x] Update weekly date rendering in `Timeline.tsx` to use concise UTC labels with accessible exact
      dates and explicit year transitions.

### Phase 3 - Page flow, responsive behavior, and footer removal

- [x] Update timeline rules in `styles.css` so only the schedule axis scrolls horizontally, rows have
      no height cap, the sticky header is outside overflow containment, and the Task column widths
      remain 300px desktop and 230px phone.
- [x] Remove the footer from `App.tsx` and delete `.footer-note` base and responsive rules so neither
      view leaves obsolete copy or spacing.
- [x] Inspect the implementation for unchanged schedule bars, markers, drag/resize controls, shared
      filters, and task dialog behavior, and remove any unplanned compatibility or fallback path.

### Phase 4 - Regression coverage and packaged delivery

- [x] Add a focused `timelineContentWidth` regression in
      `tests/project-manager-studio/timeline-model.test.js` for short and year-long ranges.
- [x] Run `npm run typecheck`, `npm run test:pm`, and `npm run build`; fix relevant failures and record
      zero-error, complete-pass, and successful packaged-asset evidence.
- [x] Execute `.docs/tests/test-timeline-scroll-layout.md` in the packaged Studio at desktop and
      narrow widths, checking horizontal alignment, frozen Task context, page scroll, sticky header,
      footer absence, focusability, and console errors.
- [x] Run `git diff --check`, validate `skills/project-manager`, inspect the scoped diff, and sync the
      complete rebuilt `skills/project-manager/` directory to the global installation.

## Validation

- `npm run typecheck` exits 0 without TypeScript diagnostics.
- `npm run test:pm` exits 0 with every project-manager and Studio test passing.
- `npm run build` exits 0 and regenerates the packaged server and client assets.
- `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager`
  prints `Skill is valid!`.
- `git diff --check` exits 0.
- Browser E2E follows `.docs/tests/test-timeline-scroll-layout.md` using a long-range, multi-row
  fixture and records desktop and narrow-width evidence with no runtime console errors.

## Rollback / Risk

- Sticky positioning fails when an overflow ancestor captures the vertical sticky context. Keeping
  the header outside the horizontal overflow element and the panel overflow visible is required.
- Header/body synchronization can drift if their content widths or Task-column widths differ. Both
  must use the same derived CSS width and matching responsive column values.
- A fixed sticky offset would overlap a wrapped top bar. Runtime measurement must be disconnected on
  unmount and respond to both resize and top-bar size changes.
- Expanding a year-long date axis intentionally increases horizontal width. Rollback reverts the
  helper, split header, page-flow CSS, and matching generated assets together.
- No data migration or persistence rollback is required because this story changes presentation only.
