// Inline Project Manager status card. Renders the compact summary that arrives
// with the tool result, within the host's inline constraints: five metrics, one
// action, content-fitted height, and no internal scrolling. Read-only by
// construction — there is no control here that changes project state.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useDisplayMode, useProjectHost } from '../host.js';
import type { ProjectSummary } from '../../../mcp-app/tools/project-reads.js';
import '../theme.css';
import './status.css';

function Metric({ label, value, detail, tone, small }: { label: string; value: string | number; detail?: string; tone?: 'warn' | 'good'; small?: boolean }) {
  return (
    <div className={`metric ${tone ? `metric--${tone}` : ''}`}>
      <span className="metric-label">{label}</span>
      <strong className={`metric-value ${small ? 'is-small' : ''}`}>{value}</strong>
      {detail && <span className="metric-detail">{detail}</span>}
    </div>
  );
}

function Loading() {
  return (
    <div className="card" aria-busy="true" aria-label="Loading project status">
      <div className="pm-skeleton skeleton-title" />
      <div className="metrics">
        {[0, 1, 2, 3, 4].map((index) => <div className="pm-skeleton skeleton-metric" key={index} />)}
      </div>
    </div>
  );
}

function Card({ summary, canFullscreen, onOpenBoard }: { summary: ProjectSummary; canFullscreen: boolean; onOpenBoard: () => void }) {
  return (
    <div className="card">
      <div className="heading">
        <span className="eyebrow">{summary.id} · {summary.status}</span>
        <h1 className="title">{summary.name}</h1>
        {summary.objective && <p className="objective">{summary.objective}</p>}
      </div>

      <div className="metrics" role="group" aria-label="Project summary">
        <Metric label="Tasks" value={summary.tasks.total} detail={`${summary.tasks.actionable} actionable`} />
        <Metric label="Blocked" value={summary.tasks.blocked} tone={summary.tasks.blocked ? 'warn' : 'good'} />
        <Metric label="Verified" value={`${summary.success.verified}/${summary.success.total}`} detail="success criteria" />
        <Metric label="Owner gaps" value={summary.ownerGaps} tone={summary.ownerGaps ? 'warn' : 'good'} />
        <Metric label="Target" value={summary.targetDate ?? 'Unknown'} detail={summary.currentMilestone ?? 'No active milestone'} small />
      </div>

      {summary.next.length > 0 && (
        <div className="next">
          <span className="next-label">Next up</span>
          {summary.next.map((task) => (
            <div className="next-item" key={task.id}>
              <span className="next-id">{task.id}</span>
              <span className="next-title">{task.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Only offered when the host actually reports fullscreen support. */}
      {canFullscreen && (
        <div className="actions">
          <button type="button" className="pm-primary" onClick={onOpenBoard}>Open board</button>
        </div>
      )}
    </div>
  );
}

function StatusApp() {
  const { app, isConnected, error, summary, canFullscreen } = useProjectHost();
  const requestMode = useDisplayMode(app);

  if (error) return <div className="pm-error" role="alert">Could not connect to the host: {error.message}</div>;
  if (!isConnected || !summary) return <Loading />;

  return <Card summary={summary} canFullscreen={canFullscreen} onOpenBoard={() => void requestMode('fullscreen')} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><StatusApp /></StrictMode>);
