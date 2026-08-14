// Accessible key-bound task inspection and edit dialog. Specification/status
// authority stays limited; eligible work can be rescheduled and task-local
// execution or planning issues are explained without repetitive banners.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ApiError, KanbanData, KanbanTask, TaskEdit, TaskEditRequest } from '../../shared/api';
import type { SelectionRequest } from '../selection-guard.mjs';

function lines(value: string): string[] { return value.split('\n').map((item) => item.trim()).filter(Boolean); }
function valueOrDash(value: string | null): string { return value ?? 'Not set'; }
function localExecutionIssue(task: KanbanTask): string {
  if (!task.execution_issue_reason) return 'None';
  const prefix = `${task.title} (${task.id}) `;
  return task.execution_issue_reason.startsWith(prefix)
    ? `This task ${task.execution_issue_reason.slice(prefix.length)}`
    : task.execution_issue_reason;
}
function timelineIndicator(task: KanbanTask): { tone: 'warning' | 'error'; title: string; message: string } | null {
  if (task.execution_issue) {
    return { tone: 'error', title: 'Execution error · red timeline dot', message: localExecutionIssue(task) };
  }
  const blockerMessage = task.blocked_by.length > 0 ? `Recorded blocker note (not a project task): ${task.blocked_by.join('; ')}.` : null;
  const conflictMessages = task.schedule_conflicts.map((conflict) => `Schedule conflict: ${conflict.dependency_id} ends ${conflict.dependency_end}, but this task starts ${conflict.task_start}.`);
  if (!blockerMessage && conflictMessages.length === 0) return null;
  const title = blockerMessage && conflictMessages.length > 0
    ? 'Planning issues · amber timeline dot'
    : blockerMessage ? 'Blocker note · amber timeline dot' : 'Schedule warning · amber timeline dot';
  return { tone: 'warning', title, message: [blockerMessage, ...conflictMessages].filter(Boolean).join(' ') };
}
// Matches the bare-path convention used throughout SKILL.md/README.md routes;
// only quotes when the path actually needs it (contains whitespace).
function quoteArg(value: string): string { return /\s/.test(value) ? `"${value.replace(/[\\"]/g, '\\$&')}"` : value; }

interface Props { data: KanbanData; task: KanbanTask; opener: HTMLElement | null; onClose: () => void; beginMutation: () => SelectionRequest | null; finishMutation: (request: SelectionRequest) => void; onSaved: (data: KanbanData, request: SelectionRequest) => void }

function initialEdit(task: KanbanTask): TaskEdit {
  const schedule = task.schedule_editable ? { scheduled_start: task.scheduled_start, scheduled_end: task.scheduled_end } : {};
  const coordination = task.disposition_editable ? { disposition: task.disposition } : {};
  if (!task.editable) return { ...coordination, ...schedule };
  return {
    title: task.title, outcome: task.outcome, acceptance: task.acceptance, status: task.status as 'planned' | 'ready',
    priority: task.priority, milestone: task.milestone, owner: task.owner, depends_on: task.depends_on,
    blocked_by: task.blocked_by, success_criteria: task.success_criteria, constraints: task.constraints, critical: task.critical,
    ...coordination, ...schedule,
  };
}

export function TaskDialog({ data, task, opener, onClose, beginMutation, finishMutation, onSaved }: Props) {
  const [edit, setEdit] = useState<TaskEdit>(() => initialEdit(task));
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const [copied, setCopied] = useState<'rpd' | 'review' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<ApiError[]>([]);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reviewCommand = `project validate-task ${quoteArg(data.project.root)} ${task.id}`;
  const indicator = timelineIndicator(task);
  const request = useMemo<TaskEditRequest>(() => ({ projectKey: data.project.key, mutationRevision: data.mutation_revision, taskRevision: task.task_revision, edit }), [data.project.key, data.mutation_revision, task.task_revision, edit]);

  useEffect(() => {
    const backdrop = backdropRef.current;
    const siblings = backdrop?.parentElement ? [...backdrop.parentElement.children].filter((element) => element !== backdrop) as HTMLElement[] : [];
    for (const element of siblings) element.inert = true;
    closeRef.current?.focus();
    return () => { for (const element of siblings) element.inert = false; opener?.focus(); };
  }, [opener]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [])];
    if (focusable.length === 0) { event.preventDefault(); dialogRef.current?.focus(); return; }
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function invoke(kind: 'check' | 'save') {
    setBusy(kind); setErrors([]); setNotice(null);
    const operation = kind === 'save' ? beginMutation() : null;
    if (kind === 'save' && !operation) {
      setErrors([{ code: 'OPERATION_PENDING', message: 'Another project operation is already in progress.' }]);
      setBusy(null);
      return;
    }
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}${kind === 'check' ? '/check' : ''}`, {
        method: kind === 'check' ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
      });
      const body = await response.json();
      if (!response.ok) { setErrors(body.errors ?? [{ code: 'UNKNOWN', message: 'The request failed.' }]); return; }
      if (kind === 'save') { onSaved(body.data, operation!); setNotice('Saved and revalidated.'); }
      else setNotice('Changes are structurally valid. Save will check again.');
    } catch (error) { setErrors([{ code: 'NETWORK', message: error instanceof Error ? error.message : 'Network error' }]); }
    finally { if (operation) finishMutation(operation); setBusy(null); }
  }

  async function copyReview() {
    try { await navigator.clipboard.writeText(reviewCommand); setCopied('review'); setNotice(null); }
    catch { setErrors([{ code: 'CLIPBOARD', message: 'Could not copy. Select the LLM review command in Execution context.' }]); }
  }

  async function copyRpdCommand() {
    try { await navigator.clipboard.writeText(task.rpd_command); setCopied('rpd'); setNotice(null); }
    catch { setErrors([{ code: 'CLIPBOARD', message: 'Could not copy. Select the RPD command in Execution context.' }]); }
  }

  function toggleList(field: 'depends_on' | 'success_criteria', value: string) {
    const current = (edit[field] ?? []) as string[];
    setEdit({ ...edit, [field]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort() });
  }

  return <div ref={backdropRef} className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title" onKeyDown={handleDialogKeyDown}>
      <header className="dialog-header">
        <div><span className="eyebrow">{task.id}</span><h2 id="task-dialog-title">{task.title}</h2></div>
        <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Close task details">×</button>
      </header>
      <div className="dialog-scroll">
        <div className="task-meta-strip">
          <span className={`state state--${task.display_status}`}>{task.display_status.replaceAll('_', ' ')}</span>
          <span className={`priority priority--${task.priority.toLowerCase()}`}>{task.priority}</span>
          <span>{valueOrDash(task.owner)}</span>
          {task.next_rank && <span className="next-chip">Next #{task.next_rank}</span>}
        </div>
        {indicator && <div className={`timeline-indicator timeline-indicator--${indicator.tone}`} role="status"><strong>{indicator.title}</strong><p>{indicator.message}</p></div>}
        <div className="dialog-grid">
          <div className="editor-column">
            {task.editable ? <>
              <label className="field"><span>Title</span><input value={edit.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
              <label className="field"><span>Outcome</span><textarea rows={3} value={edit.outcome ?? ''} onChange={(e) => setEdit({ ...edit, outcome: e.target.value })} /></label>
              <label className="field"><span>Acceptance criteria <small>One per line</small></span><textarea rows={4} value={(edit.acceptance ?? []).join('\n')} onChange={(e) => setEdit({ ...edit, acceptance: lines(e.target.value) })} /></label>
              <div className="field-row">
                <label className="field"><span>Status</span><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as 'planned' | 'ready' })}><option value="planned">Planned</option><option value="ready">Ready</option></select></label>
                <label className="field"><span>Priority</span><select value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value as KanbanTask['priority'] })}>{data.options.priorities.map((value) => <option key={value}>{value}</option>)}</select></label>
              </div>
              <div className="field-row">
                <label className="field"><span>Owner</span><input value={edit.owner ?? ''} placeholder="Unassigned" onChange={(e) => setEdit({ ...edit, owner: e.target.value || null })} onBlur={(e) => setEdit({ ...edit, owner: e.target.value.trim() || null })} /></label>
                <label className="field"><span>Milestone</span><select value={edit.milestone ?? ''} onChange={(e) => setEdit({ ...edit, milestone: e.target.value || null })}><option value="">None</option>{data.options.milestones.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
              </div>
              <label className="checkbox-field"><input type="checkbox" checked={edit.critical ?? false} onChange={(e) => setEdit({ ...edit, critical: e.target.checked })} /><span>Critical work</span></label>
              <fieldset className="check-group"><legend>Dependencies</legend>{data.options.tasks.filter((item) => item.id !== task.id).map((item) => <label key={item.id}><input type="checkbox" checked={(edit.depends_on ?? []).includes(item.id)} onChange={() => toggleList('depends_on', item.id)} /> {item.id} · {item.title}</label>)}</fieldset>
              <fieldset className="check-group"><legend>Success criteria</legend>{data.options.success_criteria.map((item) => <label key={item.id}><input type="checkbox" checked={(edit.success_criteria ?? []).includes(item.id)} onChange={() => toggleList('success_criteria', item.id)} /> {item.text}</label>)}</fieldset>
              <label className="field"><span>Blocker notes <small>Not task dependencies · one per line</small></span><textarea rows={3} value={(edit.blocked_by ?? []).join('\n')} onChange={(e) => setEdit({ ...edit, blocked_by: lines(e.target.value).sort() })} /></label>
              <label className="field"><span>Constraints <small>One per line</small></span><textarea rows={3} value={(edit.constraints ?? []).join('\n')} onChange={(e) => setEdit({ ...edit, constraints: lines(e.target.value) })} /></label>
            </> : <ReadOnlyTask task={task} />}
            {task.disposition_editable ? <section className="schedule-editor" aria-labelledby="disposition-editor-title"><div className="section-heading"><div><span className="eyebrow">Coordination state</span><h3 id="disposition-editor-title">Disposition</h3></div></div><label className="field"><span>Disposition</span><select value={edit.disposition} onChange={(e) => setEdit({ ...edit, disposition: e.target.value as KanbanTask['disposition'] })}><option value="active">Active</option><option value="deferred">Deferred</option><option value="cancelled">Cancelled</option></select></label><p>Deferral pauses actionability. Cancellation is terminal and does not satisfy dependencies or success criteria.</p></section> : null}
            {task.schedule_editable ? <section className="schedule-editor" aria-labelledby="schedule-editor-title"><div className="section-heading"><div><span className="eyebrow">Planning metadata</span><h3 id="schedule-editor-title">Schedule</h3></div><button className="clear-button" type="button" onClick={() => setEdit({ ...edit, scheduled_start: null, scheduled_end: null })}>Clear dates</button></div><div className="field-row"><label className="field"><span>Scheduled start</span><input type="date" value={edit.scheduled_start ?? ''} onChange={(e) => setEdit({ ...edit, scheduled_start: e.target.value || null })} /></label><label className="field"><span>Scheduled end</span><input type="date" value={edit.scheduled_end ?? ''} onChange={(e) => setEdit({ ...edit, scheduled_end: e.target.value || null })} /></label></div><p>Scheduled dates are editable planning metadata. Actual execution dates come from evidence.</p></section> : <div className="read-only-content"><h3>Schedule</h3><p>{task.scheduled_start && task.scheduled_end ? `${task.scheduled_start} → ${task.scheduled_end}` : 'Unscheduled'}</p></div>}
          </div>
          <aside className="evidence-column">
            <h3>Execution context</h3>
            <Definition label="Executor" value={task.executor.provider} />
            <Definition label="Detailed lifecycle" value={task.status.replaceAll('_', ' ')} />
            <Definition label="Disposition" value={task.disposition} />
            <Definition label="Disposition changed" value={valueOrDash(task.disposition_changed_at)} />
            <Definition label="Milestone" value={valueOrDash(task.milestone)} />
            <Definition label="Dependencies" value={task.depends_on.join(', ') || 'None'} />
            <Definition label="Dependency blockers" value={task.dependency_blockers.join(', ') || 'None'} />
            <Definition label="Blocker notes (not tasks)" value={task.blocked_by.join(', ') || 'None'} />
            <Definition label="Active contract" value={valueOrDash(task.active_contract)} mono />
            <Definition label="Latest manifest" value={valueOrDash(task.last_manifest)} mono />
            <Definition label="Scheduled start" value={valueOrDash(task.scheduled_start)} />
            <Definition label="Scheduled end" value={valueOrDash(task.scheduled_end)} />
            <Definition label="Updated" value={valueOrDash(task.updated)} />
            <Definition label="RPD command" value={task.rpd_command} mono />
            <Definition label="LLM review command" value={reviewCommand} mono />
          </aside>
        </div>
        {errors.length > 0 && <div className="error-panel" role="alert"><strong>Changes need attention</strong><ul>{errors.map((error, index) => <li key={`${error.code}-${index}`}>{error.message}</li>)}</ul></div>}
        {notice && <p className="success-notice" role="status">{notice}</p>}
      </div>
      <footer className="dialog-actions">
        <div className="copy-actions">
          <button className="secondary-button" onClick={copyRpdCommand}>{copied === 'rpd' ? 'Copied' : 'Copy RPD command'}</button>
          <button className="secondary-button" onClick={copyReview}>{copied === 'review' ? 'Copied' : 'Copy LLM review command'}</button>
        </div>
        <div className="task-actions">
          <button className="secondary-button" onClick={onClose}>Close</button>
          {(task.editable || task.schedule_editable || task.disposition_editable) && <><button className="secondary-button" disabled={busy !== null} onClick={() => invoke('check')}>{busy === 'check' ? 'Checking…' : 'Check changes'}</button><button className="primary-button" disabled={busy !== null} onClick={() => invoke('save')}>{busy === 'save' ? 'Saving…' : 'Save task'}</button></>}
        </div>
      </footer>
    </section>
  </div>;
}

function Definition({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="definition"><dt>{label}</dt><dd className={mono ? 'mono' : ''}>{value}</dd></div>; }
function ReadOnlyTask({ task }: { task: KanbanTask }) { return <div className="read-only-content"><h3>Outcome</h3><p>{task.outcome}</p><h3>Acceptance criteria</h3><ul>{task.acceptance.map((item) => <li key={item}>{item}</li>)}</ul>{task.constraints.length > 0 && <><h3>Constraints</h3><ul>{task.constraints.map((item) => <li key={item}>{item}</li>)}</ul></>}</div>; }
