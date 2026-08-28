# Done: Home-relative Project Manager skill path

## Outcome

Workspace initialization now writes an in-home Project Manager skill path as `~/...` and keeps an
out-of-home path absolute. The generated POSIX and Windows launchers expand only the supported
home-relative prefix, continue to parse `.env.local` as data, and reject other relative forms.

The initializer also recognizes the exact hashes of the previously published `.projects` launchers,
so repeat initialization upgrades those managed files transactionally without treating unrelated
launcher content as owned.

Root and skill-level English and Chinese documentation now explain the generated `.projects` files,
launch commands, path forms, and parsing boundary.

## Verification

- Focused initialization and launcher tests: 5 passed.
- `npm run build:plugin`: passed.
- `npm run typecheck`: passed.
- `npm test`: 243 passed.
- Project Manager skill quick validation: passed.
- Temporary-workspace POSIX Studio/API smoke test: generated `~/...`, unauthorized request returned
  401, authenticated request returned 200.
- Windows launcher contract: statically verified; no Windows runtime was available in this run.
- Complete plugin source synchronized to the personal marketplace and reinstalled with
  `codex plugin remove/add`; the installed `local` cache matches the source, apart from installer
  metadata generated under `.codex-plugin`.

## Release

No version, changelog, tag, or publication change was made.
