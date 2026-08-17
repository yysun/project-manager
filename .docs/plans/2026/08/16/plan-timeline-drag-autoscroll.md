# Plan: Timeline drag edge auto-scroll

## Goal

While a Timeline row drag is in progress, holding the pointer near the top or bottom of the
viewport scrolls the window continuously, so any row position can be reached in one gesture. The
dragged row stays under the pointer and rows crossing beneath it are displaced by the existing
midpoint rule.

## Current Context

Read during planning:

- `src/project-manager-studio/client/styles.css` line 33 — `.timeline-scroll` is
  `overflow-x:auto; overflow-y:visible`. The Timeline deliberately has no inner vertical scroller;
  `.docs/tests/test-timeline-scroll-layout.md` Scenario 3 pins this as required behaviour: "the
  document is the vertical scroll surface". Auto-scroll must therefore drive `window`, and must not
  introduce an inner vertical scroll container.
- `src/project-manager-studio/client/components/Timeline.tsx`
  - The drag gesture is already bound to `window` (`pointermove` / `pointerup` / `pointercancel`)
    in an effect gated on `dragging`, so the auto-scroll loop has an obvious lifecycle to attach to
    and tear down with.
  - `moveRowTo(pointerY)` records `current.pointerY`, calls `trackPointer()`, then resolves the drop
    target through `dropTargetIndex` and commits with `moveTaskOrder`. Auto-scroll needs exactly the
    same work re-run with an unchanged `pointerY`, so a frame step can reuse `moveRowTo`.
  - `trackPointer()` recovers the row's laid-out position as `rect.top - current.offset` and writes
    `translateY` straight to the DOM. Because it re-derives from the live rect every time, it is
    already correct when the page scrolls underneath the row and cannot accumulate drift.
  - `rowDrag.current` holds `pointerY`, so a frame loop has the last pointer position without
    needing a new event.
  - `stickyTop` is passed in from `App.tsx` (measured topbar height) and the Timeline sticky header
    sits directly beneath it; both cover the top of the viewport, so the top edge zone must start
    below them.
- `src/project-manager-studio/client/timeline-model.mjs` — holds the pure, unit-tested geometry
  (`dropTargetIndex`, `moveTaskOrder`, `stepTaskOrder`). The velocity rule belongs here for the same
  reason.
- `tests/project-manager-studio/timeline-model.test.js` — the matching unit-test home; the model is
  imported dynamically as an ES module in each test.

Known unknowns going in: none blocking. `document.documentElement.scrollHeight`/`clientHeight` give
the scroll limit, and `window.scrollBy` is sufficient; no measurement is required that the drag does
not already perform.

## Decisions

- **Auto-scroll drives `window`, never an inner container.** This follows the existing, deliberate
  layout contract. Rejected: making `.timeline-scroll` vertically scrollable, which would contradict
  `test-timeline-scroll-layout.md` Scenario 3 and re-break the sticky header behaviour that story
  fixed.
- **The velocity rule is a pure function, `edgeScrollVelocity`, in `timeline-model.mjs`.** It takes
  the pointer position, the viewport bounds and the usable top inset, and returns signed pixels per
  frame. This is the part with boundaries worth testing; the loop around it is glue. Consistent with
  `dropTargetIndex` being extracted for the same reason.
- **Speed ramps linearly with depth into the zone, to a capped maximum.** Simple, predictable, and
  bounded. Rejected: easing curves and momentum, which the REQ lists as non-goals.
- **The top zone is inset by the sticky headers.** The usable top is the bottom of the Timeline
  sticky header, so the zone sits where rows are actually visible instead of under the headers.
- **A frame step reuses `moveRowTo(current.pointerY)`** rather than duplicating the track-and-commit
  sequence, so auto-scroll and pointer movement cannot diverge in how they displace rows.
- **The loop is owned imperatively by the drag, not by a React effect.** The window-listener effect
  deliberately has no dependency array so its closures stay fresh, which means it re-subscribes on
  every render — and a drag re-renders on every committed move. Cancelling a pending frame in that
  cleanup would kill an in-flight auto-scroll each time a row was displaced. The frame id therefore
  lives in the drag ref, is started from the pointer path, and is cancelled in `finishRow` plus a
  mount-scoped unmount effect.
- **The loop is (re)armed on every pointer move, not only when the drag starts.** A drag begins in
  the middle of the viewport and reaches the zone later, so arming only at pick-up would never fire.
  The step is self-perpetuating while velocity is non-zero and stops itself at zero.
- **`requestAnimationFrame`, not a timer.** It matches the browser's paint cadence and stops
  naturally in background tabs.
- Rejected outright: a feature flag, configurable zone size or speed, horizontal auto-scroll, and
  auto-scroll for the schedule bar drag.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Confirm in `styles.css` and `.docs/tests/test-timeline-scroll-layout.md` that the document is
      the vertical scroll surface, so the loop must scroll `window`.
- [x] Confirm `trackPointer()` re-derives the row offset from the live rect, so it stays correct
      while the page scrolls and needs no drift correction.
- [x] Record the rejected alternatives (inner vertical scroller, easing/momentum, configurable zone,
      horizontal auto-scroll) so implementation does not introduce them.

### Phase 2 - Pure velocity rule

- [x] Add `edgeScrollVelocity(pointerY, viewport, options)` to
      `src/project-manager-studio/client/timeline-model.mjs`, returning signed pixels per frame:
      negative near the top, positive near the bottom, zero in between.
- [x] Make the magnitude ramp with depth into the zone and clamp at a maximum, with the top zone
      measured from a caller-supplied inset rather than from viewport zero.
- [x] Declare `edgeScrollVelocity` in `src/project-manager-studio/client/timeline-model.d.mts`.

### Phase 3 - Drag loop integration

- [x] Track the usable top inset in `Timeline.tsx` by measuring the sticky header's bottom edge, so
      the top zone starts below the application and Timeline headers.
- [x] Add a self-perpetuating `requestAnimationFrame` step that scrolls the window by the velocity
      and then re-runs `moveRowTo(current.pointerY)`, so the row tracks and rows crossing under a
      stationary pointer are displaced by the same rule as pointer movement.
- [x] Arm the step from the pointer path on every move, not only at pick-up, so a drag that starts
      mid-viewport and reaches the zone later still scrolls; keep the pending frame id on the drag
      ref so re-arming cannot stack two loops.
- [x] Stop the step when velocity reaches zero and when the document cannot scroll further in that
      direction, and cancel any pending frame in `finishRow` and in a mount-scoped unmount effect —
      deliberately not in the window-listener effect, whose cleanup runs on every render and would
      otherwise kill an in-flight auto-scroll on each committed move.
- [x] Confirm no inner vertical scroll container was introduced and the schedule bar drag is
      untouched.

### Phase 4 - Tests and verification wiring

- [x] Add `timeline-model.test.js` cases for `edgeScrollVelocity`: zero in the middle, negative in
      the top zone and positive in the bottom zone, magnitude rising with depth, clamped at the
      maximum, and the top zone honouring the sticky-header inset.
- [x] Run `npm run typecheck` and record the result.
- [x] Run `npm run build` and record the result.
- [x] Run `npm run test:pm` and record the pass/fail counts.
- [x] Execute `.docs/tests/test-timeline-drag-autoscroll.md` against a spawned Studio on a board
      taller than the viewport, recording scroll position and resulting order.

### Phase 5 - Documentation and status

- [x] Update the Studio paragraph in `skills/project-manager/SKILL.md` only if the reorder
      description needs the reach-off-screen behaviour stated; leave it unchanged otherwise.
- [x] Record final evidence showing a row dragged to an off-screen target in one gesture, with the
      order persisting on save.

## Validation

- `npm run typecheck` — must pass with no errors.
- `npm run build` — must complete.
- `npm run test:pm` — must pass, including the new `edgeScrollVelocity` cases.
- E2E scenarios in `.docs/tests/test-timeline-drag-autoscroll.md` executed against a spawned Studio
  on a 60-row board, with `window.scrollY` recorded before and after a held-at-edge drag and the
  saved order read back from `TASKS.md`.
- Teardown evidence: after a drag ends, no animation frame remains scheduled and `window.scrollY`
  stops changing.

## Rollback / Risk

- **Runaway loop** is the main risk: a frame loop that outlives the drag would scroll the page
  continuously and be very visible. It is contained by starting the loop only while `dragging` is
  set and cancelling the pending frame in that same effect's cleanup, which already runs on release,
  cancel, and unmount.
- **Offset drift** while scrolling is contained by `trackPointer()` re-deriving from the live rect
  each frame rather than accumulating deltas.
- **Feedback between scrolling and reordering**: each frame both scrolls and may commit a move,
  which relays the grid out. The existing layout effect rebases the row before paint, so the frame
  order is scroll, then track, then commit, then rebase.
- Auto-scroll is purely additive to the drag; reverting the loop restores the current behaviour
  without touching persistence, the API, or the stored order.
