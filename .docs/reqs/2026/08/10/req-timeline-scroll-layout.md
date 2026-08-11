# Timeline Scroll Layout

## Problem

Project Manager Studio compresses every weekly date label into a fixed-width timeline canvas. Long
project ranges make the dates overlap until the header is unreadable. The Timeline also traps rows
inside a height-limited scrolling box, which conflicts with the page-level vertical flow used by
Kanban and makes long task lists harder to scan.

The task context and date context must remain visible while users move through a large schedule.
The existing footer repeats implementation-policy copy without helping the current task.

## Requirement

Make Timeline scale horizontally with its explicit date range instead of compressing weekly labels.
Only the schedule axis scrolls horizontally; the Task column remains frozen. Timeline rows extend
through the document and use the page's vertical scroll, while the date header remains pinned below
the sticky application header and stays horizontally synchronized with the schedule rows.

Remove the footer copy from Studio in both Kanban and Timeline views.

## Acceptance Criteria

- [x] A long explicit project range allocates enough width per weekly tick that adjacent date labels
      do not overlap and exposes horizontal timeline scrolling instead of shrinking the date axis.
- [x] Horizontal scrolling keeps the Task column fixed while moving the date header and every
      schedule row by the same amount.
- [x] Timeline has no height cap or independent vertical scrolling box; long task lists extend the
      document and use the same page-level vertical scroll behavior as Kanban.
- [x] While the Timeline section is in view, its Task/date header remains pinned below the sticky
      application header, including when that header changes height responsively.
- [x] Weekly labels use concise human-readable dates, retain the exact date as accessible text, and
      show a year when the range begins or crosses into a new year.
- [x] The Studio footer containing folder-native state and edit-authority copy is absent from both
      views, with no empty footer spacing left behind.
- [x] Typecheck, automated regression tests, production build, browser E2E verification, and the
      packaged installable Studio all reflect the new layout behavior.

## Constraints

- Preserve the existing schedule range, marker, bar geometry, drag/resize, filters, dialog, and
  revision-safe save behavior.
- Preserve keyboard access and visible focus for the scrollable timeline region and task controls.
- Keep the existing responsive Task-column widths and visual system.
- Do not infer dates, alter project records, or change any schedule persistence contract.
- The installable `skills/project-manager/` directory must be rebuilt and synchronized to the global
  installation after source changes.

## Non-Goals

- Timeline zoom controls, day/month view switching, virtualized rows, auto-scrolling to today, or a
  custom scrollbar.
- Changes to Kanban layout, project/task schemas, schedule authority, or lifecycle authority.
- New dependencies, feature flags, fallback modes, environment variables, or compatibility layers.
