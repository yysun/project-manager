# Studio SSE Auto Refresh — Done

## Summary

- Added an authenticated, opaque-key, project-scoped SSE endpoint for Studio change notifications.
- Added catalog-revalidated root watching with a stable parent recovery anchor, atomic replacement
  support, 100 ms burst coalescing, generation-owned retries, and idempotent cleanup.
- Added native EventSource ownership and reconciliation so selected-project changes render without a
  manual Refresh while missed changes are recovered after reconnect.
- Added dialog, Timeline-draft, and mutation barriers plus a project-fetch commit gate so automatic
  reads cannot overwrite unsaved edits, including when editing begins mid-flight.
- Rebuilt the installable Studio server/client, updated English and Chinese documentation, and synced
  the complete skill tree to the global installation.

## Verification

- Architecture review passed; code review findings were fixed and the rerun passed; independent
  verification passed all ten acceptance criteria.
- Typecheck and production build passed; focused watcher/server tests passed; the complete project
  suite passed 147/147.
- Packaged browser E2E proved automatic external refresh and deferred refresh with an unsaved task
  edit; browser warnings/errors were zero.
- `git diff --check`, skill validation, and repository-to-global installation comparison all passed.

## Notes

- Manual Refresh remains available as an explicit recovery control; polling, WebSockets, live catalog
  discovery, collaborative editing, configuration switches, and new runtime dependencies remain out
  of scope.
