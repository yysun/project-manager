# Requirement: Timeline drag edge auto-scroll

## Problem

A Timeline row drag can only reach rows that are already on screen. The pointer has to stay
within the viewport for the drag to continue, so on a board with more rows than fit, moving a row
to a position outside the current view is impossible in one gesture. The operator has to drop the
row partway, scroll, pick it up again, and repeat — and on a long board that is several rounds of
drop-scroll-repeat for a single intended move.

Keyboard reordering already crosses the whole board one step at a time, so the pointer path is the
one that dead-ends at the viewport edge.

## Requirement

While a row drag is in progress, holding the pointer near the top or bottom edge of the viewport
scrolls the page continuously, so any row position in the project can be reached in one gesture.

- Approaching either vertical edge during a drag scrolls the page in that direction without
  requiring further pointer movement.
- Scrolling is continuous while the pointer stays in the edge zone, and its speed increases the
  further into the zone the pointer is, up to a bounded maximum.
- The dragged row stays under the pointer while the page scrolls beneath it.
- Rows that pass under a stationary pointer during auto-scroll are displaced exactly as they are
  when the pointer moves over them, so the drop position keeps tracking what is under the cursor.
- Auto-scroll stops when the pointer leaves the edge zone, when the drag ends by any route, and
  when the document can scroll no further in that direction.
- The top edge zone is measured from below the sticky application and Timeline headers, so the
  zone corresponds to where rows are actually visible rather than to area covered by the headers.
- Auto-scroll runs only during a row drag.

## Acceptance Criteria

- [x] During a row drag, holding the pointer within the bottom edge zone scrolls the page down
      with no further pointer movement, and the same holds for the top edge zone and upward.
- [x] Scroll speed is zero outside the edge zone, rises with depth into the zone, and never
      exceeds a bounded maximum.
- [x] The dragged row remains under the pointer throughout an auto-scroll, rather than drifting
      away as the page moves.
- [x] Rows crossing under a stationary pointer during auto-scroll are reordered by the same rule
      that applies to pointer movement, verified by the drop position changing without the pointer
      moving.
- [x] Auto-scroll stops on leaving the zone, on pointer release, on pointer cancel, and when the
      document reaches its scroll limit, leaving no timer or animation frame running.
- [x] The top edge zone begins below the sticky headers, so the first auto-scrolling position is
      one where rows are visible.
- [x] No auto-scroll occurs when no row drag is in progress.
- [x] A row can be dragged from a position on screen to a target that was off screen when the drag
      began, in a single uninterrupted gesture, and the resulting order persists on save.
- [x] The scroll-velocity rule is a pure, unit-tested function rather than logic embedded in the
      drag handler.
- [x] The project's test suite covers the velocity rule's boundaries and passes.

## Constraints

- The document is the vertical scroll surface: `.timeline-scroll` is deliberately
  `overflow-y: visible` and the Timeline has no height-limited inner vertical scroller. Auto-scroll
  must drive the window and must not reintroduce an inner vertical scroll container.
- Existing drag behaviour must be preserved: the window-bound gesture, the row following the
  pointer, the midpoint-based drop target, drag-versus-click suppression, and keyboard reordering.
- Auto-scroll must not run when the pointer is idle outside a drag, and must not leave a frame loop
  running after the drag ends.
- The scroll loop must not accumulate error in the dragged row's offset as the page scrolls.
- No new dependency for drag or scrolling behaviour.

## Non-Goals

- Horizontal auto-scroll along the schedule axis; row drags are vertical.
- Auto-scroll for the schedule bar drag, which moves along the horizontal axis.
- Scrolling an inner Timeline container, or adding one.
- Momentum, easing curves, or animated smooth-scrolling behaviour beyond a steady per-frame step.
- A configurable zone size or speed exposed to the operator.
