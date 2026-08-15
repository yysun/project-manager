# Studio SSE Auto Refresh E2E Specification

## Scenario 1 - Reject an unauthenticated stream

Given packaged Project Manager Studio is running with a valid project and no established session

When a client opens `/api/events` with the selected project's opaque key

Then the server responds `401` and creates no project watcher

## Scenario 2 - Reject non-issued project selections

Given a client has a valid Studio session cookie

When it opens `/api/events` with a missing, unknown, or path-shaped project key

Then the server rejects the request through the existing catalog error contract before opening an
event stream

## Scenario 3 - Recover an issued selection whose root is temporarily stale

Given a client has a valid Studio session and a server-issued key whose selected root is absent or
catalog-invalid during initial connection or native reconnection

When it opens `/api/events` with that issued key and the valid root is later restored

Then the server returns a valid SSE stream owning only the exact-basename parent watcher during the
gap, never watches the invalid root recursively, and attaches plus notifies after catalog recovery

## Scenario 4 - Reject an unsafe recovery parent

Given a client presents a valid issued key but the startup root's parent is missing, symlinked,
noncanonical, or replaced during parent-watcher attachment

When it opens `/api/events` with that key

Then setup fails before SSE headers, any provisional watcher closes, and Studio never uses the unsafe
parent as a recovery anchor

## Scenario 5 - Notify one external project change

Given an authenticated SSE stream is open for the selected project

When an external tool changes a state-bearing project Markdown file

Then the stream receives one `project-change` event containing only the selected opaque project key
and the selected project can be reloaded with its new revision and content

## Scenario 6 - Coalesce one mutation burst

Given an authenticated SSE stream is open for the selected project

When one project operation produces several filesystem change and rename notifications in quick
succession

Then the server emits one debounced project-change notification rather than one reload per low-level
filesystem event

## Scenario 7 - Survive atomic project-root replacement

Given the selected project is watched and a valid project mutation replaces its root directory by
rename

When the replacement completes and a later relevant file change occurs in the new root

Then the current stream receives a change for the replacement and another change for the later edit,
proving the watcher reattached to the new project root

## Scenario 8 - Reject unsafe replacement and recover safely

Given the selected project stream is open and its parent watcher remains valid

When the selected root is temporarily absent, replaced by a symlink or different-ID directory, or a
failed mutation restores the original valid root

Then every reattachment attempt reruns catalog validation, no unsafe replacement receives a recursive
watcher, retry callbacks from older generations cannot attach, and the stream watches the restored
valid root after a later exact-basename event

## Scenario 9 - Isolate catalog projects

Given a Studio catalog contains Alpha and Beta and the browser stream selects Alpha

When a relevant file changes only under Beta

Then Alpha's stream receives no project-change event and Alpha remains the selected project

And a filename-less Alpha parent-watcher event caused by sibling replacement is ignored when Alpha's
attached filesystem identity has not changed

## Scenario 10 - Refresh the selected frontend automatically

Given Studio has loaded a selected project and its project-scoped EventSource is connected

When the server emits `project-change` after an external edit

Then the frontend fetches the selected project through the existing guarded read and displays the
new revision without page navigation or a manual Refresh action

## Scenario 11 - Preserve unsaved task and schedule edits

Given a task dialog contains unsaved local edits, Timeline contains an unsaved schedule draft, or a
Studio save mutation is in progress

When one or more project-change events arrive

Then Studio keeps the local edit state, records one pending automatic refresh, and performs that
refresh once after the dialog/draft is closed and the mutation barrier is clear

## Scenario 12 - Reject an automatic response when editing begins mid-flight

Given an SSE notification starts an automatic selected-project request while no editor is dirty

When the user opens a task dialog or creates a Timeline schedule draft before that request resolves

Then the request may finish but neither its success nor error state is applied, the unsaved local edit
remains unchanged, and Studio performs one fresh guarded request after the edit blocker clears. A
directly used project-fetch module must execute this case for both delayed success and delayed error.

## Scenario 13 - Switch stream ownership with project selection

Given the browser has an open event stream for Alpha

When the user selects Beta

Then the Alpha EventSource closes, one Beta EventSource opens with Beta's encoded opaque key, and a
late Alpha event cannot replace Beta data

## Scenario 14 - Reconcile changes made between stream lifetimes

Given the frontend last loaded its selected project before the current event stream disconnects

When the project changes while no stream watcher exists and native EventSource later reconnects

Then the new connection's `open` event starts a guarded reconciliation read and the missed project
change is rendered without waiting for another filesystem event

## Scenario 15 - Reconnect a transient transport silently

Given an event stream is open for the selected project

When the transport disconnects while the selected-project component remains mounted

Then the server cleans the disconnected response's watcher, the client leaves its EventSource alive
for native reconnection, and no transient stream failure appears as a user-facing error

## Scenario 16 - Close stream ownership explicitly

Given an event stream is open for the selected project

When the component unmounts, project selection changes, or the driver is explicitly stopped

Then the EventSource closes exactly once, does not reconnect, and the server closes that response's
watcher exactly once, including when a replacement retry or debounce timer was pending

## Scenario 17 - Do not refresh for blocker-only activity

Given no project-change notification or automatic read is pending

When the user opens and closes a task dialog or creates and cancels a Timeline schedule draft

Then the auto-refresh coordinator performs no project request

## Scenario 18 - Recover from watcher attachment failure

Given catalog validation succeeds for the selected root but recursive watcher creation repeatedly
fails after a root-watcher error

When the bounded attachment retry budget is exhausted

Then the server ends that SSE response and native EventSource reconnects rather than leaving an open
stream with no active selected-root watcher

## Scenario 19 - Preserve existing Studio controls and lifecycle

Given auto refresh is active

When the user manually refreshes, saves a task or schedule, sends heartbeats, switches projects, or
terminates Studio with `SIGINT` or `SIGTERM`

Then the existing guarded reads, revision conflicts, heartbeat lease, selection behavior, clean exit,
and port release continue to work

## Execution Evidence — 2026-08-15

- `npm run typecheck` passed without diagnostics; `npm run build` regenerated the packaged Node server
  and hashed client assets; `npm run test:pm` passed 147/147 tests against that output.
- Built-server SSE integration returned `401` without a session and `400` for missing, path-shaped, and
  unknown keys without creating a watcher. An authenticated issued key returned `text/event-stream`,
  emitted only the opaque-key `project-change` payload, disclosed no root, and closed its injected
  watcher exactly once on disconnect. A stream opened while its issued root was missing remained a
  valid parent-owned SSE connection, attached after restoration, emitted a change, and then served
  the restored project successfully.
- Production-watcher integration emitted after an external `TASKS.md` edit, emitted across atomic
  project-root replacement, observed a later edit in the new root, and ignored a sibling project's
  change. Focused watcher tests passed for path filtering, 100 ms burst coalescing, parent identity,
  symlink rejection, missing-root retry, stale generations, disconnect cleanup, watcher errors,
  attachment exhaustion, initial validation-to-watch replacement races, unsafe recovery parents,
  parent identity swaps during watcher creation, and filename-less recovery after retry exhaustion.
- Client driver/coordinator tests passed for encoded stream ownership, reconciliation on every open,
  event validation, idempotent close, immediate refresh, blocked-event coalescing, mid-flight commit
  invalidation, one-time safe flush, blocker-only no-op, and stopped ownership. Direct project-fetch
  tests proved delayed automatic successes and API errors are both discarded after their commit gate
  becomes invalid.
- The packaged Studio was opened in the in-app browser. Changing `TASKS.md` externally changed the
  rendered Kanban title to `External SSE title` without clicking Refresh. With a task dialog open, an
  unsaved title remained `Unsaved final title` and `Deferred external title` stayed absent; closing
  the dialog rendered the deferred external title. Browser warning/error logs were empty.
- `git diff --check` passed; skill validation printed `Skill is valid!`; `rsync -a --delete` synchronized
  the complete installable tree; and `diff -qr` reported no repository/global skill differences.
