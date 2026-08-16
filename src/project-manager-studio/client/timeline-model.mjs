/* Pure UTC date and display geometry for Project Manager Studio Timeline.
   Ranges are inclusive; long canvases keep a readable weekly minimum width.
   Also owns marker derivation and drag-click suppression, extracted here so
   both are unit-testable without rendering the component. */
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

export function sortTimelineTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.scheduled_start === null && b.scheduled_start !== null) return 1;
    if (a.scheduled_start !== null && b.scheduled_start === null) return -1;
    return (a.scheduled_start ?? '').localeCompare(b.scheduled_start ?? '')
      || (a.scheduled_end ?? '').localeCompare(b.scheduled_end ?? '')
      || (a.milestone ?? '').localeCompare(b.milestone ?? '')
      || a.id.localeCompare(b.id);
  });
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
