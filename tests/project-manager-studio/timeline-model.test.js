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
