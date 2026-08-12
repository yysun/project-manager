# Studio Heartbeat Lifecycle

## Problem

Project Manager Studio is a local Node.js server that remains alive after every Studio browser tab
closes. A normal signal stops it cleanly, but a Studio launched by an agent or from a terminal that
later disappears can continue consuming a process and loopback port indefinitely.

## Requirement

Give every Studio process an automatic browser-backed lease without adding commands or manual
lifecycle work. A loaded Studio page must renew the lease every 60 seconds through the authenticated
loopback API. The server must exit cleanly after one hour without a successful heartbeat. If the
server watchdog observes that its own timer was paused for more than two minutes, it must grant the
browser a two-minute reconnection window before evaluating expiry so laptop sleep does not kill an
otherwise active Studio immediately on wake.

## Acceptance Criteria

- [x] A loaded Studio page sends an authenticated heartbeat immediately and every 60 seconds while
      it remains mounted, without surfacing transient heartbeat failures as user-facing errors.
- [x] The heartbeat endpoint rejects unauthenticated requests and accepts authenticated requests
      with the Studio-specific request header without changing project state or returning
      unnecessary response content; cross-origin-compatible simple POSTs cannot renew the lease.
- [x] A Studio process exits cleanly after one hour without any successful browser heartbeat, while
      any successful heartbeat renews the one-hour lease for all tabs using that server.
- [x] A watchdog callback delayed by more than two minutes grants a two-minute reconnection window;
      a heartbeat during that window renews the normal lease, while an abandoned server exits after
      the grace window and the next watchdog evaluation.
- [x] Existing `SIGINT` and `SIGTERM` shutdown, browser launch, project reads, task mutation, token
      security, and multi-tab behavior remain intact.
- [x] Typecheck, automated tests, production build, packaged lifecycle verification, skill
      validation, and the globally installed Studio all reflect the new lifecycle behavior.

## Constraints

- Keep the fixed policy at a 60-second browser interval, one-hour server lease, two-minute delayed
  watchdog threshold, and two-minute reconnection grace period.
- Reuse the existing authenticated, loopback-only API boundary and graceful server close path.
- Use server time and testable lifecycle state; do not depend on browser unload events or real-time
  waiting in automated tests.
- Use a nondecreasing wall-clock reading so laptop suspension is observable; a backward system-clock
  adjustment may conservatively extend the lease until wall time catches up.
- Rebuild and synchronize the complete installable `skills/project-manager/` directory after source
  changes.

## Non-Goals

- New start, stop, status, list, daemon, PID-file, lock-file, supervisor, or sub-agent commands.
- Shutting down as soon as the last tab closes, tracking individual tabs, or promising exact exit at
  the millisecond boundary.
- User-configurable timeouts, CLI flags, environment variables, feature flags, dependencies, or a
  general-purpose process manager.
