# Test Manager Suite timeline and demo

## Summary

- Added optional Suite planned start and target dates, a Project Manager-style weekly scale, and
  full-height Suite markers in Timeline; target dates use the same orange visual language as
  Project Manager.
- Kept `All suites` as the default and added a Suite filter so a multi-Suite Timeline remains useful
  while focused inspection is still one click away.
- Expanded Timeline rows with case and execution context while preserving unscheduled Cases in the
  dated grid and keeping planning state separate from immutable Run evidence.
- Added a deterministic Test Demo with three Suites, seven Cases, five evidence-backed Runs, all six
  Kanban columns, Suite dates, retest history, and a blocked release gate, plus zero-setup disposable
  and persistent launch paths.

## Verification

- `npm test` — passed: build, 247 Project Manager tests, and 8 Test Manager tests.
- `npm run check:syntax` and both skill quick validators — passed.
- `npm run test:e2e:tm` — passed against a temporary standalone Test Manager workspace.
- Browser acceptance — passed for Kanban counts and gate, multi-Suite Timeline rows/bars/unscheduled
  Cases/full-height date markers, filtered Suite state, and Run history.
- The rebuilt plugin was reinstalled, and its installed cache matches the repository package.

## Notes

- The persistent demo root is intentionally ignored; the fixture generator refuses to replace a
  directory it did not create.
- No release version, tag, or publication changed.
