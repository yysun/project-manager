# Project Manager Kanban Studio Performance Evidence

Measured on 2026-08-08 with Node.js on a temporary project containing 10,001 entries and one
100 MiB payload. Both `mutationRevision` and an authenticated packaged-server `GET /api/project`
ran three times over the complete tree.

- Revision runs: 224.10 ms, 189.10 ms, 188.08 ms; median 189.10 ms
- Project GET runs: 372.97 ms, 362.14 ms, 360.50 ms; median 362.14 ms
- Thresholds: project GET median ≤ 2,000 ms; no revision run > 1,000 ms
- Result: pass

The exact-tree revision remains intentionally O(project entries + bytes). Studio exposes loading and
checking states rather than treating large-folder refresh as free.
