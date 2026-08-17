# Timeline Drag Edge Auto-Scroll E2E Specification

## Scenario 1 - Reach a row below the fold in one gesture

Given packaged Project Manager Studio is showing a Timeline whose rows extend well beyond the
viewport, and the drag begins on a row visible at the top of the page

When the operator drags the row down to the bottom edge of the viewport and holds it there without
further pointer movement

Then the page scrolls downward continuously, the order keeps changing while the pointer is held
still, and releasing drops the row at a position that was off screen when the drag began

## Scenario 2 - Reach a row above the fold, below the sticky headers

Given the page is scrolled so that rows above the current view exist, and a row drag is in progress

When the operator moves the pointer to the top edge zone, measured from below the sticky application
and Timeline headers, and holds it there

Then the page scrolls upward continuously, the first auto-scrolling position is one where rows are
visible rather than covered by the headers, and the dragged row can be dropped above where the
viewport started

## Scenario 3 - Keep the dragged row under the pointer while the page moves

Given a row drag is auto-scrolling because the pointer is held in an edge zone

When the page scrolls beneath the pointer

Then the dragged row stays under the pointer rather than drifting away from it, and its offset shows
no accumulated error after the scroll

## Scenario 4 - Stop at the zone, at release, and at the document limit

Given a row drag is auto-scrolling

When the operator moves the pointer back out of the edge zone, and separately releases the pointer,
and separately holds at the edge until the document reaches its scroll limit

Then scrolling stops in each case, no further scrolling occurs once the drag has ended, and no
animation frame or timer is left running

## Scenario 5 - Leave everything else alone

Given Timeline is open and no row drag is in progress

When the operator moves the pointer to the top and bottom edges of the viewport, and separately
drags a schedule bar horizontally

Then no auto-scroll occurs in either case, the schedule bar drag behaves as before, and the Timeline
still has no inner vertical scroll container
