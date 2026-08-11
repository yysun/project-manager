# Kanban Sticky Headers E2E Specification

## Scenario 1 - Pin the lane-title row below the application header

Given packaged Project Manager Studio is open in Kanban with enough task cards to extend the page
beyond the desktop viewport

When the user scrolls vertically through the board

Then the complete six-lane title/count row remains visible, its top edge equals the application
header's bottom edge, and no lane title renders underneath or inside the application header

## Scenario 2 - Keep titles aligned during horizontal scrolling

Given the Kanban board is narrower than its six lane columns

When the user scrolls the lane-body region horizontally

Then the title row moves by the same horizontal offset, every title/count remains aligned with its
corresponding lane body, and the lane-body scroll region retains visible keyboard focus

## Scenario 3 - Preserve responsive sticky boundaries

Given Kanban is open at desktop width, an intermediate width where the application header wraps but
remains sticky, and phone width where the application header is relative

When the user scrolls vertically through the board at each width

Then the title row uses the measured application-header bottom at desktop and intermediate widths,
uses viewport top at phone width, preserves the existing responsive column widths, and never leaves
obsolete top spacing

## Scenario 4 - Preserve Kanban and Timeline behavior

Given the user can switch between Kanban and Timeline with filters and task dialogs available

When the user filters tasks, inspects lane names/counts, opens a task, closes it, and switches to
Timeline

Then lane counts and cards remain truthful, every lane section retains its accessible heading,
filters and dialogs still work, Timeline's sticky date row still respects the same application-header
boundary, and the browser console reports no errors

## Execution Evidence — 2026-08-10

- Packaged Studio fixture: `KANBAN-DEMO`, 20 task cards, six lifecycle lanes.
- Desktop, 1440×900 after 760 px page scroll: sticky row top `84`, topbar bottom `84`; six
  headings and six labelled lane regions present. After horizontal auto-scroll, body and header were
  both at `scrollLeft=157` and first/last alignment deltas were `0`.
- Intermediate, 800×900 after 760 px page scroll: wrapped sticky topbar bottom `156`, sticky row top
  `156`; first/last alignment deltas were `0`.
- Phone, 390×844 after 760 px page scroll: topbar computed `position: relative`, sticky row top and
  inline offset were `0`; header and lane widths both measured `327.59375` px (84vw). After horizontal
  auto-scroll, body and header were both at `scrollLeft=1663.5` and first/last deltas were `0`.
- Keyboard targeting marked the named board region active; its committed `:focus-visible` rule uses a
  3 px outline. The accessibility snapshot exposed six `h2` headings and lane regions named Planned,
  Ready, Active, Done, Deferred, and Cancelled.
- Filtering to `TASK-LAUNCH` produced one visible card and lane counts `1,0,0,0,0,0`; clearing the
  filter restored cards and the Shape launch brief dialog opened successfully.
- Timeline regression check at 1440×900: date-header top `84`, topbar bottom `84`, shared inline
  offset `84px`. No runtime error state appeared during navigation or interactions.
