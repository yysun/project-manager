# Studio Heartbeat Lifecycle E2E Specification

## Scenario 1 - Reject an unauthenticated heartbeat

Given packaged Project Manager Studio is running with a valid project and no established browser
session

When a client posts to `/api/heartbeat` with the Studio heartbeat header but without completing the
token handshake

Then the server responds `401`; an automated built-factory spy separately proves the renewal callback
is not invoked

## Scenario 2 - Reject a simple cross-origin-compatible heartbeat

Given a client has a valid Studio session cookie

When it posts to `/api/heartbeat` without the Studio heartbeat header

Then the server responds `403`; an automated built-factory spy separately proves the renewal callback
is not invoked

## Scenario 3 - Accept an authenticated Studio heartbeat

Given a client has a valid Studio session cookie and the project mutation revision is recorded

When it posts to `/api/heartbeat` with `X-Project-Manager-Studio: heartbeat`

Then the server responds `204` with an empty body and leaves the project mutation revision unchanged;
an automated built-factory spy separately proves the renewal callback is invoked exactly once

## Scenario 4 - Send heartbeats from a loaded Studio page

Given packaged Studio loads successfully in a browser after its token handshake

When the page mounts

Then the browser sends an immediate header-bearing authenticated heartbeat and reports no heartbeat
failure in the interface or console; injected client-driver tests separately prove 60-second
repetition, visibility renewal, silent request rejection, and unmount cleanup without real-time waits

## Scenario 5 - Keep normal Studio behavior after renewal

Given an authenticated heartbeat has renewed the packaged Studio lease

When the same browser session reads the project catalog and selected project

Then both requests succeed with the expected project identity and Studio remains responsive

## Scenario 6 - Expire at the inactivity boundary

Given a fresh production lifecycle state is driven by an injected clock and scheduler

When the last-heartbeat age reaches exactly one hour without a delayed watchdog callback

Then the lifecycle reports expired and its watchdog invokes the shared shutdown controller once

## Scenario 7 - Renew the server-wide lease

Given multiple tabs share one fresh production lifecycle state

When any tab renews the lease and the watchdog evaluates immediately before the new one-hour deadline

Then the lifecycle remains active for the shared server and does not invoke shutdown

## Scenario 8 - Grant wake grace only after a truly delayed callback

Given the watchdog has a 60-second cadence and no wake grace is active

When a callback arrives strictly more than two minutes after its scheduled due time

Then the lifecycle reports wake grace and sets one two-minute reconnection deadline that later delayed
evaluations cannot extend

## Scenario 9 - Renew during wake grace

Given the lifecycle has an active wake-grace deadline

When a browser heartbeat is processed before or at the same timestamp as the deadline evaluation

Then grace is cleared and the lifecycle returns to a normal active one-hour lease

## Scenario 10 - Keep an underlying active lease after grace

Given the lifecycle has an active wake-grace deadline but its latest heartbeat is less than one hour
old

When the watchdog evaluates at the exact grace deadline

Then grace clears, the lifecycle reports active, and the next due time is rebased to one cadence after
the current evaluation

## Scenario 11 - Expire abandoned wake grace

Given the lifecycle has an active wake-grace deadline, its underlying lease is at least one hour old,
and it receives no heartbeat

When the watchdog evaluates at the exact grace deadline

Then the lifecycle reports expired and does not grant another grace period

## Scenario 12 - Preserve SIGTERM shutdown and port release

Given packaged Studio is listening on a loopback port with its watchdog active

When the process receives `SIGTERM`

Then it exits with status zero and releases the port for reuse; an injected shutdown-controller test
separately proves the server close and exit callbacks each run once under competing triggers

## Scenario 13 - Preserve SIGINT shutdown and port release

Given packaged Studio is listening on a loopback port with its watchdog active

When the process receives `SIGINT`

Then it exits with status zero and releases the port for reuse

## Scenario 14 - Clamp clock changes and restore cadence

Given production lifecycle time has advanced monotonically through at least one watchdog evaluation

When wall time moves backward, later jumps forward beyond an expired lease, and a heartbeat renews
during the resulting grace

Then the clock never returns a lower timestamp, only the forward-jump evaluation can grant grace,
and the next watchdog evaluation uses the correctly rebased normal cadence without regranting grace

## Execution Evidence — 2026-08-12

- `npm run typecheck` passed without diagnostics, then `npm run build` regenerated the packaged server
  and client before `npm run test:pm` passed 107/107 tests.
- Built-factory HTTP coverage returned `401` without a session, `403` for missing and invalid Studio
  headers, and an empty `204` for the authenticated exact header. The renewal spy advanced exactly
  once and the project mutation revision remained unchanged.
- Deterministic lifecycle coverage passed for the inclusive one-hour boundary, strict delayed-due
  threshold, non-self-extending grace, active and expired underlying leases at the grace deadline,
  heartbeat renewal during grace, due-time rebasing, backward-clock clamping, forward jumps, and one
  close/exit under competing expiry and signal-style triggers.
- Client-driver coverage passed for immediate and 60-second renewal, hidden/visible transitions,
  synchronous and asynchronous request failures, exact request method/header, and idempotent timer
  and listener cleanup.
- The generated Studio page was loaded through its token redirect in the in-app browser against the
  built server factory and production client bundle. The server callback emitted
  `HEARTBEAT_OBSERVED 1`, which can occur only after the page's authenticated exact-header request;
  Studio rendered `Studio Delivery`, a refresh succeeded, and browser warnings/errors remained empty.
- Spawned packaged Studio processes handled both `SIGINT` and `SIGTERM` with exit code zero, after
  which a probe server successfully rebound each released loopback port.
- Skill validation printed `Skill is valid!`; the full `skills/project-manager/` tree was synchronized
  with `rsync -a --delete`, `diff -qr` reported no differences, and `git diff --check` passed.
