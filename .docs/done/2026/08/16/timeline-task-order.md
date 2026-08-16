# Timeline manual task order

## Summary

- Studio Timeline rows can now be reordered by dragging the left-column grip, and the result is a
  persisted project fact rather than browser state.
- Every task has an order number: `TASKS.md` schema v4 stores it as optional `order`, and a task
  without one takes a default generated from the existing derived arrangement, so a project that
  has never been reordered renders exactly as before. There is no ordering mode or toggle.
- Positions are doubled internally (stored `n` → `2n`, generated `n` → `2n+1`) so a task added
  later can never tie with, and displace, a row that explicitly claimed that slot.
- Reorder is a whole-project write on one new route, `PUT /api/task-order`, guarded by
  `mutationRevision` and serialized through the same save queue as task edits. The client sends
  the complete task sequence, so a drop made while filters hide rows leaves hidden tasks in place.
- Row order has its own project-level authority: done, cancelled and evidence-backed tasks stay
  reorderable because order changes no specification, and only a complete project refuses it.
- `order` is excluded from the task specification hash and Task Contract, and a reorder leaves
  every task's `updated` date alone.
- v1/v2/v3 keep their exact normalized shapes, so installing v4 support cannot stale an untouched
  project's `STATUS.md`.

## Verification

- `npm run typecheck` — passed.
- `npm run build` — passed (server bundle, Vite client, plugin packaging).
- `npm run test:pm` — 223 tests, 223 pass, 0 fail, including new cases in `timeline-model.test.js`
  (generated defaults, stored-wins-its-slot, pure row moves under filtering), `task-editor.test.js`
  (v4 persistence, clearing, preserved schedule/disposition, authority, invalid and interrupted
  writes, pre-v4 rejection), and `studio-server.test.js` (the order route, 409 on stale revision,
  malformed requests, reset, concurrent writes).
- Byte-stability gate: v1, v2 and v3 fixture projects produce identical `source_sha256` values on
  HEAD and on the working tree, with `status_stale` false on both.
- Contract stability: `taskSpecHash` is proven identical with and without an `order` field, and
  task revisions are asserted unchanged across reorders, including for an evidence-backed task.
- E2E scenarios executed against a spawned Studio in a browser: derived order with no stored
  numbers, pointer drag with a staged draft, save and reload, keyboard reorder with the position
  announced, a filtered drop that preserved hidden rows exactly, reset clearing every field, label
  click still opening the dialog, and an externally appended task landing at its date position.
  No console errors.

## Notes

- Schema v4 is forward-only, like v2 and v3 before it: a project that has been reordered cannot be
  read by an older installed copy of the skill. The version rises only when an operator actually
  reorders, so untouched projects stay readable.
- Reordering during a pointer drag has no edge auto-scroll; long lists are reordered a step at a
  time or by keyboard. Deliberately out of scope.
- Kanban within-lane order, `project next`, and every ranking and scheduling calculation are
  untouched; order is Timeline display order only.
- `npm run demo` fails in this checkout because `demo/pm-studio-demo/` exists without a
  `PROJECT.md`, so the generator refuses to replace it. Pre-existing and unrelated to this change;
  a scratch fixture was used for the E2E run instead.
