# Timeline drag edge auto-scroll

## Summary

- Holding a row drag near the top or bottom of the viewport now scrolls the page continuously, so a
  row can reach a position that was off screen when the drag began without dropping and re-grabbing.
- Auto-scroll drives the window, not an inner container: the Timeline deliberately has no
  height-limited vertical scroller, and `test-timeline-scroll-layout.md` Scenario 3 pins the
  document as the vertical scroll surface.
- The top edge zone is inset by the sticky application and Timeline headers, so the upward trigger
  sits where rows are actually visible rather than under a header.
- `edgeScrollVelocity` is a pure function in `timeline-model.mjs`: zero outside the zone, ramping
  with depth, clamped at a maximum, with the top zone measured from a caller-supplied inset.
- Each frame scrolls and then re-runs the ordinary move with an unchanged pointer position, so rows
  crossing under a held pointer are displaced by exactly the rule that applies to pointer movement,
  and the row keeps tracking the cursor as the page moves beneath it.
- The frame loop is owned by the drag rather than a React effect, and is armed from the pointer path
  so a drag that starts mid-viewport and reaches an edge later still scrolls.

## Verification

- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run test:pm` — 227 tests, 227 pass, 0 fail, including new `edgeScrollVelocity` cases for the
  middle, both zones, depth ramping, clamping past the edges, the sticky-header inset, a zero zone,
  and overlapping zones on a short viewport.
- `.docs/tests/test-timeline-drag-autoscroll.md` executed against a spawned Studio on a 60-row
  board: bottom edge scrolled 0 → 78 → 221 with the pointer held still while the dragged row
  travelled from index 0 to 13; the top edge zone at y=140, just below a 122px header bottom,
  scrolled 221 → 103 upward; the row stayed under the pointer at every checkpoint; scrolling stopped
  on leaving the zone, on release at the edge, on `pointercancel` mid-scroll, and at the document
  limit while the drag was still held; no auto-scroll occurred with no drag in progress; the
  schedule bar drag still produced its own schedule draft.
- Persistence: a row dragged from position 1 to an off-screen target in one gesture saved as
  `order: 14` in `TASKS.md`.
- Layout contract re-checked live: `.timeline-scroll` has no vertical overflow (scrollHeight equals
  clientHeight) and the document scrolls.

## Notes

- CR caught the frame loop calling the `moveRowTo` closure captured when it was armed, which would
  have reordered against a stale sequence and row order on every frame after the first commit; it
  now calls the current closure through a ref.
- AR caught two plan flaws before implementation: hanging the loop off an effect whose cleanup runs
  every render, which would have killed auto-scroll on each committed move, and arming the loop only
  at pick-up so a drag starting mid-viewport could never reach the zone.
- `requestAnimationFrame` does not fire while the automation browser pane is hidden, so E2E frames
  were pumped with screenshots; this is a harness artifact, not product behaviour.
- Edge auto-scroll is vertical only. Horizontal auto-scroll along the schedule axis and auto-scroll
  for the schedule bar drag remain non-goals.
