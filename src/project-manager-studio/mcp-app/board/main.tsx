// Fullscreen Project Manager board. Pulls the full payload through the app-only
// tool so the model never carries it, renders lanes and tasks, and discloses
// task detail inline. Read-only: nothing here writes, and there is no dialog,
// popover, or floating panel that a host container would clip.
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useDisplayMode, useProject, useProjectHost } from '../host.js';
import { Board, BoardLoading } from './Board.js';
import '../theme.css';
import './board.css';

function BoardApp() {
  const { app, isConnected, error, summary } = useProjectHost();
  const requestMode = useDisplayMode(app);
  const requestedFullscreen = useRef(false);
  const project = useProject(app, isConnected, summary?.projectKey ?? null);

  // pm_open_board can instantiate this view directly in an inline tool frame.
  // Promote that frame once after the host handshake; data loading remains
  // independent so a host that declines fullscreen can still show the board.
  useEffect(() => {
    if (!isConnected || requestedFullscreen.current) return;
    requestedFullscreen.current = true;
    void requestMode('fullscreen');
  }, [isConnected, requestMode]);

  if (error) return <div className="pm-error" role="alert">Could not connect to the host: {error.message}</div>;
  if (project.status === 'error') return <div className="pm-error" role="alert">Could not load the project: {project.message}</div>;
  if (project.status === 'loading') return <BoardLoading />;
  return <Board data={project.data} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><BoardApp /></StrictMode>);
