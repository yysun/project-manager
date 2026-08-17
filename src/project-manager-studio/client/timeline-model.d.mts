/* Type declarations for the Timeline's runtime-tested UTC date and canvas geometry. */
export interface DateRange { start: string; end: string }
export const DAY_MS: number;
export function toDay(date: string): number;
export function fromDay(value: number): string;
export function addDays(date: string, days: number): string;
export function dayDiff(start: string, end: string): number;
export function timelineRange(tasks: Array<{ scheduled_start: string | null; scheduled_end: string | null }>, project: { start_date: string | null; target_date: string | null }, milestones: Array<{ target_date: string | null; forecast_date: string | null }>, padding?: number): DateRange | null;
type OrderableTask = { id: string; milestone: string | null; scheduled_start: string | null; scheduled_end: string | null; order?: number | null };
export function compareDerived(a: OrderableTask, b: OrderableTask): number;
export function timelineOrder(tasks: OrderableTask[]): Map<string, number>;
export function sortTimelineTasks<T extends OrderableTask>(tasks: T[], order?: Map<string, number>): T[];
export function moveTaskOrder(sequence: string[], taskId: string, targetId: string, side: 'before' | 'after'): string[];
export function stepTaskOrder(sequence: string[], visibleIds: string[], taskId: string, delta: number): string[];
export function dropTargetIndex(pointerY: number, rows: Array<{ top: number; bottom: number }>, fromIndex: number): number;
export function edgeScrollVelocity(pointerY: number, viewport: number, options?: { top?: number; zone?: number; maxSpeed?: number }): number;
export function rangeDays(range: DateRange): number;
export function timelineContentWidth(range: DateRange, minimum?: number, weekWidth?: number): number;
export function timelineScaleTicks(range: DateRange, minimumLabelDays?: number): string[];
export function datePercent(date: string, range: DateRange): number;
export function barGeometry(start: string, end: string, range: DateRange): { left: number; width: number };
export function moveSchedule(start: string, end: string, days: number): DateRange;
export function resizeSchedule(start: string, end: string, edge: 'start' | 'end', days: number): DateRange;
export function pixelsToDays(pixels: number, width: number, days: number): number;
export interface TimelineMarker { date: string; label: string; kind: string }
export function timelineMarkers(project: { start_date: string | null; target_date: string | null }, milestones: Array<{ title: string; target_date: string | null; forecast_date: string | null }>): TimelineMarker[];
export interface DragSuppression { begin(): void; finish(moved: boolean): void; consume(): boolean }
export function createDragSuppression(): DragSuppression;
