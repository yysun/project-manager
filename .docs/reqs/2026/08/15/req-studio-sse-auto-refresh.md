# Studio SSE Auto Refresh

## Problem

Project Manager Studio only reflects project changes made through its own save responses or a manual
Refresh action. Changes made by the project CLI, an agent, or another editor leave an open Studio tab
stale, so users can make decisions from outdated task, schedule, warning, and summary data.

## Requirement

An open Studio tab must automatically reload its selected project after the server observes a relevant
project-state file change. The notification path must use an authenticated, project-scoped
Server-Sent Events stream and preserve Studio's existing selection, revision, edit-safety, and
loopback security boundaries.

## Acceptance Criteria

- [x] An authenticated Studio client can open an SSE stream only for a server-issued project key;
      unauthenticated, missing, unknown, and path-shaped selections are rejected by the existing API
      security and catalog rules. An issued key whose root is temporarily stale can own only its stable
      parent watch and never a recursive root watcher until full catalog validation passes again.
- [x] The server watches the selected project's state-bearing Markdown files and execution handoff
      tree, survives the atomic replacement pattern used by project mutations, and coalesces a burst
      of filesystem notifications into one project-change event.
- [x] A project-change event reloads the currently selected project without a page navigation or
      manual Refresh action, while changes for another catalog project cannot refresh or replace the
      selected project.
- [x] Automatic reload is deferred while a task dialog, unsaved Timeline schedule draft, or Studio
      mutation is active, then performed once when editing is safe; existing selection-generation
      and mutation-revision guards continue to reject stale responses and conflicting saves.
- [x] If an edit blocker becomes active after an automatic project request starts, that request cannot
      apply either success or error state; Studio performs one fresh guarded read after editing clears.
- [x] Closing, reconnecting, or switching the browser's selected project cleans up the prior event
      stream and server watcher without surfacing transient stream failures as user-facing errors.
- [x] Every initial or re-established SSE connection triggers a guarded reconciliation read so a
      project change that occurred between stream lifetimes cannot leave the frontend stale.
- [x] Initial connection or native reconnection during an atomic root-replacement gap still receives a
      valid SSE response and recovers inside that stream rather than failing permanently on a non-200
      setup response.
- [x] Existing manual refresh, project selection, heartbeat lifecycle, task and schedule editing,
      token security, graceful shutdown, and packaged-skill behavior remain intact.
- [x] Typecheck, production build, automated tests, the SSE E2E scenarios, skill validation, and the
      globally installed skill all reflect the auto-refresh behavior.

## Constraints

- Reuse the existing authenticated, loopback-only Express router and opaque project catalog keys.
- Use one-way SSE rather than WebSockets, polling, browser file access, or page reloads.
- Keep the installable Studio runnable with its existing plain Node.js bundle; do not add a runtime
  dependency solely for file watching.
- Watch directories rather than individual files so file creation, removal, and atomic replacement
  are observable on supported Node.js 22 platforms.
- Revalidate the catalog entry before attaching to any replacement project root; missing, symlinked,
  moved, or identity-drifted roots must never become watched through the replacement path.
- Before using an issued root binding as a recovery anchor, verify its parent is still the same real,
  canonical directory across parent-watcher attachment; an unsafe parent must fail setup.
- Rebuild and synchronize the complete `skills/project-manager/` directory after source changes.

## Non-Goals

- Live catalog discovery when projects are added to or removed from `.projects` after Studio starts.
- Streaming project contents, diffs, filenames, task payloads, or arbitrary filesystem paths.
- Collaborative editing, conflict resolution, presence, WebSockets, polling, configurable debounce
  intervals, feature flags, environment variables, or a general-purpose filesystem event API.
