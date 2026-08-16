# Requirement — Review Fixes and Scalability

**Source:** `.docs/design-qa/code-review-2026-08-16.md` (15 findings, 14 CONFIRMED / 1 PLAUSIBLE)

## Problem

A max-effort code review of the repository found 15 verified defects: five correctness bugs,
two repository-configuration rules that have never taken effect, five efficiency defects whose
cost grows super-linearly with task count, and three maintainability defects where duplicated
logic has already drifted.

**Correction to the source review.** Its finding 1 claimed the watcher's silent returns on
retry exhaustion leave a permanently dead stream and should call `fatal()`. Architecture review
disproved that: the non-fatal returns at `project-watcher.ts:110/129/134` are deliberate and
tested — `project-watcher.test.js:55` and `:65` assert that a stream survives exhaustion so the
still-armed parent watcher can reattach when the binding becomes valid again, and `:137` covers
the one exhaustion path that is meant to be fatal. The genuine defect is narrower: the
degradation is **never signalled to the client**, so a browser holding a live `EventSource`
cannot distinguish "no changes" from "not watching". This requirement targets that, and
explicitly preserves the parent-anchored recovery design.

## Requirement

Every finding in the source review is fixed in code, corrected as overstated, or recorded as an
accepted non-goal with a stated reason. Specifically:

- A project watcher that cannot re-establish its root binding must make that state observable
  to the client, without closing the parent anchor that allows later recovery.
- The revision-stable project load must behave identically for every caller, so a concurrent
  project mutation yields the documented `PROJECT_BUSY` envelope rather than a raw filesystem
  error.
- Request-time project selection must enforce containment on resolved real paths, in the one
  place every caller-supplied path already passes through, so a legitimate direct child of the
  configured projects root is never rejected.
- Immutable-history path guards must compare path segments, not string prefixes.
- Repository attribute and ignore rules must apply to the generated artifacts that exist.
- The project projection must not rebuild its task index per helper call, and the Timeline must
  not rebuild shared per-render data once per row.
- Logic duplicated across a producer/verifier boundary must have one definition.

## Acceptance Criteria

- [x] When a watcher exhausts its retry budget without rebinding, it reports the degraded state
      through a callback and the parent watcher remains open so a later valid binding still
      reattaches. Verified by a test asserting both the callback and that the parent watcher was
      not closed.
- [x] A live `/api/events` subscription receives a distinct event on the wire when the stream
      degrades, and the response remains writable rather than ending. Verified by a test that
      drives a real subscription.
- [x] The client clears the degraded state only when the server states recovery
      (a `project-live` event) or on a stream `open`. A `project-change` must not
      clear it: `replaceRoot` notifies before the reattach outcome is known, so a
      failed reattach emits one too, and inferring liveness from it reintroduced
      the silent-death condition this requirement exists to remove.
- [x] These existing watcher recovery tests still pass unmodified, proving the parent-anchored
      recovery design was preserved: `catalog-invalid replacement remains unwatched until a
      later valid restoration event`, `filename-less restoration recovers a parent-only stream
      after retry exhaustion`, and `initial attachment keeps the safe parent when root identity
      changes during recursive watch setup`.
- [x] `agent-execution.js` and `human-completion.js` obtain their revision-stable snapshot from
      one shared implementation, and a transient filesystem error during a concurrent mutation
      surfaces as each module's semantic `PROJECT_BUSY` error rather than an uncaught error.
- [x] The existing positional call `loadStableProject(root, attempts, revision, load)` in
      `skills/project-manager/tests/project-manager.test.js` still passes unmodified.
- [x] Selecting a project by a path whose ancestor is a symlink succeeds when that project is a
      real direct child of the configured projects root, verified by a test that passes a
      non-realpathed path.
- [x] Containment for request-time selection is enforced only inside `ProjectCatalog.register`,
      and its confinement setting is a required construction option. A construction that omits
      it fails at runtime with a distinct error code rather than silently becoming unconfined or
      silently rejecting everything. Containment rejection and missing-confinement each carry
      their own error code, distinct from the generic unknown-selection code, and both reach the
      caller unwrapped.
- [x] The existing containment rejection message contract still passes — the refusal names both
      the configured root and the rejected path (test `a configured projects root confines
      selection to projects inside it`).
- [x] The immutable-history ancestor guard rejects a directory addition whose name is a string
      prefix of another task's id, verified by a test using two ids where one is a prefix of the
      other.
- [x] Drag-click suppression is extracted into a pure factory in `timeline-model.mjs` and unit
      tested there: beginning a new drag clears a flag left set by a previous drag, so
      suppression cannot leak across an unrelated pointer interaction.
- [x] The id→task index is constructed at most once per `kanbanData` call, measured against a
      recorded pre-change baseline at 200 tasks. Other id-keyed maps built for unrelated
      purposes are counted separately and are not part of this budget.
- [x] `Markers` receives a ready marker array as a prop rather than the project data, so it is
      structurally incapable of deriving per row — enforced by `npx tsc --noEmit` — and the
      derivation itself is an exported pure function in `timeline-model.mjs` covered by
      `timeline-model.test.js`. The date formatter is constructed at module scope, not per
      render.
- [x] The compact MCP summary path does not construct the lane and per-task board projection
      that it discards, while keeping the revision guard and the catalog identity check, and it
      reports the same field values as before the change — including `tasks.blocked` on a
      fixture that produces a task execution warning.
- [x] `sourceBindings` has one definition shared by both producers and the verifier.
- [x] The dead `sorted` clause in `contracts.js` is removed without enabling a new ordering
      check against stored contracts.
- [x] `git check-attr linguist-generated` reports a value other than `unspecified` for every
      committed generated artifact, including the tracked files under
      `skills/project-manager/studio/dist/`.
- [x] `git check-ignore` reports no match for a new asset path under
      `skills/project-manager/studio/dist/assets/`.
- [x] Typecheck is clean and the full unit suite passes with a test count greater than the
      pre-change count.
- [x] Every one of the 15 source-review findings is recorded as fixed with its change site,
      corrected as overstated, or deferred as a non-goal with a reason.

## Constraints

- **No behavior change to stored artifacts.** Every stored Task Contract, evidence manifest,
  and project file stays valid. No change may retroactively invalidate persisted data.
- **The parent-anchored watcher recovery design is preserved.** Retry exhaustion must not close
  the parent watcher.
- **The MCP App stays read-only.** No mutation entry point becomes reachable from
  `src/mcp-app/**`.
- **Integrity invariants keep their current strength.** The torn-read guard and the
  atomic-mutation immutability guarantee are unchanged by this story.
- **Generated artifacts stay in sync** — changes under `skills/project-manager/` or the MCP App
  runtime require `npm run build:plugin` per AGENTS.md.
- Public wire types in `src/project-manager-studio/shared/api.ts` do not change shape.

## Non-Goals

- **Replacing content-hash `mutationRevision` with a metadata revision (finding 8).** The
  largest scalability lever, but it weakens the torn-read guarantee: a same-size write inside
  one mtime tick becomes invisible. That is a product decision about integrity. At ≤200 tasks
  the current cost is acceptable. **Consequence to record:** because this is deferred, the
  compact-summary fix removes only the `kanbanData` projection — the two full-tree SHA-256
  walks remain, so the summary path stays dominated by hashing. The win is real but bounded.
- **Excluding `handoffs/` from the atomic-mutation candidate copy.** Highest leverage for write
  cost; changes the safety property of `atomicProjectMutation`.
- **Making the projects root itself unselectable.** Dropped from scope: it is already rejected
  in practice (a projects root has no `PROJECT.md`, so `register` fails), no finding requires
  it, and forcing it adds behavior risk for no benefit.
- **Studio's bare-`Error` containment rejections classifying as 500 instead of 400**
  (`server/cli.ts:56` → `apiError`). Real, from finding 14, but it belongs with the
  `buildCatalog` merge.
- **Full deduplication of the two `buildCatalog` implementations.** Only request-time
  containment is centralized.
- **Client list virtualization.** Not needed at ≤200 tasks.
- **The trimmed lower-severity list** from the review, except where an in-scope fix removes one
  incidentally.
- Adding feature flags, environment variables, or compatibility modes for any change here.
