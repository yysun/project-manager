# Timeline Scroll Layout E2E Specification

## Scenario 1 - Keep a year-long date axis readable

Given packaged Project Manager Studio is launched with Timeline selected for a project whose
explicit schedule spans approximately one year

When the user views the weekly date header at desktop width and scrolls the timeline horizontally

Then adjacent weekly labels remain separated, the timeline exposes horizontal overflow, the first
label and each year transition include the year, and every header date retains its exact ISO date as
accessible text

## Scenario 2 - Freeze Task context and synchronize dates

Given the long-range Timeline contains scheduled tasks near both ends of the range

When the user scrolls the schedule body horizontally from the start toward the end

Then the Task column remains fixed, the date header moves by the same horizontal offset as every
schedule track, and task labels, bars, grid lines, and header ticks remain aligned

## Scenario 3 - Use page vertical scroll with a pinned date row

Given Timeline contains enough task rows to extend beyond the viewport and the application top bar
is sticky

When the user scrolls vertically through the task rows

Then the document is the vertical scroll surface, the Timeline has no height-limited inner vertical
scroller, and the Task/date header remains visible immediately below the application top bar until
the end of the Timeline section

## Scenario 4 - Preserve responsive and keyboard behavior

Given Timeline is open at desktop width and at a narrow phone width

When the user focuses the scrollable timeline region, scrolls horizontally, and vertically traverses
the page

Then focus is visible, the responsive Task column remains frozen without covering the visible date
axis, the measured sticky offset follows the current top-bar behavior, and the browser console shows
no errors

## Scenario 5 - Remove obsolete footer copy

Given the user can switch between Kanban and Timeline

When the user reaches the end of either view

Then no footer displays the folder-native state, evidence-backed detail, planning/status edit, or
disposition/schedule authority copy, and no empty footer spacing remains
