# Studio Heartbeat Lifecycle Plan

## Goal

Bound the lifetime of an abandoned Project Manager Studio process through an authenticated browser
heartbeat lease while preserving the existing zero-command launch experience and clean signal
shutdown.

## Current Context

- `src/project-manager-studio/server/cli.ts` creates the loopback HTTP server, launches the browser,
  and owns the existing idempotent `SIGINT`/`SIGTERM` close path. It currently has no idle or
  parent-lifetime policy.
- `src/project-manager-studio/server/server.ts` owns the authenticated `/api` router and is the right
  boundary for a state-free heartbeat endpoint.
- `src/project-manager-studio/client/App.tsx` is mounted for the full browser-tab lifetime and already
  performs same-origin authenticated API requests.
- `tests/project-manager-studio/studio-server.test.js` exercises the built server process, token
  boundary, browser-launch behavior, and signal shutdown. The build bundles server exports into the
  installable `project-manager-studio.js`, allowing deterministic lifecycle-state tests without
  waiting an hour.
- The root package exposes unambiguous `typecheck`, `test:pm`, `build`, and full `test` commands. The
  production build regenerates the installed server bundle and hashed client assets.

## Decisions

- Model lifecycle as one server-wide lease. Every authenticated tab renews the same last-heartbeat
  timestamp; no per-tab identity or unload handling is needed.
- Put the lease state machine and shutdown/watchdog drivers in a small server `.mjs` module with a
  declaration and injected clock/scheduler/close/exit dependencies for deterministic tests. The
  lease records the last heartbeat, next scheduled watchdog due time, and any wake-grace deadline,
  and reports `active`, `wake-grace`, or `expired` without directly owning the HTTP server.
- Use a nondecreasing `Date.now()` wrapper in production. Wall time observes laptop suspension;
  clamping backward changes prevents negative ages but can conservatively extend a lease until wall
  time catches up. A forward clock jump is treated like a delayed watchdog and receives wake grace.
- Define boundaries and transition order precisely. Inactivity expires when age is greater than or
  equal to one hour. Every watchdog evaluation rebases its next scheduled due time to
  `now + 60 seconds`; lateness for the current evaluation is measured against the due time recorded
  by the prior evaluation. A callback is sleep-delayed only when it arrives strictly more than two
  minutes after that due time—not merely two minutes after the prior callback. Evaluate active grace
  first so it cannot extend itself. While grace is active, return `wake-grace` strictly before its
  deadline; at the deadline, clear grace and evaluate ordinary inactivity. Without active grace,
  grant new grace whenever the current callback is sleep-delayed, before evaluating inactivity;
  otherwise return `active` or `expired` from the ordinary lease age. A heartbeat clears grace and
  renews the normal lease; at a shared timestamp, whichever event-loop callback runs first determines
  whether renewal beats expiry.
- Use fixed exported constants for the agreed policy: 60-second client heartbeat/watchdog cadence,
  one-hour inactivity timeout, two-minute delayed-check threshold, and two-minute wake grace. Do not
  add configuration flags, environment variables, fallback modes, or dependencies.
- Change `createServer`'s internal contract to receive the lease renewal callback. Add
  `POST /api/heartbeat` inside the existing authenticated router, require an exact
  `X-Project-Manager-Studio: heartbeat` header, invoke the callback exactly once, and respond `204`;
  unauthenticated requests continue to receive `401`, while authenticated simple POSTs lacking the
  custom header receive `403`. The non-simple header forces cross-origin browser requests through a
  CORS preflight that Studio does not authorize, preventing another loopback port from extending the
  lease with the host-scoped cookie.
- Start the lease when Studio starts, so a browser that never connects also expires. Have expiry and
  `SIGINT`/`SIGTERM` call one memoized asynchronous shutdown controller that stops the watchdog,
  closes all HTTP connections and the browser launcher once, and exits successfully once. Test the
  shared controller and watchdog together with injected dependencies, including concurrent expiry
  and signal-style shutdown calls.
- Add a small client heartbeat driver with injected request/timer/document dependencies and mount it
  through one `App.tsx` effect. It sends immediately, repeats every 60 seconds, sends again when the
  page becomes visible, ignores transient failures, and removes its timer/listener on unmount.
- Test the lease/controller with a fake clock and scheduler; test the client driver with fake
  request/timer/visibility dependencies; and export the built server factory for direct callback-spy
  integration tests of `401`, `403`, `204`, empty body, and exact renewal count. Use a packaged
  browser check to observe the page-originated request. Do not add test-only production flags or wait
  real policy durations.

## Phased Tasks

### Phase 1 - Lifecycle contract and scope lock

- [x] Inspect `cli.ts`, `server.ts`, `App.tsx`, Studio process helpers, and server integration tests to
      confirm process ownership, authentication, client lifetime, build outputs, and signal cleanup.
- [x] Define one server-wide lease renewed by any authenticated tab, with fixed 60-second, one-hour,
      two-minute delayed-check, and two-minute grace timing.
- [x] Record commands, PID files, unload shutdown, per-tab tracking, user configuration, dependencies,
      and sub-agent supervision as non-goals.

### Phase 2 - Server lease foundation

- [x] Add a deterministic server lifecycle `.mjs` module and declaration with fixed policy constants,
      a nondecreasing production wall clock, injected time/scheduling, exact active/wake-grace/expired
      boundaries, and non-self-extending grace.
- [x] Add a memoized shutdown controller and 60-second watchdog driver, then wire them in `main()` so
      expiry and signals share one path that stops the watchdog, closes the server/connections/browser
      once, releases the port, and exits zero once.
- [x] Add deterministic controller tests proving expiry invokes the shared close path and concurrent
      expiry/signal-style calls perform one close and one exit.

### Phase 3 - Authenticated browser renewal

- [x] Extend `createServer` with a renewal callback and add `POST /api/heartbeat` inside the
      authenticated router, requiring the exact Studio custom header, returning an empty `204`, and
      leaving project state untouched.
- [x] Add a client heartbeat `.mjs` driver/declaration and mount it in `App.tsx` so it renews
      immediately, every 60 seconds, and when a sleeping page becomes visible, silently tolerating
      request failures and cleaning up listeners/timers.
- [x] Confirm no unload handler, per-tab registry, command surface, configuration switch, or
      user-facing heartbeat error was introduced.

### Phase 4 - Regression and delivery verification

- [x] Add focused boundary tests at and around inactivity, scheduled-delay, and grace deadlines;
      controller tests for one close/exit under competing triggers; client-driver tests for immediate,
      interval, visibility, failure, and cleanup behavior; and callback-spy server tests for `401`,
      `403`, `204`, empty body, and exact renewal count.
- [x] Cover production clock and recovery edges explicitly: clamp backward wall-clock movement, treat
      a forward jump as at most one delayed evaluation, rebase the next due time after that evaluation,
      keep an unexpired underlying lease active when grace ends, and restore normal cadence after a
      grace-time heartbeat.
- [x] Run `npm run typecheck`, then `npm run build` before `npm run test:pm` so built-server tests cannot
      use stale output; run the packaged lifecycle E2E specification and record exact pass evidence.
- [x] Run `git diff --check`, validate `skills/project-manager`, inspect the scoped diff, synchronize
      the complete rebuilt installable skill to `/Users/esun/.agents/skills/project-manager/`, and
      prove the repository and installed skill trees match.

## Validation

- `npm run typecheck` exits 0 without TypeScript diagnostics.
- `npm run build` exits 0 and regenerates the packaged server and client assets before tests consume
  them.
- `npm run test:pm` exits 0 with lifecycle state-machine, shutdown controller, client driver,
  authenticated endpoint, and existing Studio coverage passing against current build output.
- Packaged E2E follows `.docs/tests/test-studio-heartbeat-lifecycle.md`, proving the observable
  token/header boundary, an actual immediate page-originated heartbeat, unchanged project state,
  responsive Studio behavior, clean `SIGINT`/`SIGTERM` exits, and port release. Injected automated
  tests separately prove callback counts, interval/visibility/failure/cleanup behavior, and one-time
  close/exit semantics.
- `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager`
  prints `Skill is valid!`.
- `git diff --check` exits 0 and `diff -qr` reports no differences after complete skill sync.

## Rollback / Risk

- Browser timer throttling could delay a 60-second interval. The one-hour lease provides a 60×
  margin, and visibility renewal plus wake grace cover common suspension behavior.
- A laptop wake can make both the heartbeat and watchdog overdue. The watchdog must detect its own
  delay before evaluating lease age and grant a fresh two-minute grace window.
- A malformed or unauthenticated request must not keep an abandoned server alive. Keep renewal behind
  the existing session middleware and require the non-simple Studio header so another loopback origin
  cannot renew with a host-scoped cookie through a simple POST.
- Calling `process.exit` before HTTP close completes could drop in-flight work. Reuse the asynchronous
  close path, await it, and exit only once after it resolves.
- Timer boundaries can silently drift if delay is measured from the prior callback instead of the
  scheduled due time. Rebase the next due time to `now + cadence` on every evaluation, apply the
  documented strict/inclusive boundaries and transition order, and never regrant grace while grace
  is already active.
- Rollback reverts the client effect, API endpoint, lease/watchdog logic, tests, docs, and regenerated
  installable assets together; no persisted data or migration is involved.
