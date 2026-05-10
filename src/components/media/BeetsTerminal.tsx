import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import Button from '../basic/Button';
import { auth } from '../../firebaseConfig';
import './BeetsTerminal.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TerminalState =
  | 'connecting'
  | 'folder_select'
  | 'importing'
  | 'finished'
  | 'error'
  | 'locked'
  | 'disconnected';

interface FolderEntry {
  name: string;
  path: string;
}

type FolderListing = Record<string, FolderEntry[]>;

type PromptMode = 'buttons' | 'id';
interface CurrentPrompt {
  mode: PromptMode;
  allowed: string[];
}

// Server → Client
type ServerMessage =
  | { type: 'connected' }
  | { type: 'locked'; message: string }
  | { type: 'error'; message: string }
  | { type: 'output'; data: string }
  | { type: 'prompt'; mode?: PromptMode; allowed: string[] }
  | { type: 'folders'; data: FolderListing }
  | { type: 'import_started'; path: string }
  | { type: 'import_finished'; success: boolean; message: string }
  | { type: 'session_timeout'; message: string }
  | { type: 'idle_warning'; remainingSeconds: number }
  | { type: 'pong' };

// Client → Server
type ClientMessage =
  | { type: 'list_folders' }
  | { type: 'start_import'; paths: string[] }
  | { type: 'input'; value: string }
  | { type: 'abort' }
  | { type: 'ping' };

// Always-visible button set. E (Enter search), eDit, edit Candidates are
// deliberately excluded — those open a text editor that we can't pipe.
const SAFE_BUTTONS: { value: string; label: string }[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: 'a', label: 'Apply' },
  { value: 'm', label: 'More' },
  { value: 's', label: 'Skip' },
  { value: 'u', label: 'Use as-is' },
  { value: 'b', label: 'Abort' },
  { value: 'i', label: 'Enter ID' },
];

// Client-side ID validation — must match server-side (utils/beetsCommand.js)
const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISCOGS_ID_RE = /^\d{1,10}$/;
const ID_BLACKLIST_RE = /[\s\\/?]|:\/\//;

function isValidId(value: string): boolean {
  if (!value || value.length > 50) return false;
  if (ID_BLACKLIST_RE.test(value)) return false;
  return MBID_RE.test(value) || DISCOGS_ID_RE.test(value);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL || '/api/media';
const IDLE_TIMEOUT_SECONDS = 10 * 60;
const PING_INTERVAL_MS = 30_000;

function getWsUrl(): string {
  const envUrl = import.meta.env.VITE_MEDIA_WS_URL;
  if (envUrl) return envUrl;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/media/beets/terminal`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const BeetsTerminal: React.FC = () => {
  const [state, setState] = useState<TerminalState>('disconnected');
  const [folders, setFolders] = useState<FolderListing>({});
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [currentPrompt, setCurrentPrompt] = useState<CurrentPrompt | null>(null);
  const [idInputValue, setIdInputValue] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  // const [idleRemaining, setIdleRemaining] = useState(IDLE_TIMEOUT_SECONDS);
  // const [idleWarning, setIdleWarning] = useState(false);
  const [hasTerminalOutput, setHasTerminalOutput] = useState(false);
  const [cleaningBase, setCleaningBase] = useState<string | null>(null);
  const [cleanResultByBase, setCleanResultByBase] = useState<Record<string, string>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const importFinishedRef = useRef(false);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const termHostRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef(Date.now());
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -------------------------------------------------------------------------
  // xterm setup — created lazily when the host div mounts
  // -------------------------------------------------------------------------

  const ensureTerminal = useCallback(() => {
    if (termRef.current || !termHostRef.current) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: false,
      disableStdin: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      scrollback: 5000,
      theme: {
        background: '#1a1a2e',
        foreground: '#e0e0e0',
        cursor: '#1a1a2e',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termHostRef.current);
    try { fit.fit(); } catch { /* host not yet measurable */ }

    termRef.current = term;
    fitAddonRef.current = fit;

    // Refit on container resize
    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* ignore transient measure errors */ }
    });
    ro.observe(termHostRef.current);
    resizeObserverRef.current = ro;
  }, []);

  const setTermHost = useCallback((node: HTMLDivElement | null) => {
    termHostRef.current = node;
    if (node) {
      ensureTerminal();
    }
  }, [ensureTerminal]);

  const writeToTerm = useCallback((data: string) => {
    if (!termRef.current) return;
    termRef.current.write(data);
    if (!hasTerminalOutput) setHasTerminalOutput(true);
  }, [hasTerminalOutput]);

  // -------------------------------------------------------------------------
  // Idle timer (client-side countdown display)
  // -------------------------------------------------------------------------

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    // setIdleRemaining(IDLE_TIMEOUT_SECONDS);
    // setIdleWarning(false);
  }, []);

  useEffect(() => {
    if (state !== 'importing') {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      return;
    }

    idleTimerRef.current = setInterval(() => {
      // const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      // const remaining = Math.max(0, IDLE_TIMEOUT_SECONDS - elapsed);
      // setIdleRemaining(remaining);
      // if (remaining <= 120) setIdleWarning(true);
    }, 1000);

    return () => {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    };
  }, [state]);

  // -------------------------------------------------------------------------
  // WebSocket send helper
  // -------------------------------------------------------------------------

  const sendMessage = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // -------------------------------------------------------------------------
  // Check session status before connecting
  // -------------------------------------------------------------------------

  const checkSessionStatus = useCallback(async (): Promise<boolean> => {
    try {
      const user = auth.currentUser;
      if (!user) return false;

      const token = await user.getIdToken(true);
      const res = await fetch(`${MEDIA_API_URL}/beets/session-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (data.active) {
        setState('locked');
        setStatusMessage(`Tool is currently in use by ${data.user}`);
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }, []);

  // -------------------------------------------------------------------------
  // WebSocket connection
  // -------------------------------------------------------------------------

  const connect = useCallback(async () => {
    setState('connecting');
    setCurrentPrompt(null);
    setStatusMessage('');
    setHasTerminalOutput(false);
    importFinishedRef.current = false;

    // Reset terminal contents for a fresh session if one already exists
    if (termRef.current) {
      termRef.current.reset();
    }

    const user = auth.currentUser;
    if (!user) {
      setState('error');
      setStatusMessage('You must be logged in.');
      return;
    }

    const canConnect = await checkSessionStatus();
    if (!canConnect) return;

    let token: string;
    try {
      token = await user.getIdToken(true);
    } catch {
      setState('error');
      setStatusMessage('Failed to get authentication token.');
      return;
    }

    const wsUrl = `${getWsUrl()}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'connected':
          setState('folder_select');
          sendMessage({ type: 'list_folders' });
          break;

        case 'locked':
          setState('locked');
          setStatusMessage(msg.message);
          break;

        case 'error':
          writeToTerm(`\r\n\x1b[31mError: ${msg.message}\x1b[0m\r\n`);
          break;

        case 'folders':
          setFolders(msg.data);
          break;

        case 'output':
          writeToTerm(msg.data);
          break;

        case 'prompt':
          setCurrentPrompt({ mode: msg.mode || 'buttons', allowed: msg.allowed });
          if ((msg.mode || 'buttons') !== 'id') setIdInputValue('');
          break;

        case 'import_started':
          setState('importing');
          resetIdleTimer();
          writeToTerm(`\x1b[36m--- Starting import: ${msg.path} ---\x1b[0m\r\n`);
          break;

        case 'import_finished':
          setState('finished');
          setCurrentPrompt(null);
          setStatusMessage(msg.message);
          writeToTerm(`\r\n\x1b[32m--- ${msg.message} ---\x1b[0m\r\n`);
          // Release the server-side session lock so a new import can start.
          // Use a ref so onclose knows this was intentional (not a drop).
          importFinishedRef.current = true;
          if (wsRef.current) {
            wsRef.current.close();
          }
          break;

        case 'idle_warning':
          writeToTerm(`\r\n\x1b[33m--- Warning: session will timeout in ${msg.remainingSeconds}s due to inactivity ---\x1b[0m\r\n`);
          break;

        case 'session_timeout':
          setState('disconnected');
          setCurrentPrompt(null);
          setStatusMessage(msg.message);
          writeToTerm(`\r\n\x1b[31m--- ${msg.message} ---\x1b[0m\r\n`);
          break;

        case 'pong':
          break;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (importFinishedRef.current) {
        // Intentional close after import_finished — stay in 'finished' state.
        setState('finished');
        importFinishedRef.current = false;
      } else {
        setState(prev => {
          if (prev === 'error' || prev === 'locked' || prev === 'disconnected') return prev;
          return 'disconnected';
        });
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };

    pingIntervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        sendMessage({ type: 'ping' });
      }
    }, PING_INTERVAL_MS);
  }, [checkSessionStatus, sendMessage, resetIdleTimer, writeToTerm]);

  // -------------------------------------------------------------------------
  // Lifecycle: clean up WebSocket and xterm on unmount
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Folder selection
  // -------------------------------------------------------------------------

  const toggleFolder = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const toggleAllInBase = (basePath: string) => {
    const baseFolders = folders[basePath] || [];
    const allPaths = baseFolders.map(f => f.path);
    const allSelected = allPaths.every(p => selectedPaths.has(p));

    setSelectedPaths(prev => {
      const next = new Set(prev);
      for (const p of allPaths) {
        if (allSelected) next.delete(p); else next.add(p);
      }
      return next;
    });
  };

  const handleStartImport = () => {
    if (selectedPaths.size === 0) return;
    setCurrentPrompt(null);
    sendMessage({ type: 'start_import', paths: Array.from(selectedPaths) });
  };

  // -------------------------------------------------------------------------
  // Prompt response
  // -------------------------------------------------------------------------

  const handlePromptResponse = (value: string) => {
    sendMessage({ type: 'input', value });
    setCurrentPrompt(null);
    setIdInputValue('');
    resetIdleTimer();
  };

  const handleIdSubmit = () => {
    const trimmed = idInputValue.trim();
    if (!isValidId(trimmed)) return;
    handlePromptResponse(trimmed);
  };

  // -------------------------------------------------------------------------
  // Abort
  // -------------------------------------------------------------------------

  const handleAbort = () => {
    sendMessage({ type: 'abort' });
    setCurrentPrompt(null);
  };

  // -------------------------------------------------------------------------
  // Clean empty folders
  // -------------------------------------------------------------------------

  const handleCleanFolders = async (basePath: string) => {
    const baseLabel = basePath.split('/').pop() || basePath;
    if (!window.confirm(`Delete all folders under ${baseLabel} smaller than 8MB that contain no music files?\n\nThis cannot be undone.`)) return;

    const user = auth.currentUser;
    if (!user) return;

    setCleaningBase(basePath);
    setCleanResultByBase(prev => ({ ...prev, [basePath]: '' }));

    try {
      const token = await user.getIdToken();
      const res = await fetch(`${MEDIA_API_URL}/beets/clean-folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ basePath }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCleanResultByBase(prev => ({ ...prev, [basePath]: `Failed: ${err.error || res.statusText}` }));
        return;
      }

      const data: {
        deleted: { path: string }[];
        kept: unknown[];
        errors: { path: string; error: string }[];
      } = await res.json();

      const deletedPaths = new Set(data.deleted.map(d => d.path));
      if (deletedPaths.size > 0) {
        setSelectedPaths(prev => {
          const next = new Set(prev);
          for (const p of deletedPaths) next.delete(p);
          return next;
        });
      }

      const errPart = data.errors.length > 0 ? `, ${data.errors.length} error(s)` : '';
      setCleanResultByBase(prev => ({
        ...prev,
        [basePath]: `Deleted ${data.deleted.length} folder(s)${errPart}`,
      }));

      sendMessage({ type: 'list_folders' });
    } catch {
      setCleanResultByBase(prev => ({ ...prev, [basePath]: 'Cleanup request failed' }));
    } finally {
      setCleaningBase(null);
    }
  };

  // -------------------------------------------------------------------------
  // Timer display
  // -------------------------------------------------------------------------

  // const formatTime = (seconds: number): string => {
  //   const m = Math.floor(seconds / 60);
  //   const s = seconds % 60;
  //   return `${m}:${s.toString().padStart(2, '0')}`;
  // };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const titlebarText: string = (() => {
    switch (state) {
      case 'connecting':    return 'beets v1.6  —  Connecting...';
      case 'locked':        return 'beets v1.6  —  Busy';
      case 'error':         return 'beets v1.6  —  Error';
      case 'disconnected':  return hasTerminalOutput ? 'beets v1.6  —  Session ended' : 'beets v1.6  —  Idle';
      case 'folder_select': return 'beets v1.6  —  Pick folders';
      case 'importing':     return 'beets v1.6  —  Importing...';
      case 'finished':      return 'beets v1.6  —  Done!';
      default:              return 'beets v1.6';
    }
  })();

  const statusbarLeft: string = (() => {
    switch (state) {
      case 'connecting':    return 'Connecting';
      case 'locked':        return 'Busy';
      case 'error':         return 'Error';
      case 'disconnected':  return 'Disconnected';
      case 'folder_select': return `${selectedPaths.size} folder${selectedPaths.size === 1 ? '' : 's'} selected`;
      case 'importing':     return 'Importing';
      case 'finished':      return 'Finished';
      default:              return 'Ready';
    }
  })();

  const basePaths = Object.keys(folders);
  const hasAnyFolders = basePaths.some(bp => (folders[bp] || []).length > 0);

  return (
    <div className="mm-tool">
      <div className="mm-window" role="region" aria-label="Beets import terminal">
        <div className="mm-titlebar">
          <span className="mm-titlebar-icon" aria-hidden="true">▣</span>
          <span className="mm-titlebar-title">{titlebarText}</span>
          <span className="mm-titlebar-controls" aria-hidden="true">
            <span className="mm-titlebar-btn">_</span>
            <span className="mm-titlebar-btn">▢</span>
            <span className="mm-titlebar-btn">×</span>
          </span>
        </div>

        <div className="mm-chrome">
          {state === 'connecting' && (
            <p className="beets-status beets-status--connecting">Connecting to beets terminal...</p>
          )}

          {state === 'locked' && (
            <>
              <p className="beets-status beets-status--locked">{statusMessage}</p>
              <div className="mm-actions">
                <Button type="basic" label="Retry" onClick={connect} />
              </div>
            </>
          )}

          {state === 'error' && (
            <>
              <p className="beets-status beets-status--error">{statusMessage}</p>
              <div className="mm-actions">
                <Button type="basic" label="Retry" onClick={connect} />
              </div>
            </>
          )}

          {state === 'disconnected' && (
            <>
              {hasTerminalOutput && (
                <div className="beets-output" ref={setTermHost} />
              )}
              <p className="beets-status beets-status--disconnected">
                {statusMessage || (hasTerminalOutput ? 'Disconnected from server.' : 'Import music into the beets library.')}
              </p>
              <div className="mm-actions">
                <span className="mm-btn-primary">
                  <Button type="basic" label={hasTerminalOutput ? 'Reconnect' : 'Start Session'} onClick={connect} />
                </span>
              </div>
            </>
          )}

          {state === 'folder_select' && (
            <>
              <p className="beets-hint">Select folders to import into the beets library.</p>

              {!hasAnyFolders && (
                <p className="beets-status beets-status--empty">No folders found to import.</p>
              )}

              {basePaths.map(basePath => {
                const entries = folders[basePath] || [];
                const baseLabel = basePath.split('/').pop() || basePath;
                const allPaths = entries.map(e => e.path);
                const allSelected = allPaths.length > 0 && allPaths.every(p => selectedPaths.has(p));
                const isCleaning = cleaningBase === basePath;
                const cleanResult = cleanResultByBase[basePath];

                return (
                  <div key={basePath} className="beets-folder-group">
                    <div className="beets-folder-header">
                      {entries.length > 0 ? (
                        <label className="beets-folder-base">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => toggleAllInBase(basePath)}
                          />
                          <span>{baseLabel} (all)</span>
                        </label>
                      ) : (
                        <span className="beets-folder-base beets-folder-base--empty">{baseLabel}</span>
                      )}
                      <button
                        type="button"
                        className="beets-clean-btn"
                        onClick={() => handleCleanFolders(basePath)}
                        disabled={isCleaning || cleaningBase !== null}
                      >
                        {isCleaning ? 'Clearing…' : 'Clear Empty Folders'}
                      </button>
                    </div>
                    {cleanResult && <p className="beets-clean-result">{cleanResult}</p>}
                    {entries.length > 0 && (
                      <div className="beets-folder-list">
                        {entries.map(entry => (
                          <label key={entry.path} className="beets-folder-item">
                            <input
                              type="checkbox"
                              checked={selectedPaths.has(entry.path)}
                              onChange={() => toggleFolder(entry.path)}
                            />
                            <span>{entry.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="mm-actions">
                <span className="mm-btn-primary">
                  <Button
                    type="basic"
                    label="Start Import"
                    onClick={handleStartImport}
                    disabled={selectedPaths.size === 0}
                  />
                </span>
              </div>
            </>
          )}

          {(state === 'importing' || state === 'finished') && (
            <>
              <div className="beets-output" ref={setTermHost} />

              {state === 'importing' && (
                <div className="beets-prompt-bar">
                  {SAFE_BUTTONS.map(btn => {
                    const enabled =
                      currentPrompt?.mode === 'buttons' &&
                      currentPrompt.allowed.includes(btn.value);
                    return (
                      <button
                        key={btn.value}
                        className={`beets-prompt-btn${enabled ? '' : ' beets-prompt-btn--disabled'}`}
                        disabled={!enabled}
                        onClick={() => handlePromptResponse(btn.value)}
                      >
                        [{btn.value.toUpperCase()}] {btn.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentPrompt?.mode === 'id' && (
                <div className="beets-id-bar">
                  <label className="beets-id-label" htmlFor="beets-id-input">
                    MusicBrainz UUID or Discogs release ID:
                  </label>
                  <input
                    id="beets-id-input"
                    type="text"
                    className="beets-id-input"
                    value={idInputValue}
                    onChange={e => setIdInputValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleIdSubmit(); }}
                    placeholder="e.g. 12345678 or 1a2b3c4d-1a2b-3c4d-5e6f-7a8b9c0d1e2f"
                    maxLength={50}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    className="beets-prompt-btn"
                    disabled={!isValidId(idInputValue.trim())}
                    onClick={handleIdSubmit}
                  >
                    Submit
                  </button>
                </div>
              )}

              {state === 'importing' && (
                <div className="beets-session-bar">
                  {/* <span className={`beets-timer ${idleWarning ? 'beets-timer--warning' : ''}`}>
                    Session: {formatTime(idleRemaining)} remaining
                  </span> */}
                  <button className="beets-abort-btn" onClick={handleAbort}>
                    Abort Import
                  </button>
                </div>
              )}

              {state === 'finished' && (
                <div className="beets-finished">
                  <p className="beets-status beets-status--finished">{statusMessage}</p>
                  <div className="mm-actions">
                    <span className="mm-btn-primary">
                      <Button type="basic" label="New Import" onClick={connect} />
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mm-statusbar" aria-hidden="true">
          <span className="mm-statusbar-section mm-statusbar-section--grow">
            <span className="mm-statusbar-blip" />
            {statusbarLeft}
          </span>
          <span className="mm-statusbar-section">
            ♪ beets ♪
          </span>
        </div>
      </div>
    </div>
  );
};

export default BeetsTerminal;
