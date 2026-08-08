# Studio Project Selection — Done

## Summary

- Project Manager Studio now defaults to `<launch-working-directory>/.projects` and offers every valid direct-child project through an accessible selector.
- `--project`, `--projects-root`, and combined launch modes remain explicit; no fallback to `projects`, recursive discovery, or client-supplied filesystem path was introduced.
- Server-issued opaque keys bind reads, checks, and serialized saves to one catalog entry, while selected-entry revalidation rejects removal, rename, symlink replacement, and project-ID drift.
- Tab-local generation and operation guards reject late cross-project and same-project responses; switching stays available during pending work without allowing old completion state to leak.
- Atomic checks and saves use unique marker-bound same-filesystem recovery roots that cannot alias a project or poison catalog restart after interruption.

## Verification

- `npm run typecheck`, `npm run build`, and `git diff --check` passed; generated packaged server and hashed client assets match source.
- `npm run test:pm` passed 75/75 with zero failures or skips, including packaged-runtime recovery, catalog containment, CLI modes, stale keys, per-project mutations, and async response ordering.
- E2E Scenarios 1–4 passed through the corrected sibling fixture, in-app browser, selection guard, and server isolation tests: Alpha/Beta offered, outside sibling absent, state reset, concurrent switch safe, and tabs independent.
- E2E Scenarios 5–20 passed through named stale-entry, launch-mode, root-error, malformed-catalog, duplicate-ID, and ID-drift tests; Scenarios 21–25 passed through CLI syntax cases.
- `AR passed: no blocking architecture flaws`; `CR passed: no major findings`; `VR passed: all acceptance criteria complete`.

## Notes

- Studio remains a loopback same-user tool. It fails closed for ordinary path, symlink, revision, and stale-selection cases but does not claim protection against a malicious same-user process racing filesystem system calls.
