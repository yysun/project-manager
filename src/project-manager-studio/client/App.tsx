// Project Manager Studio shell: tab-local project selection, stale-response
// guards, URL-addressable views, coherent filters, shared sticky view headers,
// locally restored Summary/Filters preferences, and browser lease renewal.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import type { KanbanData, KanbanTask, Priority, ProjectCatalogData } from '../shared/api';
import { TaskDialog } from './components/TaskDialog';
import { Timeline } from './components/Timeline';
import { createSelectionGuard, type SelectionRequest } from './selection-guard.mjs';
import { readPanelPreferences, writePanelPreferences, type PanelPreferences } from './panel-preferences.mjs';
import { startStudioHeartbeat } from './studio-heartbeat.mjs';

type StudioView = 'kanban' | 'timeline';
function viewFromUrl(): StudioView { return new URLSearchParams(window.location.search).get('view') === 'timeline' ? 'timeline' : 'kanban'; }

export function App() {
  const guard = useRef(createSelectionGuard());
  const topbar = useRef<HTMLElement | null>(null);
  const kanbanHeaderScroll = useRef<HTMLDivElement | null>(null);
  const [catalog, setCatalog] = useState<ProjectCatalogData | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [data, setData] = useState<KanbanData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutationPending, setMutationPending] = useState(false);
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState<Priority | 'all'>('all');
  const [owner, setOwner] = useState('all');
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [view, setViewState] = useState<StudioView>(viewFromUrl);
  const [panelPreferences, setPanelPreferences] = useState(() => readPanelPreferences(window));
  const [stickyTop, setStickyTop] = useState(0);
  const [selected, setSelected] = useState<{ task: KanbanTask; opener: HTMLElement | null; formRevision: string } | null>(null);

  useEffect(() => startStudioHeartbeat(), []);

  const loadProject = useCallback(async (request: SelectionRequest) => {
    if (!request.key) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/project?project=${encodeURIComponent(request.key)}`); const body = await response.json();
      if (!response.ok) throw new Error(body.errors?.[0]?.message ?? 'Could not load project.');
      if (!guard.current.accepts(request, body.data.project.key)) return;
      const next = body.data as KanbanData; setData(next);
      setSelected((current) => {
        if (!current) return null;
        const task = next.tasks.find((item) => item.id === current.task.id);
        return task ? { ...current, task, formRevision: next.mutation_revision } : null;
      });
    } catch (value) {
      if (!guard.current.isCurrent(request)) return;
      setData(null); setSelected(null); setError(value instanceof Error ? value.message : 'Could not load project.');
    } finally {
      if (guard.current.isCurrent(request)) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true); setError(null);
      try {
        const response = await fetch('/api/projects'); const body = await response.json();
        if (!response.ok) throw new Error(body.errors?.[0]?.message ?? 'Could not load projects.');
        if (!active) return;
        const next = body.data as ProjectCatalogData;
        setCatalog(next); setSelectedKey(next.initial_project_key);
        await loadProject(guard.current.begin(next.initial_project_key));
      } catch (value) {
        if (!active) return;
        setError(value instanceof Error ? value.message : 'Could not load projects.'); setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadProject]);

  useEffect(() => { const sync = () => setViewState(viewFromUrl()); window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync); }, []);

  useLayoutEffect(() => {
    const element = topbar.current;
    if (!element) { setStickyTop(0); return; }
    const update = () => setStickyTop(getComputedStyle(element).position === 'sticky' ? element.getBoundingClientRect().height : 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [data?.project.key]);

  function switchProject(key: string) {
    if (key === selectedKey) return;
    const request = guard.current.begin(key);
    setSelectedKey(key); setData(null); setSelected(null); setSearch(''); setPriority('all'); setOwner('all'); setBlockedOnly(false); setError(null); setMutationPending(false);
    void loadProject(request);
  }

  function refreshProject() { const request = guard.current.read(); if (request) void loadProject(request); }
  function beginMutation(): SelectionRequest | null {
    const request = guard.current.beginMutation();
    if (request) setMutationPending(true);
    return request;
  }
  function finishMutation(request: SelectionRequest) { if (guard.current.finishMutation(request)) { setMutationPending(false); setLoading(false); } }

  function setView(next: StudioView) {
    const url = new URL(window.location.href);
    if (next === 'timeline') url.searchParams.set('view', 'timeline'); else url.searchParams.delete('view');
    window.history.pushState({}, '', url); setViewState(next);
  }

  function togglePanel(panel: keyof PanelPreferences) {
    const next = { ...panelPreferences, [panel]: !panelPreferences[panel] };
    setPanelPreferences(next);
    writePanelPreferences(window, next);
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.tasks.filter((task) => {
      const matchesSearch = !query || `${task.id} ${task.title} ${task.outcome} ${task.owner ?? ''}`.toLowerCase().includes(query);
      const matchesPriority = priority === 'all' || task.priority === priority;
      const matchesOwner = owner === 'all' || (owner === 'unassigned' ? task.owner === null : task.owner === owner);
      const matchesBlocked = !blockedOnly || task.blocked_by.length > 0 || task.dependency_blockers.length > 0;
      return matchesSearch && matchesPriority && matchesOwner && matchesBlocked;
    });
  }, [data, search, priority, owner, blockedOnly]);
  const filteredIds = useMemo(() => new Set(filtered.map((task) => task.id)), [filtered]);
  const visibleLanes = useMemo(() => data ? data.lanes.map((lane) => ({ lane, tasks: lane.tasks.filter((task) => filteredIds.has(task.id)) })) : [], [data, filteredIds]);

  function syncKanbanHeader(event: UIEvent<HTMLDivElement>) {
    if (kanbanHeaderScroll.current) kanbanHeaderScroll.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  if (!data) return <div className={`loading-screen ${error ? 'error-screen' : ''}`}><div className="mark">{error ? '!' : 'PM'}</div><h1>{error ? 'Project could not be loaded' : 'Loading project…'}</h1>{catalog && <ProjectSelect catalog={catalog} selectedKey={selectedKey} disabled={false} onChange={switchProject} />}{error && <p>{error}</p>}{error && selectedKey && <button className="primary-button" onClick={refreshProject}>Try again</button>}</div>;

  const acceptProjectData = (next: KanbanData, request: SelectionRequest) => { if (guard.current.accepts(request, next.project.key)) setData(next); };

  return <main className="app-shell">
    <header className="topbar" ref={topbar}>
      <div className="brand"><div className="mark">PM</div><div><span>Project Manager</span><strong>Studio</strong></div></div>
      <div className="project-heading">
        <div className="project-select-col">
          <ProjectSelect catalog={catalog!} selectedKey={selectedKey} disabled={false} onChange={switchProject} />
          <div className="project-dates"><span>Start {data.project.start_date ?? '—'}</span><span aria-hidden="true">·</span><span>Target {data.project.target_date ?? '—'}</span></div>
        </div>
        <div className="project-title"><span className="eyebrow">{data.project.id} · {data.project.profile}</span><h1>{data.project.name}</h1><p>{data.project.objective}</p></div>
      </div>
      <div className="topbar-actions">
        <nav className="view-switcher" aria-label="Project views"><button aria-current={view === 'kanban' ? 'page' : undefined} onClick={() => setView('kanban')}>Kanban</button><button aria-current={view === 'timeline' ? 'page' : undefined} onClick={() => setView('timeline')}>Timeline</button></nav>
        <button className="refresh-button" onClick={refreshProject} disabled={loading || mutationPending}><span aria-hidden="true">↻</span> {loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </header>
    {data.warnings.map((warning) => <div className="warning-banner" role="status" key={warning.code}>{warning.message}</div>)}
    {error && <div className="error-banner" role="alert">Refresh failed: {error}</div>}
    <section className="summary-panel">
      <button type="button" className="panel-toggle" aria-expanded={!panelPreferences.summaryCollapsed} aria-controls="summary-grid" onClick={() => togglePanel('summaryCollapsed')}>
        <span className="panel-toggle-icon" aria-hidden="true">▾</span><span>Summary</span>
      </button>
      <div className={`summary-collapse ${panelPreferences.summaryCollapsed ? 'collapsed' : ''}`}>
        <div className="summary-collapse-inner">
          <div className="summary-grid" id="summary-grid" role="group" aria-label="Project summary">
            <Metric label="Total tasks" value={data.summary.tasks.total} detail={`${data.summary.tasks.actionable} actionable`} />
            <Metric label="Blocked" value={data.summary.tasks.blocked} detail="dependency or explicit" tone={data.summary.tasks.blocked ? 'warn' : 'good'} />
            <Metric label="Success verified" value={`${data.summary.success.verified}/${data.summary.success.total}`} detail={`${data.summary.success.covered} covered`} />
            <Metric label="Owner gaps" value={data.summary.owner_gaps} detail="tasks need an owner" tone={data.summary.owner_gaps ? 'warn' : 'good'} />
            <Metric label="Target" value={data.project.target_date ?? 'Unknown'} detail={data.project.current_milestone ?? 'No active milestone'} compact />
          </div>
        </div>
      </div>
    </section>
    <section className="filters-panel">
      <div className="toolbar" role="group" aria-label="Task filters">
        <button type="button" className="panel-toggle" aria-expanded={!panelPreferences.filtersCollapsed} aria-controls="task-filters" onClick={() => togglePanel('filtersCollapsed')}>
          <span className="panel-toggle-icon" aria-hidden="true">▾</span><span>Filters</span>
        </button>
        <div className="filter-controls" id="task-filters" hidden={panelPreferences.filtersCollapsed}>
          <label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Search tasks" placeholder="Search ID, title, outcome, owner…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as Priority | 'all')}><option value="all">All priorities</option>{data.options.priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Owner</span><select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="all">All owners</option><option value="unassigned">Unassigned</option>{data.options.owners.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="toggle"><input type="checkbox" checked={blockedOnly} onChange={(event) => setBlockedOnly(event.target.checked)} /><span>Blocked only</span></label>
          {(search || priority !== 'all' || owner !== 'all' || blockedOnly) && <button className="clear-button" onClick={() => { setSearch(''); setPriority('all'); setOwner('all'); setBlockedOnly(false); }}>Clear filters</button>}
        </div>
      </div>
    </section>
    {view === 'kanban' ? <section className="kanban-panel" aria-label="Task Kanban board">
      <div className="kanban-sticky-header" style={{ top: stickyTop }}>
        <div className="kanban-header-viewport" ref={kanbanHeaderScroll}>
          <div className="kanban-header-grid">{visibleLanes.map(({ lane, tasks }) => <div className={`kanban-lane-header lane--${lane.id}`} key={lane.id}><div><span className="lane-dot" aria-hidden="true" /><h2 id={`lane-${lane.id}`}>{lane.title}</h2></div><span className="lane-count" aria-label={`${tasks.length} tasks`}>{tasks.length}</span></div>)}</div>
        </div>
      </div>
      <div className="board-scroll" role="region" aria-label="Scrollable Task Kanban board" tabIndex={0} onScroll={syncKanbanHeader}>
        <div className="board">{visibleLanes.map(({ lane, tasks }) => <section className={`lane lane--${lane.id}`} key={lane.id} aria-labelledby={`lane-${lane.id}`}>
          <div className="lane-tasks">{tasks.length === 0 ? <div className="empty-lane"><span>—</span><p>No matching tasks</p></div> : tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={(opener) => setSelected({ task, opener, formRevision: data.mutation_revision })} />)}</div>
        </section>)}</div>
      </div>
    </section> : <Timeline key={data.project.key} data={data} tasks={filtered} stickyTop={stickyTop} onOpen={(task, opener) => setSelected({ task, opener, formRevision: data.mutation_revision })} beginMutation={beginMutation} finishMutation={finishMutation} onSaved={acceptProjectData} />}
    {selected && <TaskDialog key={`${data.project.key}:${selected.task.id}:${selected.formRevision}`} data={data} task={selected.task} opener={selected.opener} onClose={() => setSelected(null)} beginMutation={beginMutation} finishMutation={finishMutation} onSaved={(next, request) => { if (!guard.current.accepts(request, next.project.key)) return; setData(next); const updated = next.tasks.find((task) => task.id === selected.task.id); if (updated) setSelected({ ...selected, task: updated, formRevision: next.mutation_revision }); }} />}
  </main>;
}

function ProjectSelect({ catalog, selectedKey, disabled, onChange }: { catalog: ProjectCatalogData; selectedKey: string | null; disabled: boolean; onChange: (key: string) => void }) { return <label className="project-selector"><span>Project</span><select aria-label="Select project" value={selectedKey ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{catalog.projects.map((project) => <option value={project.key} key={project.key}>{project.name} · {project.id}</option>)}</select></label>; }
function Metric({ label, value, detail, tone, compact }: { label: string; value: string | number; detail: string; tone?: 'warn' | 'good'; compact?: boolean }) { return <article className={`metric ${tone ? `metric--${tone}` : ''}`}><span>{label}</span><strong className={compact ? 'metric-compact' : ''}>{value}</strong><small>{detail}</small></article>; }
function TaskCard({ task, onOpen }: { task: KanbanTask; onOpen: (opener: HTMLElement) => void }) { const blocked = task.blocked_by.length + task.dependency_blockers.length; return <button className={`task-card ${task.next_rank ? 'task-card--next' : ''}`} onClick={(event) => onOpen(event.currentTarget)}>
  <div className="task-card-top"><span className="task-id">{task.id}</span><span className={`priority priority--${task.priority.toLowerCase()}`}>{task.priority}</span></div>
  <h3>{task.title}</h3><p>{task.outcome}</p>
  <div className="task-badges"><span className={`state state--${task.display_status}`}>{task.display_status.replaceAll('_', ' ')}</span>{task.critical && <span className="critical-chip">Critical</span>}{blocked > 0 && <span className="blocked-chip">{blocked} blocked</span>}{task.next_rank && <span className="next-chip">Next #{task.next_rank}</span>}</div>
  <div className="task-card-footer"><span className={task.owner ? '' : 'owner-gap'}>{task.owner ?? 'Unassigned'}</span><span>{task.milestone ?? 'No milestone'}</span></div>
</button>; }
