// Fullscreen Project Manager board. Pulls the full payload through the app-only
// tool so the model never carries it, renders lanes and tasks, and discloses
// task detail inline. Read-only: nothing here writes, and there is no dialog,
// popover, or floating panel that a host container would clip.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useProject, useProjectHost } from '../host.js';
import type { KanbanData, KanbanTask } from '../../shared/api.js';
import '../theme.css';
import './board.css';

function blockedCount(task: KanbanTask): number {
  const executionBlocked = task.execution_issue && !['done', 'cancelled'].includes(task.display_status);
  return task.blocked_by.length + task.dependency_blockers.length + Number(executionBlocked);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

function Task({ task }: { task: KanbanTask }) {
  const blocked = blockedCount(task);
  const blockers = [...task.blocked_by, ...task.dependency_blockers];
  return (
    <details className="task">
      <summary>
        <div className="task-top">
          <span className="task-id">{task.id}</span>
          <span className="chip">{task.priority}</span>
        </div>
        <span className="task-title">{task.title}</span>
        <div className="chips">
          <span className="chip">{task.display_status.replaceAll('_', ' ')}</span>
          {task.critical && <span className="chip chip--critical">Critical</span>}
          {blocked > 0 && <span className="chip chip--blocked">{blocked} blocked</span>}
          {task.next_rank && <span className="chip chip--next">Next #{task.next_rank}</span>}
        </div>
      </summary>
      <div className="task-detail">
        {task.outcome && <Detail label="Outcome" value={task.outcome} />}
        <Detail label="Owner" value={task.owner ?? 'Unassigned'} />
        <Detail label="Milestone" value={task.milestone ?? 'None'} />
        {(task.scheduled_start || task.scheduled_end) && (
          <Detail label="Scheduled" value={`${task.scheduled_start ?? '—'} → ${task.scheduled_end ?? '—'}`} />
        )}
        {blockers.length > 0 && <Detail label="Blocked by" value={blockers.join(', ')} />}
        {task.acceptance.length > 0 && (
          <div className="detail-row">
            <span className="detail-label">Acceptance</span>
            <ul className="detail-list">{task.acceptance.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        )}
        {task.execution_issue && task.execution_issue_reason && (
          <div className="detail-row">
            <span className="detail-label">Execution issue</span>
            <span className="detail-value detail-issue">{task.execution_issue_reason}</span>
          </div>
        )}
      </div>
    </details>
  );
}

function Board({ data }: { data: KanbanData }) {
  const projectWarnings = data.warnings.filter((warning) => warning.task_id === undefined);
  return (
    <div className="board">
      <div className="board-head">
        <span className="board-eyebrow">{data.project.id} · {data.project.profile} · {data.project.status}</span>
        <h1 className="board-title">{data.project.name}</h1>
        {data.project.objective && <p className="board-objective">{data.project.objective}</p>}
      </div>

      {projectWarnings.map((warning) => (
        <div className="warnings" role="status" key={`${warning.code}:${warning.message}`}>{warning.message}</div>
      ))}

      <div className="lanes">
        {data.lanes.map((lane) => (
          <section className="lane" key={lane.id} aria-labelledby={`lane-${lane.id}`}>
            <div className="lane-head">
              <h2 className="lane-title" id={`lane-${lane.id}`}>{lane.title}</h2>
              <span className="lane-count">{lane.tasks.length}</span>
            </div>
            {lane.tasks.length === 0
              ? <p className="lane-empty">No tasks</p>
              : lane.tasks.map((task) => <Task task={task} key={task.id} />)}
          </section>
        ))}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="board" aria-busy="true" aria-label="Loading project board">
      <div className="pm-skeleton skeleton-head" />
      <div className="lanes">
        {[0, 1, 2, 3].map((index) => <div className="pm-skeleton skeleton-lane" key={index} />)}
      </div>
    </div>
  );
}

function BoardApp() {
  const { app, isConnected, error, summary } = useProjectHost();
  const project = useProject(app, isConnected, summary?.projectKey ?? null);

  if (error) return <div className="pm-error" role="alert">Could not connect to the host: {error.message}</div>;
  if (project.status === 'error') return <div className="pm-error" role="alert">Could not load the project: {project.message}</div>;
  if (project.status === 'loading') return <Loading />;
  return <Board data={project.data} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><BoardApp /></StrictMode>);
