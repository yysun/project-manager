# Persist Dashboard Panel State

## Problem

Project Manager Studio's Summary card can be collapsed, but that choice is lost on reload. The task
filters always consume a full row and cannot be collapsed at all. Users who repeatedly work in the
board lose vertical space and must restore their preferred dashboard layout every time Studio opens.

## Requirement

Make the task-filter row independently collapsible and persist the expanded or collapsed state of
both the Summary card and Filters panel in browser local storage. Studio must restore both choices on
the next reload while preserving the current filtering behavior and accessible expand/collapse
controls. When Filters is expanded, place its disclosure label directly above the Search box and
align that label with the Priority label in the same label row.

## Acceptance Criteria

- [x] The Filters panel has a visible control that independently expands and collapses the complete
      task-filter row and accurately exposes its state through `aria-expanded` and `aria-controls`.
- [x] When Filters is expanded, its disclosure label shares the filter-control row with Priority at
      desktop, intermediate, and phone widths, and the Search box sits directly beneath Filters as
      Priority's select sits beneath Priority.
- [x] Collapsing or expanding Summary persists that choice in browser local storage, and a reload in
      the same browser origin restores it.
- [x] Collapsing or expanding Filters persists that choice independently in browser local storage,
      and a reload in the same browser origin restores it.
- [x] Missing, malformed, partial, or unavailable local-storage data falls back safely to both panels
      expanded without preventing Studio from loading or the controls from working.
- [x] Search, priority, owner, blocked-only, clear-filter, project switching, Kanban, Timeline, and
      responsive layout behavior remain unchanged whether Filters is expanded or collapsed.
- [x] Typecheck, automated regression tests, production build, packaged browser E2E verification,
      skill validation, and the globally installed Studio reflect the new panel behavior.

## Constraints

- Store presentation preference only; do not persist filter values, project selection, task data, or
  server state.
- Keep Summary and Filters independently controllable and restored across Kanban and Timeline views.
- Preserve keyboard operation, meaningful accessible names, and reduced-motion behavior.
- Rebuild and synchronize the complete installable `skills/project-manager/` directory after source
  changes.

## Non-Goals

- Persisting search/filter values, view selection, selected project, scroll position, or open task
  dialogs.
- User accounts, server-side preferences, cross-device synchronization, schema migration, a feature
  flag, environment variable, fallback mode, compatibility layer, or new dependency.
