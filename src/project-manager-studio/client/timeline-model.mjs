/* Pure UTC date and display geometry for Project Manager Studio Timeline.
   Ranges are inclusive; long canvases keep a readable weekly minimum width.
   Also owns marker derivation and drag-click suppression, extracted here so
   both are unit-testable without rendering the component.
   Row order lives here too: every task has an order number, stored or generated
   from the derived arrangement, and row moves are pure sequence transforms. */
export const DAY_MS = 86_400_000;

export function toDay(date) { return Date.parse(`${date}T00:00:00Z`); }
export function fromDay(value) { return new Date(value).toISOString().slice(0, 10); }
export function addDays(date, days) { return fromDay(toDay(date) + days * DAY_MS); }
export function dayDiff(start, end) { return Math.round((toDay(end) - toDay(start)) / DAY_MS); }

export function timelineRange(tasks, project, milestones, padding = 3) {
  const values = [project.start_date, project.target_date];
  for (const task of tasks) values.push(task.scheduled_start, task.scheduled_end);
  for (const milestone of milestones) values.push(milestone.target_date, milestone.forecast_date);
  const dates = values.filter((value) => typeof value === 'string');
  if (dates.length === 0) return null;
  dates.sort();
  return { start: addDays(dates[0], -padding), end: addDays(dates.at(-1), padding) };
}

/* The derived arrangement: the order every project had before stored row order
   existed. It is still the default generator and the tie-breaker, so a project
   that stores nothing renders exactly as it always did. */
export function compareDerived(a, b) {
  if (a.scheduled_start === null && b.scheduled_start !== null) return 1;
  if (a.scheduled_start !== null && b.scheduled_start === null) return -1;
  return (a.scheduled_start ?? '').localeCompare(b.scheduled_start ?? '')
    || (a.scheduled_end ?? '').localeCompare(b.scheduled_end ?? '')
    || (a.milestone ?? '').localeCompare(b.milestone ?? '')
    || a.id.localeCompare(b.id);
}

/* Every task has an order number: the stored one, or a default generated from its
   1-based position in the derived arrangement, so a task added after a reorder
   lands at its date position instead of being exiled to the end.

   Positions are doubled so the two kinds never collide. A stored order n becomes
   2n and a generated position n becomes 2n+1, which puts a generated default
   immediately after the stored row already holding that slot instead of
   displacing it — an operator's explicit choice outranks a default that merely
   computed the same number.

   Always build this from the complete task list: a filtered subset would generate
   different defaults and reshuffle rows the operator only meant to hide. */
export function timelineOrder(tasks) {
  const derived = [...tasks].sort(compareDerived);
  return new Map(derived.map((task, index) => [task.id, typeof task.order === 'number' ? task.order * 2 : (index + 1) * 2 + 1]));
}

export function sortTimelineTasks(tasks, order = timelineOrder(tasks)) {
  return [...tasks].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) || compareDerived(a, b));
}

/* Pure row move over the complete id sequence. The caller resolves the drop
   against a visible neighbour, but the move happens in full-project space, so
   tasks hidden by a filter keep their relative positions. */
export function moveTaskOrder(sequence, taskId, targetId, side) {
  if (taskId === targetId || !sequence.includes(taskId) || !sequence.includes(targetId)) return [...sequence];
  const remaining = sequence.filter((id) => id !== taskId);
  const index = remaining.indexOf(targetId) + (side === 'after' ? 1 : 0);
  return [...remaining.slice(0, index), taskId, ...remaining.slice(index)];
}

/* Which row a drag should displace, given the pointer position and the visible
   rows' vertical extents. Hovering a neighbour is not enough: the pointer must
   cross that row's midpoint in the direction of travel. Committing on mere
   overlap makes the drag oscillate, because the dragged row moves under the
   pointer as soon as it swaps and immediately satisfies the overlap test again.
   Midpoints also handle rows of unequal height, which Timeline has whenever a
   label carries blocker or schedule-conflict lines. Returns -1 for no move. */
export function dropTargetIndex(pointerY, rows, fromIndex) {
  const hovered = rows.findIndex((row) => pointerY >= row.top && pointerY <= row.bottom);
  if (hovered < 0 || hovered === fromIndex || fromIndex < 0) return -1;
  const midpoint = rows[hovered].top + (rows[hovered].bottom - rows[hovered].top) / 2;
  if (hovered > fromIndex && pointerY < midpoint) return -1;
  if (hovered < fromIndex && pointerY > midpoint) return -1;
  return hovered;
}

/* One step through the visible rows, for keyboard reordering. Moving past a
   hidden task is meaningless to the operator, so steps are taken against the
   visible list and then replayed in full-project space. */
export function stepTaskOrder(sequence, visibleIds, taskId, delta) {
  const visible = visibleIds.indexOf(taskId);
  const target = visibleIds[visible + delta];
  if (visible < 0 || target === undefined) return [...sequence];
  return moveTaskOrder(sequence, taskId, target, delta > 0 ? 'after' : 'before');
}

export function rangeDays(range) { return dayDiff(range.start, range.end) + 1; }
export function timelineContentWidth(range, minimum = 1020, weekWidth = 88) {
  return Math.max(minimum, Math.ceil(rangeDays(range) / 7) * weekWidth);
}
export function timelineScaleTicks(range, minimumLabelDays = 5) {
  const total = rangeDays(range);
  const ticks = Array.from({ length: Math.ceil(total / 7) }, (_, index) => addDays(range.start, index * 7))
    .filter((_, index) => index === 0 || total - index * 7 >= minimumLabelDays);
  const endYear = range.end.slice(0, 4);
  if (range.start.slice(0, 4) !== endYear && !ticks.some((date) => date.startsWith(endYear))) {
    if (ticks.length > 1) ticks[ticks.length - 1] = range.end;
    else ticks.push(range.end);
  }
  return ticks;
}
export function datePercent(date, range) { return ((dayDiff(range.start, date) + 0.5) / rangeDays(range)) * 100; }
export function barGeometry(start, end, range) {
  const days = rangeDays(range);
  return { left: (dayDiff(range.start, start) / days) * 100, width: ((dayDiff(start, end) + 1) / days) * 100 };
}
export function moveSchedule(start, end, days) { return { start: addDays(start, days), end: addDays(end, days) }; }
export function resizeSchedule(start, end, edge, days) {
  if (edge === 'start') {
    const candidate = addDays(start, days);
    return { start: candidate > end ? end : candidate, end };
  }
  const candidate = addDays(end, days);
  return { start, end: candidate < start ? start : candidate };
}
export function pixelsToDays(pixels, width, days) { return width <= 0 ? 0 : Math.round((pixels / width) * days); }

/* Marker derivation depends only on the project and its milestones, never on a
   task row, so it is computed once per render and passed down as a prop. */
export function timelineMarkers(project, milestones) {
  return [
    project.start_date && { date: project.start_date, label: 'Project start', kind: 'project' },
    project.target_date && { date: project.target_date, label: 'Project target', kind: 'project' },
    ...milestones.flatMap((milestone) => [
      milestone.target_date && { date: milestone.target_date, label: `${milestone.title} target`, kind: 'target' },
      milestone.forecast_date && { date: milestone.forecast_date, label: `${milestone.title} forecast`, kind: 'forecast' },
    ]),
  ].filter(Boolean);
}

/* Drag-click suppression. A drag that ends away from its bar produces no click,
   so the flag must be cleared when the next drag begins rather than only by the
   click it suppresses — otherwise it swallows a click on an unrelated bar. */
export function createDragSuppression() {
  let suppressed = false;
  return {
    begin() { suppressed = false; },
    finish(moved) { suppressed = Boolean(moved); },
    consume() { const value = suppressed; suppressed = false; return value; },
  };
}
