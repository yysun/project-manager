# Persist Dashboard Panel State Plan

## Goal

Give users independent, accessible Summary and Filters collapse controls and restore their layout
preference across Studio reloads without persisting task-filter values or changing project behavior.

## Current Context

- `src/project-manager-studio/client/App.tsx` owns Summary collapse state, renders its accessible
  toggle, and renders the non-collapsible `.toolbar` filter row immediately after it.
- `src/project-manager-studio/client/styles.css` already provides a grid-row collapse animation and
  reduced-motion override for Summary; the filter row has desktop and responsive flex layouts.
- No Studio source currently reads or writes `localStorage`, and no preference storage contract or
  tests exist.
- The source tree already uses small `.mjs` client helpers with `.d.mts` declarations and direct
  Node tests, which provides a testable boundary for storage parsing and failure handling.
- The root package exposes unambiguous `typecheck`, `test:pm`, `build`, and full `test` commands. The
  production build writes client assets under `skills/project-manager/studio/dist/`.

## Decisions

- Store one versionless JSON object under a Studio-specific local-storage key with two required
  boolean fields: `summaryCollapsed` and `filtersCollapsed`. Treat a missing field or either
  non-boolean field as an invalid payload and fall back to both panels expanded.
- Isolate safe read/write behavior in a small client `.mjs` helper with a matching declaration so
  malformed JSON and storage access failures cannot stop React initialization or interaction.
- Initialize both React states lazily from one storage read and persist the complete state object
  after either toggle changes. Keep preference global to the browser origin, not project-specific,
  because both panels are application layout controls.
- Reuse the Summary panel's disclosure-button language and `aria-expanded`/`aria-controls`
  relationship for Filters, but use the native `hidden` state on the controlled filter region so
  interactive descendants leave both the tab order and accessibility tree when collapsed. Keep the
  persistent Filters button outside the native-hidden region and expose the controlled filter
  contents with `display: contents` only while expanded.
- Position the Filters button at the Search column's label position, outside normal flex sizing, so
  it sits directly above the Search input and shares the Priority label's top edge. Keep Search as
  the first flexible control and Priority as the next control at every width; allow later controls
  to wrap at narrow widths. Give the toolbar a collapsed minimum height so the absolutely positioned
  disclosure remains visible and operable when its controlled region is hidden.
- Retarget existing `.toolbar > label` rules to `.filter-controls > label` because
  `display: contents` flattens layout boxes but not DOM selector relationships. Do not move the
  disclosure button inside the hidden region or it would become impossible to reopen Filters.
- Keep both panels expanded by default. Do not persist filter values, selected project, view,
  scrolling, dialog state, or any server data.
- Add no account system, server API, schema migration, feature flag, environment variable, fallback
  mode, compatibility layer, dependency, or broad dashboard refactor.

## Phased Tasks

### Phase 1 - Preference contract and scope lock

- [x] Inspect `App.tsx`, `styles.css`, existing client `.mjs` helpers, and Studio tests to confirm the
      current collapse pattern, responsive filter layout, and direct-test boundary.
- [x] Define the all-or-nothing local-storage contract for the two required boolean collapsed fields
      and safe expanded defaults for missing, malformed, partial, or inaccessible storage.
- [x] Confirm filter values, project/view selection, task data, scroll position, and dialogs remain
      non-goals and are not added to the stored payload.

### Phase 2 - Safe preference foundation

- [x] Add `src/project-manager-studio/client/panel-preferences.mjs` and its declaration with one
      storage key plus guarded read/write functions that validate each boolean independently.
- [x] Add focused Node regression tests for valid restore, missing/partial/malformed data, a throwing
      `window.localStorage` property getter, and storage read/write failures without relying on a
      live browser.
- [x] Initialize Summary and Filters state once from the preference helper in `App.tsx` and persist
      the complete preference object whenever either control changes.

### Phase 3 - Collapsible Filters UI

- [x] Restructure the Filters markup in `App.tsx` so the persistent accessible panel toggle is an
      absolutely positioned child of the positioned `.toolbar` and a sibling of the native-hidden
      `.filter-controls` region, preserving the existing controls and clear-filter behavior while
      keeping the toggle available when collapsed with a non-overlapping Search box beneath it.
- [x] Extend `styles.css` so Filters uses the same disclosure-control visual language and icon
      rotation, retargets label rules through `.filter-controls`, positions Filters above Search and
      level with Priority, preserves the disclosure when collapsed, and lets later controls wrap
      without separating Search from Priority at intermediate or phone widths.
- [x] Inspect project switching, Kanban/Timeline switching, active filter semantics, keyboard
      controls, panel independence, and reduced-motion behavior to confirm no out-of-scope state is
      persisted or reset.

### Phase 4 - Verification and packaged delivery

- [x] Run `npm run typecheck`, `npm run test:pm`, and `npm run build`; fix relevant failures and
      record zero-diagnostic, complete-pass, and successful packaged-asset evidence.
- [x] Execute `.docs/tests/test-persist-dashboard-panel-state.md` in packaged Studio at desktop,
      800px intermediate, and phone widths, recording panel independence, reload restoration,
      project switching, accessibility state, filter behavior, row ordering, and browser console
      state; combine this with automated malformed, partial, getter-throwing, and operation-throwing
      storage tests for invalid/unavailable-storage evidence.
- [x] Run `git diff --check`, validate `skills/project-manager`, inspect the scoped diff, and sync the
      complete rebuilt installable directory with
      `rsync -a --delete skills/project-manager/ /Users/esun/.agents/skills/project-manager/`, then
      prove equality with
      `diff -qr skills/project-manager /Users/esun/.agents/skills/project-manager`.

## Validation

- `npm run typecheck` exits 0 without TypeScript diagnostics.
- `npm run test:pm` exits 0 with all project-manager and Studio tests passing, including preference
  helper coverage.
- `npm run build` exits 0 and regenerates the packaged Studio client assets.
- `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager`
  prints `Skill is valid!`.
- `git diff --check` exits 0 and repository/global skill trees match after synchronization.
- Browser E2E follows `.docs/tests/test-persist-dashboard-panel-state.md` at desktop, 800px, and phone
  widths and records restored Summary
  and Filters states, valid control relationships, exclusion
  of hidden inputs from keyboard/accessibility navigation, project-switch behavior, unchanged
  filtering, responsive behavior, and no runtime console errors. Automated helper tests provide
  malformed, partial, and pre-initialization throwing-`localStorage` evidence without mutating the
  packaged browser's storage through a test-only production path.

## Rollback / Risk

- Reading preferences during initialization can crash Studio if storage access throws. Keep every
  storage operation behind the guarded helper and test throwing storage implementations.
- An effect that writes defaults before restore could overwrite saved preferences. Read once before
  initializing either panel and persist only the resulting complete state.
- Collapsing the toolbar can leave active filters invisible. This is allowed presentation behavior;
  the Filters heading must remain visible and the filter values must remain active and recoverable
  when expanded.
- Native hiding can remove disclosure animation for Filters. Accessibility and predictable focus
  behavior take priority; keep Summary's existing non-interactive animation and use the shared
  disclosure-control styling without inventing a focus-management layer.
- A new panel wrapper can alter toolbar margins and responsive wrapping. Keep `.toolbar` as the inner
  layout owner, keep the persistent disclosure outside the native-hidden region, and verify its
  positioning, the `display: contents` region, collapsed minimum height, and first-line
  Search/Priority pairing at each supported width.
- Rollback reverts the preference helper/declaration/test, `App.tsx`, `styles.css`, and regenerated
  packaged assets together. Existing stored data becomes inert; no data migration is required.
