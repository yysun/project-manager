# Studio SSE Auto Refresh Plan

## Goal

Keep every open Studio tab synchronized with its selected project's durable state through a secure,
project-scoped SSE notification channel, without risking unsaved edits or weakening catalog and
revision protections.

## Current Context

- `src/project-manager-studio/server/server.ts` owns the session-cookie middleware, opaque-key
  project resolution, project reads, serialized saves, and static assets. It has no streaming route.
- `src/project-manager-studio/server/project-catalog.ts` resolves opaque keys to validated canonical
  roots on every request and rejects missing, path-shaped, unknown, moved, symlinked, or ID-drifted
  projects.
- `skills/project-manager/scripts/lib/mutations.js` commits valid updates by renaming the live project
  root to a sibling backup and renaming a candidate into the original path. A watcher attached only
  to the original inode would become stale after a successful Studio or CLI mutation.
- `src/project-manager-studio/client/App.tsx` owns selected-project loading and a generation/operation
  guard. `TaskDialog` keeps unsaved edits in local state and is remounted when loaded revisions change,
  while `Timeline` keeps an unsaved schedule draft across same-project data updates. An automatic reload
  must wait while either editor is dirty. Timeline and dialog saves already hold a mutation barrier.
- The server bundle targets Node.js 22 and the installable skill must run without `node_modules`.
  Node's recursive `fs.watch` is sufficient when paired with a non-recursive parent watcher that
  notices root replacement and reattaches the recursive project watcher.
- The root scripts expose unambiguous `typecheck`, `build`, and `test:pm` verification. Existing
  built-server helpers support authenticated HTTP integration and packaged process checks.

## Decisions

- Add `GET /api/events?project=<opaque-key>` inside the existing authenticated router. Look up the
  server-issued key without weakening its opaque membership check, return standard no-cache SSE
  headers, send a connection comment, and emit only a `project-change` event containing the
  already-known project key. Missing, unknown, or path-shaped keys still fail before streaming. A
  known key retains its startup root binding even when full catalog validation is temporarily stale;
  that permits only the parent watch described below, never project reads or recursive attachment.
  Do not disclose filenames, roots, project data, or diff content.
- Give each connected selected-project stream its own watcher lifetime. This makes browser close,
  EventSource reconnect, and project selection changes naturally close the associated watcher and
  avoids a process-global subscription registry.
- Implement the watcher in a focused server module using recursive `fs.watch` on the selected root
  plus non-recursive `fs.watch` on its parent. Establish the stable parent watcher synchronously from
  the issued startup binding, then enter the same catalog-revalidated root-attachment state machine
  used after replacement. A temporarily missing/invalid root therefore leaves a valid SSE stream with
  only its exact-basename parent watcher; restoration can recover without relying on EventSource to
  retry a non-200 response. The root watcher observes state file and handoff changes;
  the parent watcher filters the exact selected-root basename and owns a small replacement state
  machine. On a root rename it retires the old watcher, emits a debounced change, and retries catalog
  resolution through the brief missing-path gap. Every attempt must call `ProjectCatalog.resolve()`
  again, so real-directory, canonical-path, and stable-ID checks run before a new recursive watcher is
  installed. A missing, symlinked, identity-drifted, or otherwise stale replacement remains unwatched;
  the parent watcher stays alive so a later safe restoration can reattach. A bounded retry exhaustion
  leaves the stream open and unwatched until another exact-basename parent event, while the emitted
  change makes the client surface the ordinary project-load error. A successful retry atomically swaps
  in one current-generation root watcher. Generation checks prevent late retry callbacks from older
  replacements from attaching, and stream close cancels every retry, debounce timer, and watcher.
- Validate the recovery anchor independently of the stale child root. Before parent attachment,
  `lstat(parent)` must be a non-symlink directory and `realpath(parent)` must equal the canonical parent
  path derived from the startup binding. Capture its `dev`/`ino`, create the parent watcher, then repeat
  all checks and require the same identity. Close the new watcher and fail setup before SSE headers if
  the parent is missing, moved, symlinked, noncanonical, or identity-swapped during attachment. Root
  staleness may degrade to a parent-only `200` stream; parent unsafety has no authorized recovery anchor
  and therefore fails closed.
- Record the selected root's attached filesystem identity (`dev` and `ino`) after catalog validation
  and post-`fs.watch` confirmation.
  A filename-less event from the recursive root watcher is relevant. A filename-less event from the
  shared parent watcher is not inherently relevant: compare the selected root's current `lstat`
  identity with the recorded attachment and enter replacement handling only when it is absent, unsafe,
  or different. This prevents a filename-less sibling-project event from refreshing the selection.
- Attach `error` handlers to parent and root `FSWatcher` instances. A root-watcher error enters the
  same catalog-revalidated retry path; a parent-watcher error retires all watch resources and ends the
  SSE response so native EventSource reconnection can establish a fresh validated stream. Never allow
  an unhandled watcher `error` event to terminate Studio. If catalog validation remains missing or
  invalid after bounded retries, keep only the parent watcher and wait for the next binding change. If
  catalog validation succeeds but creation of the recursive root watcher repeatedly fails, end the SSE
  response after retry exhaustion so native EventSource reconnects instead of leaving a live but dead
  stream.
- Treat the top-level files `PROJECT.md`, `TASKS.md`, `STATUS.md`, `MILESTONES.md`, `RISKS.md`,
  `DECISIONS.md`, `SOURCES.md`, `TRACEABILITY.md`, `CHANGES.md`, `ASSUMPTIONS.md`, `ISSUES.md`,
  `STAKEHOLDERS.md`, `LESSONS.md`, and `CLOSURE.md` as relevant. Treat every event under `handoffs/`
  as relevant because contracts, manifests, and their bound evidence can change rendered execution
  state. Treat a missing root-watcher filename as relevant; apply the attachment-identity rule above
  to a missing parent-watcher filename. Ignore other root paths and `reports/history`.
- Debounce relevant callbacks with a fixed 100 ms trailing window. Each relevant callback resets the
  timer, so one mutation burst produces one notification after the quiet window. A notification is a
  named `project-change` SSE event whose JSON data is exactly `{ "projectKey": <opaque-key> }`.
- Add a small injectable client EventSource driver, parallel to the heartbeat driver, that opens the
  project-scoped URL, invokes the same reconciliation callback on every EventSource `open` and named
  `project-change`, silently relies on native reconnection after transport errors, and closes
  idempotently. Reconciliation on initial open closes the gap between initial project loading and
  watcher establishment; reconciliation on reopen closes the gap between stream lifetimes.
- Add a pure, injectable auto-refresh coordinator module as the executable seam between stream events
  and React state. It owns an automatic-read generation and in-flight count, coalesces notifications
  while blocked, and gives each started read a commit predicate. Activating any edit blocker increments
  the generation and invalidates every in-flight automatic response; it records one pending refresh
  only when such a read existed or a notification arrived while blocked. Neither success nor error from
  an invalidated read may update React state. Clearing all blockers runs one fresh guarded read only
  when pending. Blocker-only activity with no event/read performs no refresh. Selection ownership
  changes or stop invalidate outstanding reads and reset pending state idempotently. Manual Refresh
  keeps its current immediate semantics.
- Add a pure project-fetch module used directly by `App.loadProject`. It performs the authenticated
  project request and checks the coordinator's optional commit predicate after delayed success or
  failure parsing but before returning any data/error for React state application. Unit tests hold
  success and error responses in flight, activate the blocker, and prove both results are discarded;
  App retains selection-guard checks around accepted results.
- Mount the driver and coordinator from `App.tsx` for the selected key. On notification, use the
  existing selection guard to start a fresh read. If a mutation, task dialog form, or Timeline schedule
  draft is active, mark one refresh pending and perform it after all barriers clear. Extend the internal
  project-load path with an optional automatic commit predicate checked before applying success and
  before applying error state; a rejected automatic response only clears its loading indicator when
  still current. Pass Timeline a dirty-state callback that clears on save, cancel, view unmount, or
  project switch. Do not add banners, toasts, editable settings, polling fallbacks, or page reloads.
- Preserve manual Refresh and full-project response handling. Automatic reads follow the same
  authenticated `/api/project` path, and the existing guard remains authoritative for late or
  cross-project responses.
- Make the watcher factory injectable through `createServer` with the production implementation as
  the default. Integration tests use a callback/close spy to prove invalid requests create no watcher,
  authenticated streams create exactly one, and disconnect cleanup closes exactly once; production
  exposes no diagnostic endpoint, watcher counts, or test-only route.
- This is not low-risk architecture work: it adds an authenticated API route, long-lived HTTP
  connections, filesystem concurrency, and cleanup/reliability behavior. Require independent AR,
  CR, and VR reviews.
- Add an E2E specification because this changes a user-facing browser flow and authenticated API
  contract. Exercise the transport and refresh behavior with built-server integration, focused
  client-driver/coordinator tests, and the existing browser fixture path for one rendered refresh;
  avoid real timing waits where injected or stream-level evidence is stronger and deterministic.

## Phased Tasks

### Phase 1 - Scope and contract lock

- [x] Inspect `server.ts`, `project-catalog.ts`, `cli.ts`, `App.tsx`, selection guards, mutation root
      replacement, build scripts, and Studio test helpers to confirm authentication, lifecycle,
      watcher reattachment, client edit barriers, and packaged output boundaries.
- [x] Confirm the SSE route contract, exact event payload, enumerated relevant project-state paths,
      100 ms trailing debounce, catalog-revalidated replacement state machine, and stream/watcher
      cleanup semantics recorded in the approved requirement, plan, and E2E specification.
- [x] Record live catalog discovery, payload streaming, polling, WebSockets, collaborative editing,
      configuration switches, and new runtime dependencies as non-goals.

### Phase 2 - Server watch and SSE foundation

- [x] Add a source-commented server watcher module that filters the enumerated state paths, recursively
      watches the canonical project root, watches its parent for the exact root basename, handles
      watcher errors, and implements generation-owned catalog-revalidated retry/reattachment with
      pre/post canonical parent identity validation, attached-root identity checks for filename-less
      parent events, 100 ms trailing notification debounce, fatal valid-root attach exhaustion, and
      idempotent timer/watcher cleanup.
- [x] Extend `ProjectCatalog` with an internal issued-key lookup that preserves exact opaque membership
      without full root validation, then use it only to establish the SSE stream's stable parent binding.
- [x] Extend `server.ts` with an authenticated project-scoped SSE route that looks up the opaque key,
      initializes and tears down the watcher with the response lifetime, sends only project-key
      change events, and reports setup failures through the existing API error contract before
      headers are committed.
- [x] Preserve `cli.ts` graceful shutdown and HTTP connection cleanup without adding a global watcher
      registry or separate process lifecycle path.

### Phase 3 - Client refresh integration

- [x] Add a source-commented, injectable client SSE driver and declaration that constructs the
      encoded project stream URL, reconciles on every `open` and `project-change`, tolerates native
      reconnect errors, and closes once.
- [x] Mount the event driver in `App.tsx` for the active selection and route notifications through
      `loadProject` and `createSelectionGuard` so stale or cross-project reads remain rejected.
- [x] Add a pure project-fetch commit-gate module with delayed success/error discard tests and use it
      from `App.loadProject` before selection-guarded React state application.
- [x] Add a pure auto-refresh coordinator plus Timeline dirty-state callback, then wire `App.tsx` to
      coalesce notifications while a task dialog, schedule draft, or mutation is active and reload
      once after all clear, preserving both forms of unsaved local edits and invalidating automatic
      responses when an editor becomes dirty after their request started.
- [x] Confirm the existing Refresh button, heartbeat, project switch reset, task save, schedule save,
      and error paths remain unchanged and no polling, page reload, or user-facing stream error is
      introduced.

### Phase 4 - Automated and E2E verification

- [x] Add watcher tests for relevant and irrelevant paths, 100 ms burst coalescing, successful atomic
      root replacement, failed-mutation rollback restoration, unsafe symlink/ID-drift replacements,
      retry exhaustion and later recovery, watcher errors, disconnect during retry, generation
      ownership, filename-less root versus unchanged sibling-parent events, fatal valid-root attach
      exhaustion, and idempotent cleanup using deterministic short-lived fixtures.
- [x] Add regression coverage proving initial/reconnect attachment during a missing-root or post-watch
      identity-change window keeps a valid parent-owned stream, attaches only after catalog recovery,
      and never depends on native retry after a non-200 response; add injected races proving unsafe or
      identity-swapped parents fail before stream setup and close any provisional watcher.
- [x] Add built-server integration tests for SSE authentication and selection rejection, event shape,
      external file changes, cross-project isolation, root replacement survival, and connection
      cleanup behavior that can be observed without indefinite waits.
- [x] Add client-driver and pure coordinator coverage for URL encoding, event filtering, callback
      behavior, initial-open and reconnect-gap reconciliation, project switching,
      mutation/dialog/Timeline-draft barriers, blocker-only no-op behavior, mid-flight blocker
      activation with rejected success/error commits, coalescing, one-time flush, and idempotent close;
      run one packaged-browser fixture check that observes externally changed task content render
      without clicking Refresh.
- [x] Run `npm run typecheck`, `npm run build`, and `npm run test:pm`, then execute and record the
      scenarios in `.docs/tests/test-studio-sse-auto-refresh.md` against current packaged output.

### Phase 5 - Delivery synchronization

- [x] Update `README.md` and the installable skill README only where needed to explain automatic
      refresh and the retained manual Refresh escape hatch.
- [x] Run `git diff --check`, validate `skills/project-manager`, inspect the scoped diff, and record
      concrete evidence for every requirement acceptance criterion.
- [x] Synchronize the complete rebuilt `skills/project-manager/` tree to
      `/Users/esun/.agents/skills/project-manager/` and prove the repository and installed trees match.
- [x] Mark plan tasks complete only after their corresponding implementation or evidence exists.

## Validation

- `npm run typecheck` exits 0 without TypeScript diagnostics.
- `npm run build` exits 0 and regenerates the packaged server plus client before built-output tests.
- `npm run test:pm` exits 0 with watcher, SSE route, client driver, selection guard, server security,
  lifecycle, and existing project behavior coverage passing.
- `.docs/tests/test-studio-sse-auto-refresh.md` scenarios demonstrate authentication, external-change
  refresh, burst coalescing, cross-project isolation, root replacement survival, edit deferral,
  switching cleanup, and preserved manual/heartbeat behavior.
- `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager`
  prints `Skill is valid!`.
- `git diff --check` exits 0 and `diff -qr skills/project-manager /Users/esun/.agents/skills/project-manager`
  reports no differences after full-directory synchronization.

## Rollback / Risk

- `fs.watch` can duplicate or omit filenames and atomic mutation swaps the watched root inode. Treat a
  missing recursive-root filename as relevant; for a missing parent filename, compare the selected
  root's attached identity before acting. Debounce duplicates, validate the stable parent before and
  after attachment, and reattach the recursive root watcher after replacement instead of trusting a
  single inode watch.
- A long-lived SSE response can leak file descriptors if disconnect cleanup is incomplete. Bind one
  idempotent cleanup function to request/response close paths and test watcher closure.
- Native EventSource retries after transient disconnects. Server cleanup must finish before a retry
  creates a replacement stream; the client must reconcile on every open so changes during the gap are
  fetched, must not surface transport errors, and must not add its own retry loop.
- An automatic reload can erase dialog-local form state, obscure a Timeline draft's base revision, or
  race a save, including when the editor becomes dirty after a fetch starts. Defer notifications across
  dialog, schedule-draft, and mutation barriers; invalidate in-flight automatic response commits when a
  barrier activates; coalesce them; and keep revision/selection guards authoritative.
- Watching an entire source repository would cause noisy refreshes. Filter top-level events to known
  project-state files and include the handoff tree only because execution evidence changes rendered
  lifecycle and warning state.
- Rollback removes the SSE route, watcher/client/coordinator modules, App/Timeline wiring, tests, docs,
  and regenerated skill assets together; rebuild the reverted bundle, re-synchronize the complete
  restored `skills/project-manager/` tree to `/Users/esun/.agents/skills/project-manager/`, and rerun
  the tree comparison. No persisted schema or migration is involved.
