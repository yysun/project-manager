# Kanban Sticky Headers

## Problem

Project Manager Studio's Kanban lane titles scroll out of view as users move down a lane with many
tasks. Once the title row disappears, users lose the lifecycle state and task count for each column.
A simple sticky rule is insufficient because the board's horizontal overflow container captures
sticky positioning and can let the lane titles collide with or disappear behind the application
header.

## Requirement

Keep the complete Kanban lane-title row visible while the user scrolls vertically through the board.
The title row must remain immediately below the application header whenever that header is sticky,
must use the viewport top when the responsive application header is not sticky, and must never render
inside or underneath the application header.

Horizontal scrolling must keep every lane title and count aligned with its corresponding task column.

## Acceptance Criteria

- [x] The Planned, Ready, Active, Done, Deferred, and Cancelled lane titles and counts remain visible
      as one sticky row while the user scrolls vertically through the Kanban board.
- [x] At widths where the application header is sticky, the Kanban title row pins immediately below
      its measured bottom edge without overlap, clipping, or a hard-coded breakpoint offset.
- [x] At narrow widths where the application header is not sticky, the Kanban title row pins to the
      viewport top without leaving obsolete header spacing.
- [x] Horizontal Kanban scrolling moves the title row by exactly the same offset as the lane bodies,
      preserving one-to-one title/count-to-column alignment.
- [x] Kanban task cards, lane order, counts, filters, empty states, task dialogs, and responsive column
      widths retain their existing behavior and accessibility.
- [x] Typecheck, automated tests, production build, packaged browser E2E verification, skill
      validation, and the globally installed Studio all reflect the sticky Kanban header behavior.

## Constraints

- Preserve page-level vertical scrolling and the existing horizontal Kanban scroll surface.
- Preserve the Timeline sticky date row and reuse the same responsive application-header boundary.
- Keep each lane section associated with its visible heading for assistive technology.
- Make no project, task, schedule, lifecycle, API, schema, persistence, or security changes.
- Rebuild and synchronize the complete installable `skills/project-manager/` directory after source
  changes.

## Non-Goals

- Frozen task cards, vertical virtualization, lane reordering, drag-and-drop, swimlanes, collapsed
  lanes, or changes to Kanban filtering.
- A second application header, duplicated lane-title row, custom scrollbar, feature flag, fallback
  mode, environment variable, dependency, or compatibility layer.
