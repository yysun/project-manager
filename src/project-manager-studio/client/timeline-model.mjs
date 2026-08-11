/* Pure UTC date and display geometry for Project Manager Studio Timeline.
   Ranges are inclusive; long canvases keep a readable weekly minimum width. */
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
