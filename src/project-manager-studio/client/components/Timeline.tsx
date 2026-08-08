// Project Manager Studio Timeline: key-bound UTC schedule saves, milestone
// markers, dependency warnings, and revision-safe draft move/resize interactions.
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ApiError, KanbanData, KanbanTask, TaskEditRequest } from '../../shared/api';
import { addDays, barGeometry, datePercent, dayDiff, moveSchedule, pixelsToDays, rangeDays, resizeSchedule, timelineRange, type DateRange } from '../timeline-model.mjs';
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
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  const ordered = useMemo(() => [...tasks].sort((a, b) => (a.milestone ?? 'ZZZ').localeCompare(b.milestone ?? 'ZZZ') || (a.scheduled_start ?? '9999').localeCompare(b.scheduled_start ?? '9999') || a.id.localeCompare(b.id)), [tasks]);

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
    <header className="timeline-heading">
      <div><span className="eyebrow">Planning metadata</span><h2>Timeline</h2><p>Dates are scheduled, not actual. Dependency conflicts warn without blocking lifecycle.</p><div className="milestone-legend" aria-label="Project and milestone schedule"><span tabIndex={0}><strong>Project</strong> · start {data.project.start_date ?? 'unknown'} · target {data.project.target_date ?? 'unknown'}</span>{data.milestones.length === 0 ? <span tabIndex={0}>Milestones unconfigured</span> : data.milestones.map((milestone) => <span tabIndex={0} key={milestone.id}><strong>{milestone.title}</strong> · target {milestone.target_date ?? 'unknown'} · forecast {milestone.forecast_date ?? 'unknown'}</span>)}</div></div>
      {draft && <div className="timeline-draft-actions" role="status"><span>{draft.start} → {draft.end}</span><button className="secondary-button" disabled={busy} onClick={() => { setDraft(null); setError(null); }}>Cancel</button><button className="primary-button" disabled={busy} onClick={() => void saveDraft()}>{busy ? 'Saving…' : 'Save schedule'}</button></div>}
    </header>
    {error && <div className="error-banner" role="alert">Schedule save failed: {error}</div>}
    {!range ? <div className="timeline-no-range"><strong>No dated work yet</strong><p>Open a task to add its scheduled start and end. No dates are inferred.</p>{ordered.map((task) => <TimelineLabel key={task.id} task={task} onOpen={onOpen} />)}</div> : <div className="timeline-scroll">
      <div className="timeline-grid" style={{ '--timeline-days': rangeDays(range) } as React.CSSProperties}>
        <div className="timeline-label timeline-label--header"><strong>Task</strong><span>{ordered.length} shown</span></div>
        <TimelineScale range={range} />
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
    </div>}
  </section>;
}

function TimelineScale({ range }: { range: DateRange }) {
  const total = rangeDays(range); const step = Math.max(1, Math.ceil(total / 12));
  const ticks = Array.from({ length: Math.floor((total - 1) / step) + 1 }, (_, index) => addDays(range.start, index * step));
  return <div className="timeline-scale">{ticks.map((date) => <span key={date} style={{ left: `${datePercent(date, range)}%` }}>{date.slice(5)}</span>)}</div>;
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
    <span className="task-id">{task.id}</span><strong>{task.title}</strong>
    <span className="timeline-label-meta"><span className={`state state--${task.status}`}>{task.status.replaceAll('_', ' ')}</span><span className={`priority priority--${task.priority.toLowerCase()}`}>{task.priority}</span><span>{task.owner ?? 'Unassigned'}</span></span>
    <span className="timeline-context">{task.milestone ?? 'No milestone'} · {task.depends_on.length ? `After ${task.depends_on.join(', ')}` : 'No dependencies'}</span>
    {task.dependency_blockers.length > 0 && <span className="timeline-blocker">Blocked by tasks: {task.dependency_blockers.join(', ')}</span>}
    {task.blocked_by.map((reason) => <span className="timeline-blocker" key={reason}>Blocked: {reason}</span>)}
    {task.schedule_conflicts.map((conflict) => <span className="schedule-conflict" key={conflict.dependency_id}>Date conflict: {conflict.dependency_id} ends {conflict.dependency_end}; starts {conflict.task_start}</span>)}
  </button>;
}

function ScheduleBar({ task, range, start, end, draft, onOpen, onBegin, onMove, onFinish, onNudge, suppressClick }: { task: KanbanTask; range: DateRange; start: string; end: string; draft: boolean; onOpen: Props['onOpen']; onBegin: (event: PointerEvent<HTMLElement>, task: KanbanTask, mode: Drag['mode']) => void; onMove: (event: PointerEvent<HTMLElement>) => void; onFinish: () => void; onNudge: (event: KeyboardEvent<HTMLElement>, task: KanbanTask, mode: Drag['mode']) => void; suppressClick: React.MutableRefObject<boolean> }) {
  const geometry = barGeometry(start, end, range);
  const interaction = (mode: Drag['mode']) => ({ onPointerDown: (event: PointerEvent<HTMLElement>) => onBegin(event, task, mode), onPointerMove: onMove, onPointerUp: onFinish, onPointerCancel: onFinish });
  return <div className={`timeline-bar ${draft ? 'timeline-bar--draft' : ''} ${task.schedule_editable ? '' : 'timeline-bar--locked'}`} style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }}>
    {task.schedule_editable && <button className="bar-handle bar-handle--start" aria-label={`Resize ${task.title} start`} {...interaction('start')} onKeyDown={(event) => onNudge(event, task, 'start')} />}
    <button className="bar-body" title={`${task.title}: ${start} to ${end}`} aria-label={`${task.title}, scheduled ${start} to ${end}${task.schedule_editable ? ', drag or use arrow keys to move' : ''}`} {...interaction('move')} onKeyDown={(event) => onNudge(event, task, 'move')} onClick={(event) => { if (suppressClick.current) { suppressClick.current = false; return; } onOpen(task, event.currentTarget); }}><span>{task.title}</span><small>{start} → {end}</small></button>
    {task.schedule_editable && <button className="bar-handle bar-handle--end" aria-label={`Resize ${task.title} end`} {...interaction('end')} onKeyDown={(event) => onNudge(event, task, 'end')} />}
  </div>;
}
