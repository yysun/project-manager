# Studio Heartbeat Lifecycle

## Summary

- Studio pages now renew one server-wide lease immediately, every 60 seconds, and when a suspended
  page becomes visible again; transient renewal failures stay silent.
- The authenticated heartbeat API requires a non-simple Studio header, preventing another loopback
  origin from extending the lease through a simple cookie-bearing POST.
- Abandoned Studio processes now close and exit after one hour, with exact sleep-delay detection and
  a non-self-extending two-minute wake grace before normal lease evaluation.

## Verification

- `npm run typecheck`, `npm run build`, and `npm run test:pm` passed in that order; the full suite
  passed 107/107, including lifecycle, browser driver, endpoint, both-signal, and port-reuse coverage.
- Packaged-browser E2E observed `HEARTBEAT_OBSERVED 1` from the production page after token redirect;
  Studio rendered and refreshed successfully with no browser warnings or errors.
- Skill validation, `git diff --check`, complete repository/global skill synchronization, AR, CR, and
  VR passed. CR fixed the initially stale install/E2E evidence before its clean rerun.

## Notes

- No commands, PID files, unload handling, per-tab tracking, configurable timeouts, dependencies, or
  general process-supervision layer were added.
