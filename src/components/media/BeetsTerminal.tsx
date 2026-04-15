import React, { useState, useEffect, useRef, useCallback } from 'react';
import Button from '../basic/Button';
import { auth } from '../../firebaseConfig';
import './BeetsTerminal.css';

// ---------------------------------------------------------------------------
// ANSI SGR escape code parser
// ---------------------------------------------------------------------------

interface AnsiSegment {
  text: string;
  bold: boolean;
  fg: number | null; // 0–7 (standard 8 colours), null = default
}

function parseAnsi(line: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let bold = false;
  let fg: number | null = null;
  let lastIndex = 0;

  const ansiRe = /\x1b\[([0-9;]*)m/g;
  let m: RegExpExecArray | null;

  while ((m = ansiRe.exec(line)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, m.index), bold, fg });
    }
    lastIndex = m.index + m[0].length;

    const codes = m[1] === '' ? [0] : m[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0) {
        bold = false; fg = null;
      } else if (code === 1) {
        bold = true;
      } else if (code === 22) {
        bold = false;
      } else if (code >= 30 && code <= 37) {
        fg = code - 30;
      } else if (code === 39 || code === 49) {
        fg = null;
      }
    }
  }

  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), bold, fg });
  }

  return segments;
}

function segClass(seg: AnsiSegment): string {
  const classes: string[] = [];
  if (seg.bold) classes.push('ansi-bold');
  if (seg.fg !== null) classes.push(`ansi-fg-${seg.fg}`);
  return classes.join(' ');
}

function renderLines(lines: string[]): React.ReactNode {
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && '\n'}
      {parseAnsi(line).map((seg, j) => {
        const cls = segClass(seg);
        return cls
          ? <span key={j} className={cls}>{seg.text}</span>
          : seg.text;
      })}
    </React.Fragment>
  ));
}

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

// Server → Client
type ServerMessage =
  | { type: 'connected' }
  | { type: 'locked'; message: string }
  | { type: 'error'; message: string }
  | { type: 'output'; data: string }
  | { type: 'prompt'; data: string; allowed: string[] }
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

// Prompt button labels for common beets patterns
const PROMPT_LABELS: Record<string, string> = {
  a: 'Apply',
  s: 'Skip',
  b: 'Abort',
  m: 'More',
  k: 'Keep',
  r: 'Remove',
  y: 'Yes',
  n: 'No',
  g: 'Group',
  e: 'Edit',
  t: 'as Tracks',
  u: 'Resume',
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL || '/api/media';
const IDLE_TIMEOUT_SECONDS = 10 * 60;
const PING_INTERVAL_MS = 30_000;

function getWsUrl(): string {
  const envUrl = import.meta.env.VITE_MEDIA_WS_URL;
  if (envUrl) return envUrl;

  // Derive from current location
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
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<string[] | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [idleRemaining, setIdleRemaining] = useState(IDLE_TIMEOUT_SECONDS);
  const [idleWarning, setIdleWarning] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const autoScrollRef = useRef(true);
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef(Date.now());
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -------------------------------------------------------------------------
  // Auto-scroll logic
  // -------------------------------------------------------------------------

  const scrollToBottom = useCallback(() => {
    if (outputRef.current && autoScrollRef.current) {
      const el = outputRef.current;
      el.scrollTop = el.scrollHeight - el.clientHeight;
    }
  }, []);

  const handleOutputScroll = useCallback(() => {
    if (!outputRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
    // Re-enable auto-scroll if user scrolls near bottom (within 40px)
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  }, []);

  // -------------------------------------------------------------------------
  // Idle timer (client-side countdown display)
  // -------------------------------------------------------------------------

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleRemaining(IDLE_TIMEOUT_SECONDS);
    setIdleWarning(false);
  }, []);

  useEffect(() => {
    if (state !== 'importing') {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      return;
    }

    idleTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, IDLE_TIMEOUT_SECONDS - elapsed);
      setIdleRemaining(remaining);
      if (remaining <= 120) setIdleWarning(true);
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
      return true; // Proceed to try WebSocket even if status check fails
    }
  }, []);

  // -------------------------------------------------------------------------
  // WebSocket connection
  // -------------------------------------------------------------------------

  const connect = useCallback(async () => {
    setState('connecting');
    setOutputLines([]);
    setCurrentPrompt(null);
    setStatusMessage('');

    const user = auth.currentUser;
    if (!user) {
      setState('error');
      setStatusMessage('You must be logged in.');
      return;
    }

    // Pre-check: is a session already active?
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

    ws.onopen = () => {
      // Connection established, wait for 'connected' message
    };

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
          appendOutput(`Error: ${msg.message}`);
          break;

        case 'folders':
          setFolders(msg.data);
          break;

        case 'output':
          appendOutput(msg.data);
          break;

        case 'prompt':
          setCurrentPrompt(msg.allowed);
          break;

        case 'import_started':
          setState('importing');
          resetIdleTimer();
          appendOutput(`--- Starting import: ${msg.path} ---`);
          break;

        case 'import_finished':
          setState('finished');
          setCurrentPrompt(null);
          setStatusMessage(msg.message);
          appendOutput(`--- ${msg.message} ---`);
          break;

        case 'idle_warning':
          setIdleWarning(true);
          appendOutput(`--- Warning: session will timeout in ${msg.remainingSeconds}s due to inactivity ---`);
          break;

        case 'session_timeout':
          setState('disconnected');
          setCurrentPrompt(null);
          setStatusMessage(msg.message);
          appendOutput(`--- ${msg.message} ---`);
          break;

        case 'pong':
          break;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      // Only update state if we weren't already in a terminal state
      setState(prev => {
        if (prev === 'finished' || prev === 'error' || prev === 'locked' || prev === 'disconnected') {
          return prev;
        }
        return 'disconnected';
      });
    };

    ws.onerror = () => {
      // onclose will fire after this
    };

    // Keepalive ping
    pingIntervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        sendMessage({ type: 'ping' });
      }
    }, PING_INTERVAL_MS);
  }, [checkSessionStatus, sendMessage, resetIdleTimer]);

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  useEffect(() => {
    // Don't auto-connect — user clicks "Start Session" to connect.
    // This avoids React Strict Mode double-mount racing with the session lock.
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Output management
  // -------------------------------------------------------------------------

  const appendOutput = useCallback((line: string) => {
    setOutputLines(prev => [...prev, line]);
    // Schedule scroll after render
    requestAnimationFrame(() => scrollToBottom());
  }, [scrollToBottom]);

  // -------------------------------------------------------------------------
  // Folder selection
  // -------------------------------------------------------------------------

  const toggleFolder = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
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
        if (allSelected) {
          next.delete(p);
        } else {
          next.add(p);
        }
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
    resetIdleTimer();
    appendOutput(`> ${value}`);
  };

  // -------------------------------------------------------------------------
  // Abort
  // -------------------------------------------------------------------------

  const handleAbort = () => {
    sendMessage({ type: 'abort' });
    setCurrentPrompt(null);
  };

  // -------------------------------------------------------------------------
  // Timer display
  // -------------------------------------------------------------------------

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // --- Connecting ---
  if (state === 'connecting') {
    return (
      <div className="beets-terminal">
        <p className="beets-status beets-status--connecting">Connecting to beets terminal...</p>
      </div>
    );
  }

  // --- Locked ---
  if (state === 'locked') {
    return (
      <div className="beets-terminal">
        <p className="beets-status beets-status--locked">{statusMessage}</p>
        <div className="beets-actions">
          <Button type="basic" label="Retry" onClick={connect} />
        </div>
      </div>
    );
  }

  // --- Error ---
  if (state === 'error') {
    return (
      <div className="beets-terminal">
        <p className="beets-status beets-status--error">{statusMessage}</p>
        <div className="beets-actions">
          <Button type="basic" label="Retry" onClick={connect} />
        </div>
      </div>
    );
  }

  // --- Disconnected (also the initial landing state) ---
  if (state === 'disconnected') {
    const hasHistory = outputLines.length > 0;
    return (
      <div className="beets-terminal">
        {hasHistory && (
          <pre className="beets-output" ref={outputRef}>
            {renderLines(outputLines)}
          </pre>
        )}
        <p className="beets-status beets-status--disconnected">
          {statusMessage || (hasHistory ? 'Disconnected from server.' : 'Import music into the beets library.')}
        </p>
        <div className="beets-actions">
          <Button type="basic" label={hasHistory ? 'Reconnect' : 'Start Session'} onClick={connect} />
        </div>
      </div>
    );
  }

  // --- Folder Select ---
  if (state === 'folder_select') {
    const basePaths = Object.keys(folders);
    const hasAnyFolders = basePaths.some(bp => (folders[bp] || []).length > 0);

    return (
      <div className="beets-terminal">
        <p className="beets-hint">Select folders to import into the beets library.</p>

        {!hasAnyFolders && (
          <p className="beets-status beets-status--empty">No folders found to import.</p>
        )}

        {basePaths.map(basePath => {
          const entries = folders[basePath] || [];
          if (entries.length === 0) return null;

          const baseLabel = basePath.split('/').pop() || basePath;
          const allPaths = entries.map(e => e.path);
          const allSelected = allPaths.every(p => selectedPaths.has(p));

          return (
            <div key={basePath} className="beets-folder-group">
              <label className="beets-folder-base">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => toggleAllInBase(basePath)}
                />
                <span>{baseLabel} (all)</span>
              </label>
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
            </div>
          );
        })}

        <div className="beets-actions">
          <Button
            type="basic"
            label="Start Import"
            onClick={handleStartImport}
            disabled={selectedPaths.size === 0}
          />
        </div>
      </div>
    );
  }

  // --- Importing / Finished ---
  return (
    <div className="beets-terminal">
      <pre
        className="beets-output"
        ref={outputRef}
        onScroll={handleOutputScroll}
      >
        {renderLines(outputLines)}
      </pre>

      {/* Prompt buttons */}
      {currentPrompt && currentPrompt.length > 0 && (
        <div className="beets-prompt-bar">
          {currentPrompt.map(opt => (
            <button
              key={opt}
              className="beets-prompt-btn"
              onClick={() => handlePromptResponse(opt)}
            >
              [{opt.toUpperCase()}] {PROMPT_LABELS[opt.toLowerCase()] || ''}
            </button>
          ))}
        </div>
      )}

      {/* Session timer + abort */}
      {state === 'importing' && (
        <div className="beets-session-bar">
          <span className={`beets-timer ${idleWarning ? 'beets-timer--warning' : ''}`}>
            Session: {formatTime(idleRemaining)} remaining
          </span>
          <button className="beets-abort-btn" onClick={handleAbort}>
            Abort Import
          </button>
        </div>
      )}

      {/* Finished state */}
      {state === 'finished' && (
        <div className="beets-finished">
          <p className="beets-status beets-status--finished">{statusMessage}</p>
          <div className="beets-actions">
            <Button type="basic" label="New Import" onClick={connect} />
          </div>
        </div>
      )}
    </div>
  );
};

export default BeetsTerminal;
