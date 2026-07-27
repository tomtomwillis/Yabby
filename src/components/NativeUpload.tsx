import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import './NativeUpload.css';
import Button from './basic/Button';

type FileStatus = 'queued' | 'hashing' | 'uploading' | 'verifying' | 'done' | 'error';

interface UploadFile {
  id: string;
  file: File;
  relativePath: string;
  status: FileStatus;
  progress: number;
  error?: string;
  sha256?: string;
  size: number;
}

interface AlbumResult {
  originalDirName: string;
  finalDirName: string;
  artist: string;
  album: string;
  fileCount: number;
  totalSizeBytes: number;
  directoryRenamed: boolean;
  coverArtRenamed: boolean;
}

interface Rejection {
  file: string;
  reason: string;
}

interface FinalizeResult {
  albums: AlbumResult[];
  rejections: Rejection[];
  totalFiles: number;
  totalSizeBytes: number;
}

type SessionStatus = 'idle' | 'uploading' | 'finalizing' | 'complete' | 'error';

interface UploadSession {
  sessionId: string;
  files: UploadFile[];
  status: SessionStatus;
  result?: FinalizeResult;
  error?: string;
}

const API_URL = (import.meta.env.VITE_MEDIA_API_URL as string | undefined) || '/api/media';
const ALLOWED_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.ogg', '.opus', '.m4a', '.aac', '.wv', '.ape', '.aiff',
  '.jpg', '.jpeg', '.png',
]);
const CHUNK_SIZE = 64 * 1024;
const MAX_CONCURRENT = 3;

// Mirrors defaults in backend_server/routes/upload.js (UPLOAD_MAX_* env vars) —
// keep these in sync if the backend limits ever change.
const LIMITS = {
  maxFileSize: 200 * 1024 * 1024,
  maxSessionSize: 2 * 1024 * 1024 * 1024,
  maxAlbumGroups: 50,
  maxActiveSessions: 5,
  sessionMaxAgeMinutes: 60,
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 2 : 0)} ${units[i]}`;
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function computeSha256Chunked(file: File): Promise<string> {
  const cryptoObj = window.crypto || (window as unknown as { msCrypto?: Crypto }).msCrypto;
  const reader = file.slice(0).stream().getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      chunks.push(value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer));
    }
    if (done) break;
  }

  let totalLength = 0;
  for (const chunk of chunks) totalLength += chunk.length;
  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  const hash = await cryptoObj.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fileRelativePath(file: File, isDirectory: boolean): string {
  const webkit = (file as unknown as { webkitRelativePath?: string }).webkitRelativePath;
  if (webkit) return webkit;
  if (isDirectory && file.name) {
    return file.name;
  }
  return file.name;
}

function statusBadge(status: FileStatus): string {
  switch (status) {
    case 'queued': return '[ .. ]';
    case 'hashing': return '[HASH]';
    case 'uploading': return '[ >> ]';
    case 'verifying': return '[SYNC]';
    case 'done': return '[ OK ]';
    case 'error': return '[ !! ]';
    default: return '[ .. ]';
  }
}

function statusLabel(f: UploadFile): string {
  switch (f.status) {
    case 'queued': return 'queued';
    case 'hashing': return 'computing checksum...';
    case 'uploading': return `sending — ${f.progress}%`;
    case 'verifying': return 'verifying on server...';
    case 'done': return 'stored';
    case 'error': return f.error || 'error';
    default: return '';
  }
}

function asciiMeter(percent: number, width: number): { filled: string; empty: string } {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filledCount = Math.round((clamped / 100) * width);
  return { filled: '█'.repeat(filledCount), empty: '░'.repeat(width - filledCount) };
}

// ---------------------------------------------------------------------------
// Completion fireworks — a tiny low-res particle system drawn to a small
// canvas buffer and stretched full-screen with pixelated scaling for a
// chunky, lofi look. Self-terminates a few seconds after mounting.
// ---------------------------------------------------------------------------

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

const FIREWORK_COLORS = ['#4CAF50', '#1a2ecc', '#e87a3a', '#8825e6', '#ff5252', '#ffd93d', '#33e0ff'];
const FIREWORKS_DURATION_MS = 5200;
const FIREWORKS_BUFFER_W = 240;
const FIREWORKS_BUFFER_H = 135;

const Fireworks: React.FC<{ active: boolean }> = ({ active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const rawCtx = canvas.getContext('2d');
    if (!rawCtx) return undefined;
    const ctx: CanvasRenderingContext2D = rawCtx;

    setVisible(true);
    canvas.width = FIREWORKS_BUFFER_W;
    canvas.height = FIREWORKS_BUFFER_H;

    let sparks: Spark[] = [];
    let running = true;
    let lastLaunch = 0;
    const start = performance.now();

    function launchBurst(x: number, y: number) {
      const count = 18 + Math.floor(Math.random() * 10);
      const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
        const speed = 0.6 + Math.random() * 1.4;
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 40 + Math.random() * 20,
          color,
        });
      }
    }

    function frame(now: number) {
      if (!running) return;
      const elapsed = now - start;
      if (elapsed > FIREWORKS_DURATION_MS) {
        setVisible(false);
        return;
      }

      if (now - lastLaunch > 550 + Math.random() * 400) {
        lastLaunch = now;
        launchBurst(
          FIREWORKS_BUFFER_W * (0.2 + Math.random() * 0.6),
          FIREWORKS_BUFFER_H * (0.2 + Math.random() * 0.35)
        );
      }

      ctx.clearRect(0, 0, FIREWORKS_BUFFER_W, FIREWORKS_BUFFER_H);
      sparks.forEach(s => {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.03;
        s.life += 1;
        const alpha = Math.max(0, 1 - s.life / s.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
      });
      ctx.globalAlpha = 1;
      sparks = sparks.filter(s => s.life < s.maxLife);

      requestAnimationFrame(frame);
    }

    const rafId = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  }, [active]);

  if (!active || !visible) return null;

  return <canvas ref={canvasRef} className="native-upload-fireworks" aria-hidden="true" />;
};

const NativeUpload: React.FC = () => {
  const [session, setSession] = useState<UploadSession>(() => ({ sessionId: crypto.randomUUID(), files: [], status: 'idle' }));
  const [dragOver, setDragOver] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [finalizeElapsed, setFinalizeElapsed] = useState(0);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const activeCountRef = useRef(0);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const speedWindowRef = useRef<{ time: number; bytes: number }[]>([]);
  const lastProgressRef = useRef<Map<string, number>>(new Map());
  const filesRef = useRef<UploadFile[]>(session.files);
  const statusRef = useRef<SessionStatus>(session.status);
  const uploadedBytesRef = useRef(0);
  const processQueueRef = useRef<(() => Promise<void>) | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const pushLog = useCallback((line: string) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setLog(prev => [...prev.slice(-59), `${time}  ${line}`]);
  }, []);

  const totalBytes = useMemo(() => session.files.reduce((sum, f) => sum + f.size, 0), [session.files]);
  const uploadedBytes = useMemo(() =>
    session.files.reduce((sum, f) => {
      if (f.status === 'done' || f.status === 'verifying') return sum + f.size;
      if (f.status === 'uploading') return sum + Math.round((f.progress / 100) * f.size);
      return sum;
    }, 0),
    [session.files]
  );

  const counts = useMemo(() => {
    let queued = 0;
    let active = 0;
    let done = 0;
    let failed = 0;
    for (const f of session.files) {
      if (f.status === 'queued') queued += 1;
      else if (f.status === 'done') done += 1;
      else if (f.status === 'error') failed += 1;
      else active += 1;
    }
    return { queued, active, done, failed };
  }, [session.files]);

  useEffect(() => {
    if (totalBytes === 0) {
      setOverallProgress(0);
      return;
    }
    setOverallProgress(Math.round((uploadedBytes / totalBytes) * 100));
  }, [uploadedBytes, totalBytes]);

  useEffect(() => {
    uploadedBytesRef.current = uploadedBytes;
  }, [uploadedBytes]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 3000;
      speedWindowRef.current = speedWindowRef.current.filter(entry => entry.time > cutoff);

      if (speedWindowRef.current.length < 2) {
        setSpeed(0);
        setEta(0);
        return;
      }

      const first = speedWindowRef.current[0];
      const last = speedWindowRef.current[speedWindowRef.current.length - 1];
      const elapsed = (last.time - first.time) / 1000;
      const bytesDelta = last.bytes - first.bytes;
      const currentSpeed = elapsed > 0 ? bytesDelta / elapsed : 0;
      setSpeed(Math.max(0, currentSpeed));
      setEta(currentSpeed > 0 ? (totalBytes - uploadedBytes) / currentSpeed : 0);
    }, 500);
    return () => clearInterval(interval);
  }, [totalBytes, uploadedBytes]);

  // Simulated staged progress for the finalize phase (organize -> tag metadata via
  // beets import), since /finalize is a single blocking request with no server
  // progress events. Keeps the user informed instead of staring at a stalled 100%.
  useEffect(() => {
    if (session.status !== 'finalizing') {
      setFinalizeElapsed(0);
      return undefined;
    }
    const start = Date.now();
    const stages = [
      { at: 0, msg: 'organizing files into albums...' },
      { at: 4, msg: 'reading & validating audio metadata...' },
      { at: 9, msg: 'running metadata tagger (beets import) — large batches can take several minutes...' },
    ];
    let nextStage = 0;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setFinalizeElapsed(elapsed);
      while (nextStage < stages.length && elapsed >= stages[nextStage].at) {
        pushLog(stages[nextStage].msg);
        nextStage += 1;
      }
      if (elapsed > 0 && elapsed % 20 === 0) {
        pushLog(`still working — ${elapsed}s elapsed, please keep this tab open...`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [session.status, pushLog]);

  useEffect(() => {
    if (session.status !== 'finalizing') return undefined;
    const frames = ['|', '/', '-', '\\'];
    const t = setInterval(() => setSpinnerFrame(f => (f + 1) % frames.length), 150);
    return () => clearInterval(t);
  }, [session.status]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (session.files.some(f => f.status === 'uploading' || f.status === 'queued')) {
        e.preventDefault();
        e.returnValue = 'Uploads are in progress, are you sure you want to leave?';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [session.files]);

  const updateFile = useCallback((id: string, patch: Partial<UploadFile>) => {
    filesRef.current = filesRef.current.map(f => (f.id === id ? { ...f, ...patch } : f));
    setSession(prev => ({
      ...prev,
      files: prev.files.map(f => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }, []);

  const setFileError = useCallback((id: string, message: string) => {
    updateFile(id, { status: 'error', error: message, progress: 0 });
  }, [updateFile]);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  }, []);

  const uploadFile = useCallback(async (uploadFileItem: UploadFile): Promise<void> => {
    // Immediately claim this file so processQueue doesn't re-pick it while we work.
    updateFile(uploadFileItem.id, { status: 'hashing', progress: 0, error: undefined });

    const token = await getAuthToken();
    if (!token) {
      setFileError(uploadFileItem.id, 'You must be logged in to upload.');
      return;
    }

    let sha256 = uploadFileItem.sha256;
    if (!sha256) {
      sha256 = await computeSha256Chunked(uploadFileItem.file);
      updateFile(uploadFileItem.id, { sha256 });
    }

    updateFile(uploadFileItem.id, { status: 'uploading', progress: 0 });
    pushLog(`[xfer] ${uploadFileItem.relativePath} · ${formatBytes(uploadFileItem.size)}`);

    const controller = new AbortController();
    abortControllersRef.current.set(uploadFileItem.id, controller);

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/upload/file`, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('X-File-Checksum', sha256 as string);

      let verifyingAnnounced = false;

      xhr.upload.addEventListener('progress', event => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);

        if (percent >= 100) {
          if (!verifyingAnnounced) {
            verifyingAnnounced = true;
            pushLog(`[sync] ${uploadFileItem.relativePath} verifying on server...`);
          }
          updateFile(uploadFileItem.id, { status: 'verifying', progress: 100 });
        } else {
          updateFile(uploadFileItem.id, { progress: percent });
        }

        const now = Date.now();
        const previous = lastProgressRef.current.get(uploadFileItem.id) || 0;
        const delta = event.loaded - previous;
        if (delta > 0) {
          speedWindowRef.current.push({ time: now, bytes: uploadedBytesRef.current + event.loaded });
          lastProgressRef.current.set(uploadFileItem.id, event.loaded);
        }
      });

      xhr.addEventListener('load', () => {
        abortControllersRef.current.delete(uploadFileItem.id);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success) {
              updateFile(uploadFileItem.id, { status: 'done', progress: 100, sha256: response.file?.sha256 || sha256 });
              pushLog(`[ok] ${uploadFileItem.relativePath}`);
              resolve();
            } else {
              setFileError(uploadFileItem.id, response.error || 'Upload failed.');
              pushLog(`[!!] ${uploadFileItem.relativePath} — ${response.error || 'upload failed'}`);
              reject(new Error(response.error || 'Upload failed.'));
            }
          } catch {
            setFileError(uploadFileItem.id, 'Invalid server response.');
            pushLog(`[!!] ${uploadFileItem.relativePath} — invalid server response`);
            reject(new Error('Invalid server response.'));
          }
        } else {
          let message = 'Upload failed.';
          try {
            const response = JSON.parse(xhr.responseText);
            message = response.error || message;
          } catch {
            // ignore
          }
          setFileError(uploadFileItem.id, message);
          pushLog(`[!!] ${uploadFileItem.relativePath} — ${message}`);
          reject(new Error(message));
        }
      });

      xhr.addEventListener('error', () => {
        abortControllersRef.current.delete(uploadFileItem.id);
        setFileError(uploadFileItem.id, 'Network error. Click retry to try again.');
        pushLog(`[!!] ${uploadFileItem.relativePath} — network error`);
        reject(new Error('Network error.'));
      });

      xhr.addEventListener('abort', () => {
        abortControllersRef.current.delete(uploadFileItem.id);
        updateFile(uploadFileItem.id, { status: 'queued', progress: 0, error: undefined });
        reject(new Error('Upload aborted.'));
      });

      controller.signal.addEventListener('abort', () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) {
          xhr.abort();
        }
      });

      const formData = new FormData();
      formData.append('sessionId', session.sessionId);
      formData.append('relativePath', uploadFileItem.relativePath);
      formData.append('file', uploadFileItem.file);
      xhr.send(formData);
    });
  }, [getAuthToken, pushLog, session.sessionId, setFileError, updateFile]);

  const finalizeSessionInternal = useCallback(async () => {
    if (statusRef.current === 'finalizing' || statusRef.current === 'complete') return;
    statusRef.current = 'finalizing';
    setSession(prev => ({ ...prev, status: 'finalizing' }));
    pushLog('all files transferred — finalizing session...');
    const token = await getAuthToken();
    if (!token) {
      statusRef.current = 'error';
      setSession(prev => ({ ...prev, status: 'error', error: 'You must be logged in to finalize.' }));
      return;
    }

    try {
      const response = await fetch(`${API_URL}/upload/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });

      const data = await response.json();
      if (!response.ok) {
        statusRef.current = 'error';
        pushLog(`[!!] finalize failed — ${data.error || 'unknown error'}`);
        setSession(prev => ({ ...prev, status: 'error', error: data.error || 'Finalize failed.' }));
        return;
      }

      (data.albums || []).forEach((album: AlbumResult) => {
        pushLog(`[ok] ${album.finalDirName} — ${album.fileCount} tracks, ${formatBytes(album.totalSizeBytes)}`);
      });
      (data.rejections || []).forEach((rej: Rejection) => {
        pushLog(`[!!] ${rej.file} — ${rej.reason}`);
      });
      pushLog('upload complete.');

      statusRef.current = 'complete';
      setSession(prev => ({ ...prev, status: 'complete', result: data }));
    } catch (err) {
      statusRef.current = 'error';
      pushLog('[!!] finalize request failed — network error');
      setSession(prev => ({ ...prev, status: 'error', error: 'Finalize request failed. Please try again.' }));
    }
  }, [getAuthToken, pushLog, session.sessionId]);

  const processQueue = useCallback(async () => {
    if (statusRef.current !== 'uploading') return;

    while (activeCountRef.current < MAX_CONCURRENT) {
      const next = filesRef.current.find(f => f.status === 'queued');
      if (!next) break;

      activeCountRef.current += 1;
      setActiveCount(activeCountRef.current);
      uploadFile(next).finally(() => {
        activeCountRef.current -= 1;
        setActiveCount(activeCountRef.current);
        processQueueRef.current?.();
      });
    }

    const remaining = filesRef.current.some(f =>
      f.status === 'queued' || f.status === 'hashing' || f.status === 'uploading' || f.status === 'verifying'
    );
    if (!remaining) {
      const hasErrors = filesRef.current.some(f => f.status === 'error');
      if (hasErrors) {
        statusRef.current = 'error';
        setSession(prev => ({ ...prev, status: 'error' }));
      } else {
        await finalizeSessionInternal();
      }
    }
  }, [uploadFile, finalizeSessionInternal]);

  processQueueRef.current = processQueue;

  const startUpload = useCallback(() => {
    statusRef.current = 'uploading';
    setSession(prev => ({ ...prev, status: 'uploading' }));
  }, []);

  const cancelSession = useCallback(async () => {
    const token = await getAuthToken();
    if (token) {
      try {
        await fetch(`${API_URL}/upload/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId: session.sessionId }),
        });
      } catch (err) {
        console.error('Failed to cancel session:', err);
      }
    }
    filesRef.current = [];
    statusRef.current = 'idle';
    setSession({ sessionId: crypto.randomUUID(), files: [], status: 'idle' });
    activeCountRef.current = 0;
    setActiveCount(0);
    abortControllersRef.current.clear();
    speedWindowRef.current = [];
    lastProgressRef.current.clear();
    setSpeed(0);
    setEta(0);
    setLog([]);
  }, [getAuthToken, session.sessionId]);

  const retryFile = useCallback(async (id: string) => {
    const target = filesRef.current.find(f => f.id === id);
    updateFile(id, { status: 'queued', progress: 0, error: undefined });
    if (target) pushLog(`retrying ${target.relativePath}...`);
    statusRef.current = 'uploading';
    setSession(prev => ({ ...prev, status: 'uploading' }));
  }, [pushLog, updateFile]);

  const addFiles = useCallback((incoming: FileList | null, isDirectory: boolean) => {
    if (!incoming) return;

    const newFiles: UploadFile[] = [];
    let skipped = 0;
    for (const file of Array.from(incoming)) {
      const relativePath = fileRelativePath(file, isDirectory);
      const ext = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        skipped += 1;
        continue;
      }
      newFiles.push({
        id: crypto.randomUUID(),
        file,
        relativePath,
        status: 'queued',
        progress: 0,
        size: file.size,
      });
    }

    if (newFiles.length > 0) {
      pushLog(`queued ${newFiles.length} file(s) · ${formatBytes(newFiles.reduce((s, f) => s + f.size, 0))}`);
    }
    if (skipped > 0) {
      pushLog(`skipped ${skipped} file(s) — unsupported type`);
    }

    if (newFiles.length === 0) return;

    filesRef.current = [...filesRef.current, ...newFiles];
    setSession(prev => {
      const status = prev.status === 'idle' ? 'uploading' : prev.status;
      statusRef.current = status;
      return { ...prev, status, files: [...prev.files, ...newFiles] };
    });
  }, [pushLog]);

  useEffect(() => {
    if (session.status === 'uploading') {
      processQueueRef.current?.();
    }
  }, [session.status, session.files.length]);

  const handleDirectorySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files, true);
    e.target.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files, false);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const hasDirectory = Array.from(e.dataTransfer.items).some(item => item.webkitGetAsEntry()?.isDirectory);
      addFiles(e.dataTransfer.files, hasDirectory);
    } else {
      addFiles(e.dataTransfer.files, false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const anyUploading = session.files.some(f => f.status === 'uploading' || f.status === 'queued');
  const overallMeter = asciiMeter(overallProgress, 28);
  const spinnerChar = ['|', '/', '-', '\\'][spinnerFrame];

  return (
    <div className="native-upload-container">
      {session.status === 'complete' && session.result ? (
        <div className="native-upload-results term-panel">
          <span className="term-panel-label">upload_complete.log</span>
          <Fireworks active={session.status === 'complete'} />
          <div className="native-upload-results-header">
            <span className="native-upload-spin-icon" aria-hidden="true">💿</span>
            <h2 className="native-upload-results-title">UPLOAD COMPLETE</h2>
            <span className="native-upload-spin-icon" aria-hidden="true">💿</span>
          </div>
          <div className="native-upload-results-summary">
            <span>{session.result.albums.length} album(s)</span>
            <span>{session.result.totalFiles} file(s)</span>
            <span>{formatBytes(session.result.totalSizeBytes)}</span>
          </div>

          {session.result.albums.length > 0 && (
            <div className="native-upload-albums">
              <h3>&gt; organized albums</h3>
              {session.result.albums.map((album, idx) => (
                <div key={idx} className="native-upload-album">
                  <span className="native-upload-album-badge">[ OK ]</span>
                  <div>
                    <div className="native-upload-album-name">{album.finalDirName}</div>
                    <div className="native-upload-album-meta">
                      {album.fileCount} tracks · {formatBytes(album.totalSizeBytes)}
                      {album.coverArtRenamed && ' · cover art renamed'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {session.result.rejections.length > 0 && (
            <div className="native-upload-rejections">
              <h3>&gt; rejected files</h3>
              {session.result.rejections.map((rej, idx) => (
                <div key={idx} className="native-upload-rejection">
                  <span className="native-upload-rejection-badge">[ !! ]</span>
                  <span className="native-upload-rejection-file">{rej.file}</span>
                  <span className="native-upload-rejection-reason">{rej.reason}</span>
                </div>
              ))}
            </div>
          )}

          <Button label="[ UPLOAD MORE ]" onClick={cancelSession} type="basic" className="native-upload-terminal-button" />
        </div>
      ) : (
        <>
          <div
            className={`native-upload-dropzone term-panel ${dragOver ? 'dragover' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <span className="term-panel-label">drop_zone</span>
            <div className="native-upload-dropzone-text">
              &gt; drag folders or files here<span className="native-upload-cursor">_</span>
            </div>
            <div className="native-upload-dropzone-or">— or —</div>
            <div className="native-upload-dropzone-buttons">
              <label className="native-upload-file-button">
                [ SELECT FOLDER ]
                <input
                  type="file"
                  {...{ webkitdirectory: 'true', directory: '' }}
                  onChange={handleDirectorySelect}
                  disabled={anyUploading || session.status === 'finalizing'}
                />
              </label>
              <label className="native-upload-file-button">
                [ SELECT FILES ]
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  disabled={anyUploading || session.status === 'finalizing'}
                />
              </label>
            </div>
          </div>

          <div className="native-upload-limits term-panel">
            <span className="term-panel-label">limits.cfg</span>
            <div className="native-upload-limits-grid">
              <span>formats</span>
              <span>mp3 flac wav ogg opus m4a aac wv ape aiff · jpg png</span>
              <span>max file size</span>
              <span>{formatBytes(LIMITS.maxFileSize)}</span>
              <span>max batch size</span>
              <span>{formatBytes(LIMITS.maxSessionSize)}</span>
              <span>max folders/batch</span>
              <span>{LIMITS.maxAlbumGroups}</span>
              <span>active batches/user</span>
              <span>{LIMITS.maxActiveSessions}</span>
              <span>idle session expiry</span>
              <span>{LIMITS.sessionMaxAgeMinutes} min</span>
            </div>
          </div>

          {session.files.length > 0 && (
            <div className="native-upload-file-section">
              <div className="native-upload-overall term-panel">
                <span className="term-panel-label">status.sys</span>
                <div className="native-upload-overall-meter">
                  [<span className="ascii-bar-filled">{overallMeter.filled}</span><span className="ascii-bar-empty">{overallMeter.empty}</span>] {overallProgress}%
                </div>
                <div className="native-upload-stats-grid">
                  <span>xfer</span>
                  <span>{formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}</span>
                  <span>rate</span>
                  <span>{formatBytes(speed)}/s</span>
                  <span>eta</span>
                  <span>{formatDuration(eta)}</span>
                  <span>files</span>
                  <span>
                    {counts.done} done · {activeCount} active · {counts.queued} queued
                    {counts.failed > 0 && ` · ${counts.failed} failed`}
                  </span>
                </div>

                {session.status === 'finalizing' && (
                  <div className="native-upload-finalizing">
                    <div className="native-upload-finalizing-title">
                      <span className="native-upload-spinner">{spinnerChar}</span> FINALIZING — elapsed {formatDuration(finalizeElapsed)}
                    </div>
                    <div className="native-upload-finalizing-hint">
                      Organizing albums &amp; running the metadata tagger (beets import) server-side —
                      large batches can take several minutes. Please keep this tab open.
                    </div>
                  </div>
                )}
              </div>

              <div className="native-upload-log term-panel" ref={logRef}>
                <span className="term-panel-label">console</span>
                {log.length === 0 ? (
                  <div className="native-upload-log-line native-upload-log-empty">&gt; waiting for activity_</div>
                ) : (
                  log.map((line, i) => (
                    <div key={i} className="native-upload-log-line">&gt; {line}</div>
                  ))
                )}
              </div>

              <div className="native-upload-file-list term-panel">
                <span className="term-panel-label">queue ({session.files.length})</span>
                {session.files.map(uploadFileItem => {
                  const meter = asciiMeter(uploadFileItem.progress, 14);
                  return (
                    <div key={uploadFileItem.id} className={`native-upload-file ${uploadFileItem.status}`}>
                      <div className="native-upload-file-status">{statusBadge(uploadFileItem.status)}</div>
                      <div className="native-upload-file-info">
                        <div className="native-upload-file-name" title={uploadFileItem.relativePath}>
                          {uploadFileItem.relativePath}
                        </div>
                        <div className="native-upload-file-meta">
                          {formatBytes(uploadFileItem.size)} · {statusLabel(uploadFileItem)}
                        </div>
                        <div className="native-upload-file-bar">
                          [<span className="ascii-bar-filled">{meter.filled}</span><span className="ascii-bar-empty">{meter.empty}</span>]
                        </div>
                      </div>
                      {uploadFileItem.status === 'error' && (
                        <button
                          className="native-upload-retry-button"
                          onClick={() => retryFile(uploadFileItem.id)}
                        >
                          [ retry ]
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="native-upload-actions">
                {session.status === 'idle' || (session.status === 'uploading' && session.files.every(f => f.status === 'queued')) ? (
                  <Button label="[ START UPLOAD ]" onClick={startUpload} type="basic" className="native-upload-terminal-button" />
                ) : null}

                {(session.status === 'uploading' || session.status === 'finalizing') && (
                  <Button label="[ CANCEL ]" onClick={cancelSession} type="basic" className="native-upload-terminal-button native-upload-cancel" />
                )}

                {session.status === 'error' && (
                  <Button label="[ START OVER ]" onClick={cancelSession} type="basic" className="native-upload-terminal-button" />
                )}
              </div>

              {session.error && <div className="native-upload-error">!! {session.error}</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default NativeUpload;
