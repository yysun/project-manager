/* Pure UTC date and display geometry for Test Manager Studio Timeline.
   Behavior intentionally matches Project Manager's readable weekly canvas,
   while remaining self-contained inside the standalone Test Manager skill. */

export const DAY_MS = 86_400_000;

export function toDay(date) {
  return Date.parse(`${date}T00:00:00Z`);
}

export function fromDay(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function addDays(date, days) {
  return fromDay(toDay(date) + days * DAY_MS);
}

export function dayDiff(start, end) {
  return Math.round((toDay(end) - toDay(start)) / DAY_MS);
}

export function timelineRange(items, padding = 3) {
  const dates = items
    .flatMap((item) => [item.plannedStart, item.plannedEnd])
    .filter((value) => typeof value === "string")
    .sort();
  if (!dates.length) return null;
  return {
    start: addDays(dates[0], -padding),
    end: addDays(dates.at(-1), padding),
  };
}

export function timelineMarkers(suites) {
  return suites.flatMap((suite) =>
    [
      suite.plannedStart && {
        date: suite.plannedStart,
        kind: "start",
        label: `${suite.title} start`,
        suite: suite.slug,
      },
      suite.plannedEnd && {
        date: suite.plannedEnd,
        kind: "target",
        label: `${suite.title} target`,
        suite: suite.slug,
      },
    ].filter(Boolean),
  );
}

export function timelineLayout(testCases, suites, padding = 3) {
  const scheduled = testCases.filter(
    (item) => item.plannedStart || item.plannedEnd,
  );
  const unscheduled = testCases.filter(
    (item) => !item.plannedStart && !item.plannedEnd,
  );
  const datedItems = [
    ...testCases,
    ...suites.map((suite) => ({
      plannedStart: suite.plannedStart,
      plannedEnd: suite.plannedEnd,
    })),
  ];
  const ordered = [...testCases].sort((a, b) => {
    const aDate = a.plannedStart || a.plannedEnd;
    const bDate = b.plannedStart || b.plannedEnd;
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return (
      (aDate || "").localeCompare(bDate || "") ||
      String(a.suiteTitle ?? "").localeCompare(String(b.suiteTitle ?? "")) ||
      String(a.id ?? "").localeCompare(String(b.id ?? ""))
    );
  });
  return {
    bounds: timelineRange(datedItems, 0),
    markers: timelineMarkers(suites),
    ordered,
    range: timelineRange(datedItems, padding),
    scheduled,
    unscheduled,
  };
}

export function rangeDays(range) {
  return dayDiff(range.start, range.end) + 1;
}

export function timelineContentWidth(range, minimum = 1020, weekWidth = 88) {
  return Math.max(minimum, Math.ceil(rangeDays(range) / 7) * weekWidth);
}

export function timelineScaleTicks(range, minimumLabelDays = 5) {
  const total = rangeDays(range);
  const ticks = Array.from(
    { length: Math.ceil(total / 7) },
    (_, index) => addDays(range.start, index * 7),
  ).filter((_, index) => index === 0 || total - index * 7 >= minimumLabelDays);
  const endYear = range.end.slice(0, 4);
  if (
    range.start.slice(0, 4) !== endYear &&
    !ticks.some((date) => date.startsWith(endYear))
  ) {
    if (ticks.length > 1) ticks[ticks.length - 1] = range.end;
    else ticks.push(range.end);
  }
  return ticks;
}

export function datePercent(date, range) {
  return ((dayDiff(range.start, date) + 0.5) / rangeDays(range)) * 100;
}

export function rangeContains(date, range) {
  return date >= range.start && date <= range.end;
}

export function barGeometry(start, end, range) {
  const days = rangeDays(range);
  return {
    left: (dayDiff(range.start, start) / days) * 100,
    width: ((dayDiff(start, end) + 1) / days) * 100,
  };
}
