// Project Manager Studio Timeline: range-sized weekly planning grid with a
// synchronized sticky header, page scrolling, and revision-safe schedule edits.
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type UIEvent } from 'react';
import type { ApiError, KanbanData, KanbanTask, TaskEditRequest } from '../../shared/api';
import { barGeometry, datePercent, dayDiff, moveSchedule, pixelsToDays, rangeDays, resizeSchedule, timelineContentWidth, timelineRange, timelineScaleTicks, type DateRange } from '../timeline-model.mjs';
import type { SelectionRequest } from '../selection-guard.mjs';

interface Props {
  data: KanbanData;
  tasks: KanbanTask[];
  onOpen: (task: KanbanTask, opener: HTMLElement) => void;
  beginMutation: () => SelectionRequest | null;
  finishMutation: (request: SelectionRequest) => void;
  onSaved: (data: KanbanData, request: SelectionRequest) => void;
}
interface Draft { taskId: string; start: string; end: string }
interface Drag { task: KanbanTask; mode: 'move' | 'start' | 'end'; originX: number; width: number; start: string; end: string; moved: boolean }

export function Timeline({ data, tasks, onOpen, beginMutation, finishMutation, onSaved }: Props) {
  const range = useMemo(() => timelineRange(data.tasks, data.project, data.milestones), [data]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stickyTop, setStickyTop] = useState(0);
  const drag = useRef<Drag | null>(null);
  const headerScroll = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);

  const ordered = useMemo(() => [...tasks].sort((a, b) => (a.milestone ?? 'ZZZ').localeCompare(b.milestone ?? 'ZZZ') || (a.scheduled_start ?? '9999').localeCompare(b.scheduled_start ?? '9999') || a.id.localeCompare(b.id)), [tasks]);

  useLayoutEffect(() => {
    const topbar = document.querySelector<HTMLElement>('.topbar');
    if (!topbar) return;
    const update = () => setStickyTop(getComputedStyle(topbar).position === 'sticky' ? topbar.getBoundingClientRect().height : 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(topbar);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  function syncHeader(event: UIEvent<HTMLDivElement>) {
    if (headerScroll.current) headerScroll.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  function begin(event: PointerEvent<HTMLElement>, task: KanbanTask, mode: Drag['mode']) {
    if (!range || !task.schedule_editable || !task.scheduled_start || !task.scheduled_end) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const track = event.currentTarget.closest('.timeline-track') as HTMLElement | null;
    drag.current = { task, mode, originX: event.clientX, width: track?.getBoundingClientRect().width ?? 0, start: task.scheduled_start, end: task.scheduled_end, moved: false };
    setDraft({ taskId: task.id, start: task.scheduled_start, end: task.scheduled_end });
    setError(null);
  }

  function move(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || !range) return;
    const days = pixelsToDays(event.clientX - current.originX, current.width, rangeDays(range));
    current.moved ||= days !== 0;
    const next = current.mode === 'move' ? moveSchedule(current.start, current.end, days) : resizeSchedule(current.start, current.end, current.mode, days);
    setDraft({ taskId: current.task.id, ...next });
  }

  function finish() {
    if (!drag.current) return;
    suppressClick.current = drag.current.moved;
    drag.current = null;
  }

  function nudge(event: KeyboardEvent<HTMLElement>, task: KanbanTask, mode: Drag['mode']) {
    if (!task.schedule_editable || !task.scheduled_start || !task.scheduled_end || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); setError(null);
    const current = draft?.taskId === task.id ? { start: draft.start, end: draft.end } : { start: task.scheduled_start, end: task.scheduled_end };
    const days = event.key === 'ArrowLeft' ? -1 : 1;
    const next = mode === 'move' ? moveSchedule(current.start, current.end, days) : resizeSchedule(current.start, current.end, mode, days);
    setDraft({ taskId: task.id, ...next });
  }

  async function saveDraft() {
    if (!draft) return;
    const task = data.tasks.find((item) => item.id === draft.taskId);
    if (!task) return;
    const operation = beginMutation();
    if (!operation) { setError('Another project operation is already in progress.'); return; }
    setBusy(true); setError(null);
    const request: TaskEditRequest = { projectKey: data.project.key, mutationRevision: data.mutation_revision, taskRevision: task.task_revision, edit: { scheduled_start: draft.start, scheduled_end: draft.end } };
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      const body = await response.json();
      if (!response.ok) throw new Error((body.errors as ApiError[] | undefined)?.[0]?.message ?? 'Could not save schedule.');
      setDraft(null); onSaved(body.data, operation);
    } catch (value) { setError(value instanceof Error ? value.message : 'Could not save schedule.'); }
    finally { finishMutation(operation); setBusy(false); }
  }

  return <section className="timeline-panel" aria-label="Task timeline">
    {draft && <div className="timeline-draft-actions" role="status"><span>{draft.start} → {draft.end}</span><button className="secondary-button" disabled={busy} onClick={() => { setDraft(null); setError(null); }}>Cancel</button><button className="primary-button" disabled={busy} onClick={() => void saveDraft()}>{busy ? 'Saving…' : 'Save schedule'}</button></div>}
    {error && <div className="error-banner" role="alert">Schedule save failed: {error}</div>}
    {!range ? <div className="timeline-no-range"><strong>No dated work yet</strong><p>Open a task to add its scheduled start and end. No dates are inferred.</p>{ordered.map((task) => <TimelineLabel key={task.id} task={task} onOpen={onOpen} />)}</div> : <>
      <div className="timeline-sticky-header" style={{ '--timeline-content-width': `${timelineContentWidth(range)}px`, top: stickyTop } as React.CSSProperties}>
        <div className="timeline-label timeline-label--header"><strong>Task</strong><span>{ordered.length} shown</span></div>
        <div className="timeline-header-viewport" ref={headerScroll}><TimelineScale range={range} /></div>
      </div>
      <div className="timeline-scroll" role="region" aria-label="Scrollable task timeline" tabIndex={0} onScroll={syncHeader}>
        <div className="timeline-grid" style={{ '--timeline-days': rangeDays(range), '--timeline-content-width': `${timelineContentWidth(range)}px` } as React.CSSProperties}>
          {ordered.map((task) => {
            const shown = draft?.taskId === task.id ? { start: draft.start, end: draft.end } : task.scheduled_start && task.scheduled_end ? { start: task.scheduled_start, end: task.scheduled_end } : null;
            return <div className="timeline-row-group" key={task.id}>
              <TimelineLabel task={task} onOpen={onOpen} />
              <div className="timeline-track">
                <Markers data={data} range={range} />
                {shown ? <ScheduleBar task={task} range={range} start={shown.start} end={shown.end} draft={draft?.taskId === task.id} onOpen={onOpen} onBegin={begin} onMove={move} onFinish={finish} onNudge={nudge} suppressClick={suppressClick} /> : <button className="unscheduled-button" onClick={(event) => onOpen(task, event.currentTarget)}>Unscheduled · add dates</button>}
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
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return <div className="timeline-scale">{ticks.map((date, index) => {
    const elapsed = dayDiff(range.start, date); const remaining = total - elapsed;
    const year = date.slice(0, 4); const previousYear = ticks[index - 1]?.slice(0, 4);
    const label = `${formatter.format(new Date(`${date}T00:00:00Z`))}${index === 0 || year !== previousYear ? `, ${year}` : ''}`;
    const compactEnd = remaining < 5;
    return <span className={`timeline-week ${compactEnd ? 'timeline-week--end' : ''}`} key={date} title={date} aria-label={date} style={compactEnd ? { left: `${(elapsed / total) * 100}%`, width: '88px' } : { left: `${(elapsed / total) * 100}%`, width: `${(Math.min(7, remaining) / total) * 100}%` }}>{label}</span>;
  })}</div>;
}

function Markers({ data, range }: { data: KanbanData; range: DateRange }) {
  const markers = [
    data.project.start_date && { date: data.project.start_date, label: 'Project start', kind: 'project' },
    data.project.target_date && { date: data.project.target_date, label: 'Project target', kind: 'project' },
    ...data.milestones.flatMap((milestone) => [
      milestone.target_date && { date: milestone.target_date, label: `${milestone.title} target`, kind: 'target' },
      milestone.forecast_date && { date: milestone.forecast_date, label: `${milestone.title} forecast`, kind: 'forecast' },
    ]),
  ].filter(Boolean) as Array<{ date: string; label: string; kind: string }>;
  return <>{markers.map((marker, index) => <span className={`timeline-marker timeline-marker--${marker.kind}`} style={{ left: `${datePercent(marker.date, range)}%` }} aria-hidden="true" key={`${marker.label}-${index}`} />)}</>;
}

function TimelineLabel({ task, onOpen }: { task: KanbanTask; onOpen: Props['onOpen'] }) {
  return <button className="timeline-label timeline-task-label" onClick={(event) => onOpen(task, event.currentTarget)}>
    <span className="timeline-title-line"><strong>{task.title}</strong><span className="task-id">{task.id}</span></span>
    <span className="timeline-label-meta"><span className={`state state--${task.display_status}`}>{task.display_status.replaceAll('_', ' ')}</span><span className={`priority priority--${task.priority.toLowerCase()}`}>{task.priority}</span><span>{task.owner ?? 'Unassigned'}</span><span>{task.milestone ?? 'No milestone'}</span></span>
    {task.depends_on.length > 0 && <span className="timeline-context">After {task.depends_on.join(', ')}</span>}
    {task.dependency_blockers.length > 0 && <span className="timeline-blocker">Blocked by tasks: {task.dependency_blockers.join(', ')}</span>}
    {task.blocked_by.map((reason) => <span className="timeline-blocker" key={reason}>Blocked: {reason}</span>)}
    {task.schedule_conflicts.map((conflict) => <span className="schedule-conflict" key={conflict.dependency_id}>Date conflict: {conflict.dependency_id} ends {conflict.dependency_end}; starts {conflict.task_start}</span>)}
  </button>;
}

function ScheduleBar({ task, range, start, end, draft, onOpen, onBegin, onMove, onFinish, onNudge, suppressClick }: { task: KanbanTask; range: DateRange; start: string; end: string; draft: boolean; onOpen: Props['onOpen']; onBegin: (event: PointerEvent<HTMLElement>, task: KanbanTask, mode: Drag['mode']) => void; onMove: (event: PointerEvent<HTMLElement>) => void; onFinish: () => void; onNudge: (event: KeyboardEvent<HTMLElement>, task: KanbanTask, mode: Drag['mode']) => void; suppressClick: React.MutableRefObject<boolean> }) {
  const geometry = barGeometry(start, end, range);
  const tone = task.schedule_conflicts.length > 0 || task.blocked_by.length > 0 || task.dependency_blockers.length > 0 ? 'warning' : task.display_status === 'done' ? 'done' : task.display_status === 'active' ? 'active' : task.display_status === 'deferred' || task.display_status === 'cancelled' ? 'review' : 'planned';
  const interaction = (mode: Drag['mode']) => ({ onPointerDown: (event: PointerEvent<HTMLElement>) => onBegin(event, task, mode), onPointerMove: onMove, onPointerUp: onFinish, onPointerCancel: onFinish });
  return <div className={`timeline-bar timeline-bar--${tone} ${draft ? 'timeline-bar--draft' : ''} ${task.schedule_editable ? '' : 'timeline-bar--locked'}`} style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }}>
    {task.schedule_editable && <button className="bar-handle bar-handle--start" aria-label={`Resize ${task.title} start`} {...interaction('start')} onKeyDown={(event) => onNudge(event, task, 'start')} />}
    <button className="bar-body" title={`${task.title}: ${start} to ${end}`} aria-label={`${task.title}, scheduled ${start} to ${end}${task.schedule_editable ? ', drag or use arrow keys to move' : ''}`} {...interaction('move')} onKeyDown={(event) => onNudge(event, task, 'move')} onClick={(event) => { if (suppressClick.current) { suppressClick.current = false; return; } onOpen(task, event.currentTarget); }}><span>{task.title}</span><small>{start} → {end}</small></button>
    {task.schedule_editable && <button className="bar-handle bar-handle--end" aria-label={`Resize ${task.title} end`} {...interaction('end')} onKeyDown={(event) => onNudge(event, task, 'end')} />}
  </div>;
}
