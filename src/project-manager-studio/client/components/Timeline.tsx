// Project Manager Studio Timeline: range-sized weekly planning grid with a
// shared app-header offset, synchronized dates, lifecycle-only bar fills,
// task-local issue dots, edit-safe auto-refresh barriers, and revision-safe saves.
// Markers and the scale formatter are derived once per render rather than per
// task row, and drag-click suppression is a pure helper that clears on each new
// drag so it cannot swallow a click on an unrelated bar.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type UIEvent } from 'react';
import type { ApiError, KanbanData, KanbanTask, TaskEditRequest, TaskOrderRequest } from '../../shared/api';
import { barGeometry, compareDerived, createDragSuppression, datePercent, dayDiff, dropTargetIndex, moveSchedule, moveTaskOrder, pixelsToDays, rangeDays, resizeSchedule, sortTimelineTasks, stepTaskOrder, timelineContentWidth, timelineMarkers, timelineOrder, timelineRange, timelineScaleTicks, type DateRange, type DragSuppression, type TimelineMarker } from '../timeline-model.mjs';
import type { SelectionRequest } from '../selection-guard.mjs';

interface Props {
  data: KanbanData;
  tasks: KanbanTask[];
  stickyTop: number;
  onOpen: (task: KanbanTask, opener: HTMLElement) => void;
  onDraftChange: (pending: boolean) => void;
  beginMutation: () => SelectionRequest | null;
  finishMutation: (request: SelectionRequest) => void;
  onSaved: (data: KanbanData, request: SelectionRequest) => void;
}
// Constructed once at module scope: TimelineScale re-renders at pointer
// frequency during a drag, and a fresh formatter per render is pure waste.
const SCALE_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function send<T>(url: string, request: T) {
  return fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
}

// One draft at a time. Both kinds raise the same auto-refresh barrier and are
// saved from the same banner, so a pending schedule change can never be lost by
// starting a reorder, or the reverse.
interface ScheduleDraft { kind: 'schedule'; taskId: string; start: string; end: string }
interface OrderDraft { kind: 'order'; sequence: string[] | null }
type Draft = ScheduleDraft | OrderDraft;
interface Drag { task: KanbanTask; mode: 'move' | 'start' | 'end'; originX: number; width: number; start: string; end: string; moved: boolean }
// `sequence` carries the latest move so pointerup can announce the final
// position without reading a `draft` closure captured at an earlier render.
interface RowDrag { taskId: string; sequence: string[] | null }

export function Timeline({ data, tasks, stickyTop, onOpen, onDraftChange, beginMutation, finishMutation, onSaved }: Props) {
  const range = useMemo(() => timelineRange(data.tasks, data.project, data.milestones), [data]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // State, not the drag ref: a ref cannot re-render, so a ref-driven highlight
  // would linger after the drop until something else happened to re-render.
  const [dragging, setDragging] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const rowDrag = useRef<RowDrag | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const headerScroll = useRef<HTMLDivElement | null>(null);
  // Lazy initializer: constructed once for the component's lifetime, not
  // rebuilt on every pointer-frequency re-render during a drag.
  const [suppressClick] = useState(createDragSuppression);

  const scheduleDraft = draft?.kind === 'schedule' ? draft : null;
  const orderable = data.project.task_order_editable;
  const stored = data.tasks.some((task) => task.order !== null);
  // Built from every task, never the filtered subset: generated defaults must not
  // depend on what the operator happens to be hiding.
  const storedSequence = useMemo(() => sortTimelineTasks(data.tasks, timelineOrder(data.tasks)).map((task) => task.id), [data.tasks]);
  const derivedSequence = useMemo(() => [...data.tasks].sort(compareDerived).map((task) => task.id), [data.tasks]);
  const sequence = draft?.kind === 'order' ? draft.sequence ?? derivedSequence : storedSequence;
  const rank = useMemo(() => new Map(sequence.map((id, index) => [id, index])), [sequence]);
  const ordered = useMemo(() => [...tasks].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)), [tasks, rank]);
  const markers = useMemo(() => timelineMarkers(data.project, data.milestones), [data.project, data.milestones]);
  useEffect(() => () => onDraftChange(false), [onDraftChange]);

  // Only tell the shell when the pending state actually flips. A drag commits a
  // new draft on every crossed row, and each notification re-enters the parent's
  // refresh-barrier bookkeeping for no change.
  function updateDraft(next: Draft | null) {
    if ((next !== null) !== (draft !== null)) onDraftChange(next !== null);
    setDraft(next);
  }

  function registerRow(taskId: string, element: HTMLElement | null) {
    if (element) rows.current.set(taskId, element); else rows.current.delete(taskId);
  }

  function beginRowDrag(event: PointerEvent<HTMLElement>, task: KanbanTask) {
    if (!orderable || scheduleDraft) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    rowDrag.current = { taskId: task.id, sequence: null };
    setDragging(task.id); setError(null);
  }

  function moveRow(event: PointerEvent<HTMLElement>) {
    const current = rowDrag.current;
    if (!current) return;
    const visible = ordered.map((task) => task.id);
    const from = visible.indexOf(current.taskId);
    const extents = visible.map((id) => {
      const rect = rows.current.get(id)?.getBoundingClientRect();
      return { top: rect?.top ?? Infinity, bottom: rect?.bottom ?? -Infinity };
    });
    const to = dropTargetIndex(event.clientY, extents, from);
    if (to < 0) return;
    current.sequence = moveTaskOrder(sequence, current.taskId, visible[to], to > from ? 'after' : 'before');
    updateDraft({ kind: 'order', sequence: current.sequence });
  }

  function finishRow() {
    const current = rowDrag.current;
    if (!current) return;
    rowDrag.current = null;
    setDragging(null);
    if (current.sequence) announce(current.taskId, current.sequence);
  }

  function nudgeRow(event: KeyboardEvent<HTMLElement>, task: KanbanTask) {
    if (!orderable || scheduleDraft || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); setError(null);
    const next = stepTaskOrder(sequence, ordered.map((item) => item.id), task.id, event.key === 'ArrowDown' ? 1 : -1);
    updateDraft({ kind: 'order', sequence: next });
    announce(task.id, next);
  }

  function announce(taskId: string, next: string[]) {
    const visible = next.filter((id) => tasks.some((task) => task.id === id));
    const title = data.tasks.find((task) => task.id === taskId)?.title ?? taskId;
    setAnnouncement(`${title} moved to position ${visible.indexOf(taskId) + 1} of ${visible.length}`);
  }

  function resetOrder() {
    if (!orderable || scheduleDraft) return;
    updateDraft({ kind: 'order', sequence: null });
    setError(null); setAnnouncement('Row order reset to generated defaults; save to apply.');
  }

  function syncHeader(event: UIEvent<HTMLDivElement>) {
    if (headerScroll.current) headerScroll.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  function begin(event: PointerEvent<HTMLElement>, task: KanbanTask, mode: Drag['mode']) {
    // Cleared before the guards: a previous drag that ended away from its bar
    // left the flag set, and it must not swallow a click on a different task.
    suppressClick.begin();
    if (!range || !task.schedule_editable || !task.scheduled_start || !task.scheduled_end || draft?.kind === 'order') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const track = event.currentTarget.closest('.timeline-track') as HTMLElement | null;
    drag.current = { task, mode, originX: event.clientX, width: track?.getBoundingClientRect().width ?? 0, start: task.scheduled_start, end: task.scheduled_end, moved: false };
    updateDraft({ kind: 'schedule', taskId: task.id, start: task.scheduled_start, end: task.scheduled_end });
    setError(null);
  }

  function move(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || !range) return;
    const days = pixelsToDays(event.clientX - current.originX, current.width, rangeDays(range));
    current.moved ||= days !== 0;
    const next = current.mode === 'move' ? moveSchedule(current.start, current.end, days) : resizeSchedule(current.start, current.end, current.mode, days);
    updateDraft({ kind: 'schedule', taskId: current.task.id, ...next });
  }

  function finish() {
    if (!drag.current) return;
    suppressClick.finish(drag.current.moved);
    drag.current = null;
  }

  function nudge(event: KeyboardEvent<HTMLElement>, task: KanbanTask, mode: Drag['mode']) {
    if (!task.schedule_editable || !task.scheduled_start || !task.scheduled_end || !['ArrowLeft', 'ArrowRight'].includes(event.key) || draft?.kind === 'order') return;
    event.preventDefault(); setError(null);
    const current = scheduleDraft?.taskId === task.id ? { start: scheduleDraft.start, end: scheduleDraft.end } : { start: task.scheduled_start, end: task.scheduled_end };
    const days = event.key === 'ArrowLeft' ? -1 : 1;
    const next = mode === 'move' ? moveSchedule(current.start, current.end, days) : resizeSchedule(current.start, current.end, mode, days);
    updateDraft({ kind: 'schedule', taskId: task.id, ...next });
  }

  async function saveDraft() {
    if (!draft) return;
    const schedule = draft.kind === 'schedule' ? data.tasks.find((item) => item.id === draft.taskId) : null;
    if (draft.kind === 'schedule' && !schedule) return;
    const operation = beginMutation();
    if (!operation) { setError('Another project operation is already in progress.'); return; }
    const fallback = draft.kind === 'schedule' ? 'Could not save schedule.' : 'Could not save row order.';
    setBusy(true); setError(null);
    try {
      const response = draft.kind === 'schedule'
        ? await send<TaskEditRequest>(`/api/tasks/${encodeURIComponent(schedule!.id)}`, { projectKey: data.project.key, mutationRevision: data.mutation_revision, taskRevision: schedule!.task_revision, edit: { scheduled_start: draft.start, scheduled_end: draft.end } })
        : await send<TaskOrderRequest>('/api/task-order', { projectKey: data.project.key, mutationRevision: data.mutation_revision, order: draft.sequence });
      const body = await response.json();
      if (!response.ok) throw new Error((body.errors as ApiError[] | undefined)?.[0]?.message ?? fallback);
      updateDraft(null); setAnnouncement(''); onSaved(body.data, operation);
    } catch (value) { setError(value instanceof Error ? value.message : fallback); }
    finally { finishMutation(operation); setBusy(false); }
  }

  const row = (task: KanbanTask) => <TimelineLabel task={task} onOpen={onOpen} orderable={orderable} reason={data.project.task_order_edit_reason} locked={scheduleDraft !== null}
    dragging={dragging === task.id} register={registerRow} onBegin={beginRowDrag} onMove={moveRow} onFinish={finishRow} onNudge={nudgeRow} />;

  return <section className={`timeline-panel ${dragging ? 'timeline-panel--reordering' : ''}`} aria-label="Task timeline">
    {draft && <div className="timeline-draft-actions" role="status">
      <span>{draft.kind === 'schedule' ? `${draft.start} → ${draft.end}` : draft.sequence === null ? 'Row order reset to generated defaults' : 'Row order changed'}</span>
      <button className="secondary-button" disabled={busy} onClick={() => { updateDraft(null); setError(null); setAnnouncement(''); }}>Cancel</button>
      <button className="primary-button" disabled={busy} onClick={() => void saveDraft()}>{busy ? 'Saving…' : draft.kind === 'schedule' ? 'Save schedule' : 'Save order'}</button>
    </div>}
    {error && <div className="error-banner" role="alert">{draft?.kind === 'order' ? 'Row order save failed' : 'Schedule save failed'}: {error}</div>}
    <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    {!range ? <div className="timeline-no-range"><strong>No dated work yet</strong><p>Open a task to add its scheduled start and end. No dates are inferred.</p>{ordered.map((task) => <div className="timeline-row-group timeline-row-group--flat" key={task.id}>{row(task)}</div>)}</div> : <>
      <div className="timeline-sticky-header" style={{ '--timeline-content-width': `${timelineContentWidth(range)}px`, top: stickyTop } as React.CSSProperties}>
        <div className="timeline-label timeline-label--header"><strong>Task</strong><span>{ordered.length} shown</span>
          {stored && orderable && <button type="button" className="timeline-order-reset" disabled={busy || scheduleDraft !== null} onClick={resetOrder}>Reset order</button>}
        </div>
        <div className="timeline-header-viewport" ref={headerScroll}><TimelineScale range={range} /></div>
      </div>
      <div className="timeline-scroll" role="region" aria-label="Scrollable task timeline" tabIndex={0} onScroll={syncHeader}>
        <div className="timeline-grid" style={{ '--timeline-days': rangeDays(range), '--timeline-content-width': `${timelineContentWidth(range)}px` } as React.CSSProperties}>
          {ordered.map((task) => {
            const shown = scheduleDraft?.taskId === task.id ? { start: scheduleDraft.start, end: scheduleDraft.end } : task.scheduled_start && task.scheduled_end ? { start: task.scheduled_start, end: task.scheduled_end } : null;
            return <div className="timeline-row-group" key={task.id}>
              {row(task)}
              <div className={`timeline-track ${dragging === task.id ? 'timeline-track--dragging' : ''}`}>
                <Markers markers={markers} range={range} />
                {shown ? <ScheduleBar task={task} range={range} start={shown.start} end={shown.end} draft={scheduleDraft?.taskId === task.id} onOpen={onOpen} onBegin={begin} onMove={move} onFinish={finish} onNudge={nudge} suppressClick={suppressClick} /> : <button className="unscheduled-button" onClick={(event) => onOpen(task, event.currentTarget)}>Unscheduled · add dates</button>}
              </div>
            </div>;
          })}
        </div>
      </div>
    </>}
  </section>;
}

function TimelineScale({ range }: { range: DateRange }) {
  const total = rangeDays(range);
  const ticks = timelineScaleTicks(range);
  return <div className="timeline-scale">{ticks.map((date, index) => {
    const elapsed = dayDiff(range.start, date); const remaining = total - elapsed;
    const year = date.slice(0, 4); const previousYear = ticks[index - 1]?.slice(0, 4);
    const label = `${SCALE_FORMATTER.format(new Date(`${date}T00:00:00Z`))}${index === 0 || year !== previousYear ? `, ${year}` : ''}`;
    const compactEnd = remaining < 5;
    return <span className={`timeline-week ${compactEnd ? 'timeline-week--end' : ''}`} key={date} title={date} aria-label={date} style={compactEnd ? { left: `${(elapsed / total) * 100}%`, width: '88px' } : { left: `${(elapsed / total) * 100}%`, width: `${(Math.min(7, remaining) / total) * 100}%` }}>{label}</span>;
  })}</div>;
}

// Takes a ready array rather than the project data, so it is structurally
// incapable of re-deriving markers once per task row.
function Markers({ markers, range }: { markers: TimelineMarker[]; range: DateRange }) {
  return <>{markers.map((marker, index) => <span className={`timeline-marker timeline-marker--${marker.kind}`} style={{ left: `${datePercent(marker.date, range)}%` }} aria-hidden="true" key={`${marker.label}-${index}`} />)}</>;
}

// The grip lives inside the label cell, not beside it: `.timeline-grid` has
// exactly two columns and `.timeline-row-group` is `display:contents`, so a third
// per-row child would break the grid, and a button cannot nest inside a button.
interface LabelProps {
  task: KanbanTask; onOpen: Props['onOpen']; orderable: boolean; reason: string | null; locked: boolean; dragging: boolean;
  register: (taskId: string, element: HTMLElement | null) => void;
  onBegin: (event: PointerEvent<HTMLElement>, task: KanbanTask) => void;
  onMove: (event: PointerEvent<HTMLElement>) => void; onFinish: () => void;
  onNudge: (event: KeyboardEvent<HTMLElement>, task: KanbanTask) => void;
}

function TimelineLabel({ task, onOpen, orderable, reason, locked, dragging, register, onBegin, onMove, onFinish, onNudge }: LabelProps) {
  const disabled = !orderable || locked;
  return <div className={`timeline-label timeline-label--row ${dragging ? 'timeline-label--dragging' : ''}`} ref={(element) => register(task.id, element)}>
    <button type="button" className="timeline-order-grip" disabled={disabled}
      aria-label={`Reorder ${task.title}`}
      title={!orderable && reason ? reason : locked ? 'Save or cancel the pending schedule change first.' : `Reorder ${task.title}: drag, or use the up and down arrow keys`}
      onPointerDown={(event) => onBegin(event, task)} onPointerMove={onMove} onPointerUp={onFinish} onPointerCancel={onFinish}
      onKeyDown={(event) => onNudge(event, task)}><span aria-hidden="true">⠿</span></button>
    <TaskLabelButton task={task} onOpen={onOpen} />
  </div>;
}

function TaskLabelButton({ task, onOpen }: { task: KanbanTask; onOpen: Props['onOpen'] }) {
  return <button className="timeline-task-label" onClick={(event) => onOpen(task, event.currentTarget)}>
    <span className="timeline-title-line"><strong>{task.title}</strong><span className="task-id">{task.id}</span></span>
    <span className="timeline-label-meta"><span className={`state state--${task.display_status}`}>{task.display_status.replaceAll('_', ' ')}</span><span className={`priority priority--${task.priority.toLowerCase()}`}>{task.priority}</span><span>{task.owner ?? 'Unassigned'}</span><span>{task.milestone ?? 'No milestone'}</span></span>
    {task.depends_on.length > 0 && <span className="timeline-context">After {task.depends_on.join(', ')}</span>}
    {task.dependency_blockers.length > 0 && <span className="timeline-blocker">Blocked by tasks: {task.dependency_blockers.join(', ')}</span>}
    {task.blocked_by.map((reason) => <span className="timeline-blocker" key={reason}>Blocker note: {reason}</span>)}
    {task.schedule_conflicts.map((conflict) => <span className="schedule-conflict" key={conflict.dependency_id}>Planned schedule overlap: {conflict.dependency_id} ends {conflict.dependency_end}; this task starts {conflict.task_start}</span>)}
  </button>;
}

function timelineIssueTone(task: KanbanTask): 'warning' | 'error' | null {
  return task.execution_issue ? 'error' : task.schedule_conflicts.length > 0 || task.blocked_by.length > 0 ? 'warning' : null;
}

function ScheduleBar({ task, range, start, end, draft, onOpen, onBegin, onMove, onFinish, onNudge, suppressClick }: { task: KanbanTask; range: DateRange; start: string; end: string; draft: boolean; onOpen: Props['onOpen']; onBegin: (event: PointerEvent<HTMLElement>, task: KanbanTask, mode: Drag['mode']) => void; onMove: (event: PointerEvent<HTMLElement>) => void; onFinish: () => void; onNudge: (event: KeyboardEvent<HTMLElement>, task: KanbanTask, mode: Drag['mode']) => void; suppressClick: DragSuppression }) {
  const geometry = barGeometry(start, end, range);
  const tone = task.display_status === 'cancelled' ? 'cancelled' : task.display_status === 'done' ? 'done' : task.display_status === 'active' ? 'active' : task.display_status === 'deferred' ? 'deferred' : 'planned';
  const issueTone = timelineIssueTone(task);
  const interaction = (mode: Drag['mode']) => ({ onPointerDown: (event: PointerEvent<HTMLElement>) => onBegin(event, task, mode), onPointerMove: onMove, onPointerUp: onFinish, onPointerCancel: onFinish });
  return <div className={`timeline-bar timeline-bar--${tone} ${draft ? 'timeline-bar--draft' : ''} ${task.schedule_editable ? '' : 'timeline-bar--locked'}`} style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }}>
    {task.schedule_editable && <button className="bar-handle bar-handle--start" aria-label={`Resize ${task.title} start`} {...interaction('start')} onKeyDown={(event) => onNudge(event, task, 'start')} />}
    <button className="bar-body" title={`${task.title}: ${start} to ${end}`} aria-label={`${task.title}, scheduled ${start} to ${end}${issueTone ? `, ${issueTone}` : ''}${task.schedule_editable ? ', drag or use arrow keys to move' : ''}`} {...interaction('move')} onKeyDown={(event) => onNudge(event, task, 'move')} onClick={(event) => { if (suppressClick.consume()) return; onOpen(task, event.currentTarget); }}><span className="bar-title">{task.title}{issueTone && <i className={`timeline-issue-dot timeline-issue-dot--${issueTone}`} role="img" title={issueTone === 'error' ? 'Execution error' : 'Planning warning'} aria-label={issueTone === 'error' ? 'Execution error' : 'Planning warning'} />}</span><small>{start} → {end}</small></button>
    {task.schedule_editable && <button className="bar-handle bar-handle--end" aria-label={`Resize ${task.title} end`} {...interaction('end')} onKeyDown={(event) => onNudge(event, task, 'end')} />}
  </div>;
}
