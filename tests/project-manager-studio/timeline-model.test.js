/* Timeline geometry regressions: UTC-only inclusive ranges, readable long
   canvases, cross-boundary movement, and deterministic pixel conversion. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

test('timeline date math stays UTC across DST, month, year, and leap-day boundaries', async () => {
  const model = await import('../../src/project-manager-studio/client/timeline-model.mjs');
  assert.equal(model.dayDiff('2026-03-07', '2026-03-10'), 3);
  assert.equal(model.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(model.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(model.addDays('2028-02-29', 1), '2028-03-01');
});

test('timeline ranges and bars are inclusive and use explicit facts only', async () => {
  const model = await import('../../src/project-manager-studio/client/timeline-model.mjs');
  const empty = model.timelineRange([{ scheduled_start: null, scheduled_end: null }], { start_date: null, target_date: null }, []);
  assert.equal(empty, null);
  const range = model.timelineRange([{ scheduled_start: '2026-08-10', scheduled_end: '2026-08-10' }], { start_date: null, target_date: null }, [], 0);
  assert.deepEqual(range, { start: '2026-08-10', end: '2026-08-10' }); assert.equal(model.rangeDays(range), 1);
  assert.deepEqual(model.barGeometry('2026-08-10', '2026-08-10', range), { left: 0, width: 100 });
  const padded = model.timelineRange([], { start_date: '2026-08-01', target_date: '2026-08-31' }, [], 3);
  assert.deepEqual(padded, { start: '2026-07-29', end: '2026-09-03' });
});

test('timeline tasks sort chronologically with unscheduled work last', async () => {
  const model = await import('../../src/project-manager-studio/client/timeline-model.mjs');
  const tasks = [
    { id: 'LATE', milestone: 'M-FIRST', scheduled_start: '2026-08-20', scheduled_end: '2026-08-21' },
    { id: 'UNSCHEDULED', milestone: 'M-FIRST', scheduled_start: null, scheduled_end: null },
    { id: 'EARLY-LONG', milestone: 'M-LAST', scheduled_start: '2026-08-10', scheduled_end: '2026-08-12' },
    { id: 'EARLY-SHORT', milestone: 'M-LAST', scheduled_start: '2026-08-10', scheduled_end: '2026-08-11' },
  ];
  assert.deepEqual(model.sortTimelineTasks(tasks).map((task) => task.id), ['EARLY-SHORT', 'EARLY-LONG', 'LATE', 'UNSCHEDULED']);
  assert.deepEqual(tasks.map((task) => task.id), ['LATE', 'UNSCHEDULED', 'EARLY-LONG', 'EARLY-SHORT']);
});

test('every task gets an order number, stored winning over the generated default', async () => {
  const model = await import('../../src/project-manager-studio/client/timeline-model.mjs');
  const tasks = [
    { id: 'LATE', milestone: null, scheduled_start: '2026-08-20', scheduled_end: '2026-08-21', order: null },
    { id: 'UNSCHEDULED', milestone: null, scheduled_start: null, scheduled_end: null, order: null },
    { id: 'EARLY', milestone: null, scheduled_start: '2026-08-10', scheduled_end: '2026-08-11', order: null },
  ];
  // No stored order: generated defaults reproduce the derived arrangement exactly.
  assert.equal(tasks.every((task) => model.timelineOrder(tasks).has(task.id)), true);
  assert.deepEqual(model.sortTimelineTasks(tasks).map((task) => task.id), ['EARLY', 'LATE', 'UNSCHEDULED']);

  // Stored order wins its slot: EARLY is first by date, but LATE stores position
  // 1, so the generated default sits after it rather than displacing it.
  const mixed = [{ ...tasks[0], order: 1 }, { ...tasks[1], order: 2 }, tasks[2]];
  assert.deepEqual(model.sortTimelineTasks(mixed).map((task) => task.id), ['LATE', 'EARLY', 'UNSCHEDULED']);

  // A filtered subset keeps the relative order the full list defines.
  const order = model.timelineOrder(mixed);
  assert.deepEqual(model.sortTimelineTasks([mixed[2], mixed[0]], order).map((task) => task.id), ['LATE', 'EARLY']);
});

test('row moves are pure permutations that leave filtered-out tasks in place', async () => {
  const model = await import('../../src/project-manager-studio/client/timeline-model.mjs');
  const sequence = ['A', 'HIDDEN', 'B', 'C'];
  assert.deepEqual(model.moveTaskOrder(sequence, 'C', 'A', 'before'), ['C', 'A', 'HIDDEN', 'B']);
  assert.deepEqual(model.moveTaskOrder(sequence, 'A', 'C', 'after'), ['HIDDEN', 'B', 'C', 'A']);
  assert.deepEqual(model.moveTaskOrder(sequence, 'A', 'A', 'before'), sequence);
  assert.deepEqual(model.moveTaskOrder(sequence, 'A', 'GHOST', 'before'), sequence);
  assert.deepEqual(sequence, ['A', 'HIDDEN', 'B', 'C']);

  // Keyboard steps move through visible rows but rewrite the full sequence, so a
  // hidden task never changes position relative to its neighbours.
  const visible = ['A', 'B', 'C'];
  assert.deepEqual(model.stepTaskOrder(sequence, visible, 'A', 1), ['HIDDEN', 'B', 'A', 'C']);
  assert.deepEqual(model.stepTaskOrder(sequence, visible, 'C', -1), ['A', 'HIDDEN', 'C', 'B']);
  assert.deepEqual(model.stepTaskOrder(sequence, visible, 'A', -1), sequence);
  assert.deepEqual(model.stepTaskOrder(sequence, visible, 'C', 1), sequence);
});

test('timeline canvas expands for long ranges instead of compressing weekly labels', async () => {
  const model = await import('../../src/project-manager-studio/client/timeline-model.mjs');
  assert.equal(model.timelineContentWidth({ start: '2026-08-10', end: '2026-08-16' }), 1020);
  assert.equal(model.timelineContentWidth({ start: '2026-01-01', end: '2026-12-31' }), 4664);
  const yearTicks = model.timelineScaleTicks({ start: '2026-01-01', end: '2026-12-31' });
  assert.equal(yearTicks.at(-1), '2026-12-24');
  assert.deepEqual(model.timelineScaleTicks({ start: '2026-12-28', end: '2027-01-03' }), ['2026-12-28', '2027-01-03']);
  assert.deepEqual(model.timelineScaleTicks({ start: '2026-01-08', end: '2027-01-01' }).slice(-2), ['2026-12-17', '2027-01-01']);
});

test('move and resize preserve valid inclusive intervals and clamp inversion', async () => {
  const model = await import('../../src/project-manager-studio/client/timeline-model.mjs');
  assert.deepEqual(model.moveSchedule('2026-08-30', '2026-09-02', 3), { start: '2026-09-02', end: '2026-09-05' });
  assert.deepEqual(model.resizeSchedule('2026-08-10', '2026-08-15', 'start', 2), { start: '2026-08-12', end: '2026-08-15' });
  assert.deepEqual(model.resizeSchedule('2026-08-10', '2026-08-15', 'end', -2), { start: '2026-08-10', end: '2026-08-13' });
  assert.deepEqual(model.resizeSchedule('2026-08-10', '2026-08-15', 'start', 99), { start: '2026-08-15', end: '2026-08-15' });
  assert.deepEqual(model.resizeSchedule('2026-08-10', '2026-08-15', 'end', -99), { start: '2026-08-10', end: '2026-08-10' });
  assert.equal(model.pixelsToDays(50, 1000, 100), 5); assert.equal(model.pixelsToDays(50, 0, 100), 0);
});

test('markers derive once from project and milestones, independent of task rows', async () => {
  const model = await import('../../src/project-manager-studio/client/timeline-model.mjs');
  const project = { start_date: '2026-08-01', target_date: null };
  const milestones = [
    { title: 'Alpha', target_date: '2026-08-20', forecast_date: null },
    { title: 'Beta', target_date: null, forecast_date: '2026-09-01' },
  ];
  const markers = model.timelineMarkers(project, milestones);
  assert.deepEqual(markers, [
    { date: '2026-08-01', label: 'Project start', kind: 'project' },
    { date: '2026-08-20', label: 'Alpha target', kind: 'target' },
    { date: '2026-09-01', label: 'Beta forecast', kind: 'forecast' },
  ]);
  assert.deepEqual(model.timelineMarkers({ start_date: null, target_date: null }, []), []);
});

test('drag suppression clears a stale flag when the next drag begins', async () => {
  const model = await import('../../src/project-manager-studio/client/timeline-model.mjs');
  const suppression = model.createDragSuppression();
  assert.equal(suppression.consume(), false);
  // A drag that moved, whose pointer was released away from the bar, so no
  // click follows and the flag is never consumed.
  suppression.begin(); suppression.finish(true);
  // Clicking a different bar starts with that bar's pointerdown.
  suppression.begin();
  assert.equal(suppression.consume(), false, 'stale suppression must not swallow an unrelated click');
  // A drag followed by its own click is still suppressed exactly once.
  suppression.begin(); suppression.finish(true);
  assert.equal(suppression.consume(), true);
  assert.equal(suppression.consume(), false);
  // A press that never moved is a click, not a drag.
  suppression.begin(); suppression.finish(false);
  assert.equal(suppression.consume(), false);
});
