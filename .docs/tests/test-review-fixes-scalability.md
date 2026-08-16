# E2E Spec — Review Fixes and Scalability

Covers the two changes in this story that alter an externally observable contract: MCP App
project selection (finding 3) and Studio change-stream liveness (finding 1, as corrected).
Internal efficiency changes are covered by unit tests and measurements, not here.

## Scenario: A project reached through a symlinked root path is selectable

- Given a projects root created at a path whose ancestor is a symlink, such as `/tmp/...` on
  macOS where `/tmp` resolves to `/private/tmp`
- And that root contains one valid Project Manager project as a real direct child
- And an MCP App server started with `--projects-root` pointing at the symlinked path

- When the model calls `pm_project_status` with the `project` argument set to the
  non-realpathed child path

- Then the call succeeds and returns that project's status summary
- And the result is not an error mentioning that the folder is outside the configured
  projects root

## Scenario: A project outside the configured root is still refused

- Given an MCP App server started with `--projects-root` pointing at a projects root
- And a second valid Project Manager project that is not a child of that root

- When the model calls `pm_project_status` with the `project` argument set to the outside
  project's folder

- Then the call returns an error
- And the error names both the configured projects root and the rejected path
- And no entry for that folder is added to the server's project catalog

## Scenario: A change stream that cannot rebind reports itself as not live

- Given a running Studio server whose selected project's identity in `PROJECT.md` no longer
  matches its catalog entry, so the watcher cannot resolve its root binding
- And a browser session that opens a new `/api/events` subscription for that project after the
  identity changed, so watcher attachment is attempted

- When the watcher exhausts its retry budget without rebinding

- Then the client receives a distinct event indicating the stream is not currently live
- And the event-stream response remains open rather than closing
- And the server does not enter a reconnect loop

## Scenario: A degraded stream recovers when the binding becomes valid again

- Given a Studio change stream that has reported itself as not live after retry exhaustion
- And the project's identity is then corrected so the catalog entry resolves again
- And the parent watcher is non-recursive, so an in-place edit of `PROJECT.md` alone produces
  no parent event

- When the project directory is renamed away and back, producing a parent-directory event

- Then the watcher reattaches to the project root
- And the client clears the degraded state on the resulting `project-change`
- And subsequent task edits are delivered as `project-change` events again

## Scenario: A drag on one schedule bar does not swallow a click on another

- Given a Studio Timeline showing at least two tasks with editable schedules
- And the user drags one task's bar by one or more days and releases the pointer away from that
  bar, so no click event follows the drag

- When the user then clicks a different task's bar once

- Then that task's dialog opens on the first click
- And no click is consumed by leftover drag-suppression state

## Scenario: Ordinary project edits still reach the board

- Given a running Studio server with a browser session subscribed to `/api/events` for a
  selected project whose identity is unchanged

- When a task's specification is edited on disk

- Then a `project-change` event is delivered for that project
- And the board reflects the edit after the client refetches
