# Review Fixes and Scalability

## Summary

- Fixed 13 of the 15 findings from `.docs/design-qa/code-review-2026-08-16.md`, corrected one as
  overstated, and recorded two deferrals as non-goals. Full table in the plan.
- **Scalability:** the projection built its id→task index **402 times per `kanbanData` call at
  200 tasks**; it now builds it **once**, threaded through six helpers, plus a
  reverse-dependency map replacing a quadratic scan in `validateGraph`. The compact MCP summary
  no longer builds the lane and per-task board projection it discarded.
- **Security:** request-time containment moved into `ProjectCatalog.register`, judged on the
  resolved real path so a symlinked ancestor no longer rejects a legitimate child, and decided
  on the parent *before* the leaf is touched so out-of-root paths cannot be probed for
  existence. Omitting the containment decision now fails loudly rather than opening.
- **Correctness:** immutable-history ancestors compare path segments not string prefixes; one
  shared revision-stable read for every caller; Timeline drag suppression can no longer swallow
  a click on an unrelated bar; a watcher that cannot rebind now tells the client instead of
  going quietly dead.
- Repository config: `.gitattributes` rules now match real artifact paths, and the `dist/` line
  that hid tracked Studio assets is gone.

## Verification

- `npm test` → **214 pass / 0 fail** (205 before; 9 new regression tests).
- `npx tsc --noEmit` → clean. `npm run version:check` → one version.
- Index-construction measurement at 200 tasks: **402 → 1**, instrumented before and after.
- Red runs confirmed before their fixes for the prefix-guard and symlink-selection defects.
- **AR passed** after five rounds (9 → 6 → 3 → 1 → 0 blocking flaws), independent reviewer.
- **CR fixed → rerun passed**, independent reviewer, three rounds.

## Notes

- **Two design decisions emerged during implementation, not from the plan.**
  1. `loadStableSnapshot` gained `guardFirstRead`. Routing every caller through one retry made a
     nonexistent CLI root report `PROJECT_BUSY` instead of failing as invalid input. My first fix
     — leaving the first read unguarded for everyone — was wrong in the other direction: Studio's
     root comes from `catalog.resolve()` microseconds earlier, so `ENOENT` there is always a race,
     and it lost the retryable 409. It is now per-caller.
  2. Stream liveness is **stated by the server**, not inferred. The first implementation cleared
     the degraded banner on any `project-change`, but `replaceRoot()` notifies *before* the
     reattach outcome is known — so a failed reattach cleared the warning on a permanently dead
     stream, reintroducing the exact defect the feature removes. An explicit `onLive` →
     `project-live` edge removes the timing dependence entirely.
- **Non-goals, deliberate:** metadata `mutationRevision` (finding 8) weakens the torn-read
  guarantee and is a product decision about integrity; excluding `handoffs/` from the
  atomic-mutation candidate copy changes the safety property of `atomicProjectMutation`. Both are
  the largest remaining write-path wins and belong in their own story. Consequence to keep in
  view: the summary path still pays two full-tree SHA-256 walks, so finding 10's win is real but
  bounded.
- **Also deferred:** merging the two `buildCatalog` copies, Studio's containment rejections
  classifying 500 instead of 400, and keyboard activation of a schedule bar consuming a stale
  suppression flag (pre-existing, outside this REQ's pointer-scoped wording).
- **The source review artifact still asserts the overstated version of finding 1.** It should be
  amended so a future reader does not implement the `fatal()` fix, which breaks three tests and
  deletes the parent-anchored recovery design.
- E2E scenarios were verified through unit and subscription tests at the same boundaries rather
  than by driving a browser; the Timeline drag scenario has no automated coverage and remains
  reasoned-about only.
