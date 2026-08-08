import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import './NativeUpload.css';
import Button from './basic/Button';

type FileStatus = 'queued' | 'retrying' | 'hashing' | 'uploading' | 'verifying' | 'done' | 'error';

interface UploadFile {
  id: string;
  file: File;
  relativePath: string;
  status: FileStatus;
  progress: number;
  error?: string;
  sha256?: string;
  size: number;
  attempts: number;
  // Epoch ms a 'retrying' file becomes eligible again; the backoff timer flips
  // it back to 'queued' once this passes.
  nextAttemptAt?: number;
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

interface ImportResult {
  finalDirName: string;
  status: 'imported' | 'skipped' | 'duplicate' | 'failed';
  matchedAs?: string;
  similarity?: number;
  message?: string;
  elapsedSeconds?: number;
}

interface FinalizeResult {
  albums: AlbumResult[];
  rejections: Rejection[];
  imports?: ImportResult[];
  totalFiles: number;
  totalSizeBytes: number;
}

type SessionStatus = 'idle' | 'uploading' | 'incomplete' | 'finalizing' | 'complete' | 'error';

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
// Without this the OS picker greys out audio files it doesn't consider
// "documents"; listing the extensions explicitly makes every accepted type
// selectable.
const ACCEPT_ATTRIBUTE = [...ALLOWED_EXTENSIONS].join(',');
const MAX_CONCURRENT = 3;

// Resilience tuning. A flaky connection shows up as either an outright network
// error or a socket that quietly stops moving bytes, so both are treated as
// transient and retried with jittered exponential backoff.
const MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 1500;
const RETRY_MAX_MS = 30000;
const RATE_LIMIT_BACKOFF_MS = 30000;
// No upload progress for this long means the socket has stalled — abort and retry
// rather than holding a concurrency slot open indefinitely.
const STALL_TIMEOUT_MS = 45000;
// Once the body is sent there are no more progress events while the server hashes
// and stores the file, so the watchdog switches to this longer budget.
const RESPONSE_TIMEOUT_MS = 180000;

// Transient conditions worth another attempt. Validation failures (wrong type,
// too large, bad path) will fail identically every time, so they stop here.
function isRetryable(httpStatus: number | null, message: string): boolean {
  if (httpStatus === null) return true; // network error, stall or abort
  if (httpStatus === 401) return true; // ID token may have expired mid-batch
  if (httpStatus === 429) return true;
  if (httpStatus >= 500) return true;
  // A checksum mismatch means the bytes arrived corrupted — resending can fix it.
  if (httpStatus === 400 && /checksum/i.test(message)) return true;
  return false;
}

function backoffDelay(attempt: number, httpStatus: number | null): number {
  const base = httpStatus === 429
    ? RATE_LIMIT_BACKOFF_MS
    : Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
  // Jitter so a batch that fails together doesn't retry in lockstep.
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

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

interface PickedFile {
  file: File;
  relativePath: string;
}

function fileRelativePath(file: File): string {
  const webkit = (file as unknown as { webkitRelativePath?: string }).webkitRelativePath;
  return webkit || file.name;
}

// A dropped folder shows up in dataTransfer.files as a single entry with no
// contents, so the FileSystemEntry tree has to be walked to reach the tracks
// inside it and to keep each file's path relative to its album folder.
async function collectEntry(entry: FileSystemEntry, prefix: string, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject)
    );
    out.push({ file, relativePath: prefix ? `${prefix}/${file.name}` : file.name });
    return;
  }
  if (!entry.isDirectory) return;

  const dirPath = prefix ? `${prefix}/${entry.name}` : entry.name;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries hands back at most 100 children per call and signals the end
  // of the directory with an empty batch.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    if (batch.length === 0) break;
    for (const child of batch) await collectEntry(child, dirPath, out);
  }
}

function statusBadge(status: FileStatus): string {
  switch (status) {
    case 'queued': return '[ .. ]';
    case 'retrying': return '[WAIT]';
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
    case 'retrying': {
      const wait = Math.max(0, Math.ceil(((f.nextAttemptAt || 0) - Date.now()) / 1000));
      return `${f.error || 'failed'} — retry ${f.attempts + 1}/${MAX_ATTEMPTS} in ${wait}s`;
    }
    case 'hashing': return 'computing checksum...';
    case 'uploading': return f.attempts > 0 ? `sending (attempt ${f.attempts + 1}) — ${f.progress}%` : `sending — ${f.progress}%`;
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

function importBadge(status: ImportResult['status']): string {
  switch (status) {
    case 'imported': return '[ OK ]';
    case 'duplicate': return '[DUPE]';
    case 'skipped': return '[SKIP]';
    default: return '[ !! ]';
  }
}

function importSummary(imp: ImportResult): string {
  const bits: string[] = [];
  if (imp.status === 'imported') {
    bits.push(imp.matchedAs ? `matched as ${imp.matchedAs}` : 'added to the library');
    if (typeof imp.similarity === 'number') bits.push(`${imp.similarity.toFixed(1)}% match`);
  } else if (imp.status === 'duplicate') {
    bits.push('already in the library — left for a moderator to merge');
  } else if (imp.status === 'skipped') {
    bits.push(imp.message || 'no confident metadata match — left for manual tagging');
  } else {
    bits.push(imp.message || 'import failed');
  }
  if (imp.elapsedSeconds) bits.push(`${imp.elapsedSeconds}s`);
  return bits.join(' · ');
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
  const [notice, setNotice] = useState<string | null>(null);
  const [overallProgress, setOverallProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [finalizeElapsed, setFinalizeElapsed] = useState(0);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [canRetryFinalize, setCanRetryFinalize] = useState(false);
  // Drives the per-file retry countdown so it ticks down while waiting.
  const [, setRetryTick] = useState(0);
  const offlineRef = useRef(offline);
  // Distinguishes an abort the user asked for from one the stall watchdog fired.
  const cancelledRef = useRef(false);
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

  const folderCount = useMemo(() => {
    const groups = new Set<string>();
    for (const f of session.files) {
      const slash = f.relativePath.indexOf('/');
      groups.add(slash === -1 ? '.' : f.relativePath.slice(0, slash));
    }
    return groups.size;
  }, [session.files]);

  const counts = useMemo(() => {
    let queued = 0;
    let active = 0;
    let done = 0;
    let failed = 0;
    let retrying = 0;
    for (const f of session.files) {
      if (f.status === 'queued') queued += 1;
      else if (f.status === 'retrying') retrying += 1;
      else if (f.status === 'done') done += 1;
      else if (f.status === 'error') failed += 1;
      else active += 1;
    }
    return { queued, active, done, failed, retrying };
  }, [session.files]);

  const hasRetrying = counts.retrying > 0;

  // Which folders came up short, so the user can see exactly which albums would
  // be incomplete before deciding to finalize anyway.
  const failureReport = useMemo(() => {
    const byFolder = new Map<string, { total: number; done: number; failed: number }>();
    for (const f of session.files) {
      const slash = f.relativePath.indexOf('/');
      const folder = slash === -1 ? '(loose files)' : f.relativePath.slice(0, slash);
      const entry = byFolder.get(folder) || { total: 0, done: 0, failed: 0 };
      entry.total += 1;
      if (f.status === 'done') entry.done += 1;
      else entry.failed += 1;
      byFolder.set(folder, entry);
    }
    const incomplete = [...byFolder.entries()]
      .filter(([, v]) => v.failed > 0)
      .map(([name, v]) => ({ name, ...v }));
    return { incomplete, failedCount: counts.failed, totalCount: session.files.length };
  }, [session.files, counts.failed]);

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
    if (session.status !== 'uploading' && session.status !== 'finalizing' && session.status !== 'incomplete') {
      return undefined;
    }
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Uploads are in progress, are you sure you want to leave?';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [session.status]);

  const updateFile = useCallback((id: string, patch: Partial<UploadFile>) => {
    filesRef.current = filesRef.current.map(f => (f.id === id ? { ...f, ...patch } : f));
    setSession(prev => ({
      ...prev,
      files: prev.files.map(f => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }, []);

  // Central failure path: decide whether this attempt is worth repeating and
  // either schedule a backoff or mark the file permanently failed.
  const handleFailure = useCallback((item: UploadFile, message: string, httpStatus: number | null) => {
    const attempts = (filesRef.current.find(f => f.id === item.id)?.attempts ?? item.attempts) + 1;
    const retryable = isRetryable(httpStatus, message);

    if (retryable && attempts < MAX_ATTEMPTS) {
      const delay = backoffDelay(attempts, httpStatus);
      updateFile(item.id, {
        status: 'retrying',
        attempts,
        nextAttemptAt: Date.now() + delay,
        progress: 0,
        error: message,
      });
      pushLog(`[retry] ${item.relativePath} — ${message} · attempt ${attempts + 1}/${MAX_ATTEMPTS} in ${Math.round(delay / 1000)}s`);
      return;
    }

    const suffix = retryable ? ` (gave up after ${attempts} attempts)` : '';
    updateFile(item.id, { status: 'error', attempts, progress: 0, error: `${message}${suffix}`, nextAttemptAt: undefined });
    pushLog(`[!!] ${item.relativePath} — ${message}${suffix}`);
  }, [pushLog, updateFile]);

  const getAuthToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken(forceRefresh);
  }, []);

  const uploadFile = useCallback(async (uploadFileItem: UploadFile): Promise<void> => {
    // Immediately claim this file so processQueue doesn't re-pick it while we work.
    updateFile(uploadFileItem.id, { status: 'hashing', progress: 0, error: undefined, nextAttemptAt: undefined });

    // On a retry the previous token may be why we failed, so force a refresh.
    const token = await getAuthToken(uploadFileItem.attempts > 0);
    if (!token) {
      handleFailure(uploadFileItem, 'You must be logged in to upload.', 403);
      return;
    }

    let sha256 = uploadFileItem.sha256;
    if (!sha256) {
      try {
        sha256 = await computeSha256Chunked(uploadFileItem.file);
      } catch {
        handleFailure(uploadFileItem, 'Could not read this file from disk — has it been moved or renamed?', 400);
        return;
      }
      updateFile(uploadFileItem.id, { sha256 });
    }

    updateFile(uploadFileItem.id, { status: 'uploading', progress: 0 });
    lastProgressRef.current.delete(uploadFileItem.id);
    pushLog(`[xfer] ${uploadFileItem.relativePath} · ${formatBytes(uploadFileItem.size)}`);

    const controller = new AbortController();
    abortControllersRef.current.set(uploadFileItem.id, controller);

    // Always resolves — handleFailure owns the outcome, and the queue only needs
    // to know the concurrency slot is free again.
    return new Promise<void>(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/upload/file`, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('X-File-Checksum', sha256 as string);

      let verifyingAnnounced = false;
      let stalled = false;
      let watchdog: number | undefined;

      // A dropped wifi link often leaves the socket open but silent, so progress
      // events stopping is the only signal that the transfer has died.
      const armWatchdog = (ms: number) => {
        if (watchdog !== undefined) clearTimeout(watchdog);
        watchdog = window.setTimeout(() => {
          stalled = true;
          try { xhr.abort(); } catch { /* already settled */ }
        }, ms);
      };

      const finish = () => {
        if (watchdog !== undefined) clearTimeout(watchdog);
        abortControllersRef.current.delete(uploadFileItem.id);
        resolve();
      };

      xhr.upload.addEventListener('progress', event => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);

        if (percent >= 100) {
          armWatchdog(RESPONSE_TIMEOUT_MS);
          if (!verifyingAnnounced) {
            verifyingAnnounced = true;
            pushLog(`[sync] ${uploadFileItem.relativePath} verifying on server...`);
          }
          updateFile(uploadFileItem.id, { status: 'verifying', progress: 100 });
        } else {
          armWatchdog(STALL_TIMEOUT_MS);
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
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success) {
              updateFile(uploadFileItem.id, {
                status: 'done',
                progress: 100,
                error: undefined,
                sha256: response.file?.sha256 || sha256,
              });
              pushLog(`[ok] ${uploadFileItem.relativePath}`);
            } else {
              handleFailure(uploadFileItem, response.error || 'Upload failed.', xhr.status);
            }
          } catch {
            handleFailure(uploadFileItem, 'Invalid server response.', xhr.status);
          }
        } else {
          let message = 'Upload failed.';
          try {
            const response = JSON.parse(xhr.responseText);
            message = response.error || message;
          } catch {
            // Non-JSON body (e.g. a proxy error page) — keep the generic message.
          }
          handleFailure(uploadFileItem, message, xhr.status);
        }
        finish();
      });

      xhr.addEventListener('error', () => {
        handleFailure(uploadFileItem, 'Connection dropped.', null);
        finish();
      });

      xhr.addEventListener('abort', () => {
        if (cancelledRef.current) {
          updateFile(uploadFileItem.id, { status: 'queued', progress: 0, error: undefined });
        } else {
          handleFailure(uploadFileItem, stalled ? 'Connection stalled.' : 'Upload interrupted.', null);
        }
        finish();
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
      armWatchdog(STALL_TIMEOUT_MS);
      xhr.send(formData);
    });
  }, [getAuthToken, handleFailure, pushLog, session.sessionId, updateFile]);

  const finalizeSessionInternal = useCallback(async () => {
    if (statusRef.current === 'finalizing' || statusRef.current === 'complete') return;
    statusRef.current = 'finalizing';
    setCanRetryFinalize(false);
    setSession(prev => ({ ...prev, status: 'finalizing', error: undefined }));
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
        // Server-side faults are worth another go; a rejected session is not.
        setCanRetryFinalize(response.status >= 500 || response.status === 429);
        setSession(prev => ({ ...prev, status: 'error', error: data.error || 'Finalize failed.' }));
        return;
      }

      (data.albums || []).forEach((album: AlbumResult) => {
        pushLog(`[ok] ${album.finalDirName} — ${album.fileCount} tracks, ${formatBytes(album.totalSizeBytes)}`);
      });
      (data.rejections || []).forEach((rej: Rejection) => {
        pushLog(`[!!] ${rej.file} — ${rej.reason}`);
      });
      (data.imports || []).forEach((imp: ImportResult) => {
        pushLog(`${importBadge(imp.status)} ${imp.finalDirName} — ${importSummary(imp)}`);
      });
      pushLog('upload complete.');

      statusRef.current = 'complete';
      setSession(prev => ({ ...prev, status: 'complete', result: data }));
    } catch {
      // The staged files are still on the server, so this is recoverable — don't
      // push the user towards starting over and losing the whole transfer.
      statusRef.current = 'error';
      pushLog('[!!] finalize request failed — connection lost');
      setCanRetryFinalize(true);
      setSession(prev => ({
        ...prev,
        status: 'error',
        error: 'Lost the connection while finalizing. Your files are still on the server — retry to finish the job.',
      }));
    }
  }, [getAuthToken, pushLog, session.sessionId]);

  const processQueue = useCallback(async () => {
    if (statusRef.current !== 'uploading') return;

    // While the browser reports no connection, leave files queued rather than
    // burning retry attempts on requests that cannot succeed.
    if (!offlineRef.current) {
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
    }

    const remaining = filesRef.current.some(f =>
      f.status === 'queued' || f.status === 'retrying' || f.status === 'hashing'
      || f.status === 'uploading' || f.status === 'verifying'
    );
    if (!remaining) {
      const hasErrors = filesRef.current.some(f => f.status === 'error');
      if (hasErrors) {
        // Never finalize silently past a failure — an album missing tracks has to
        // be the user's explicit choice.
        statusRef.current = 'incomplete';
        setSession(prev => ({ ...prev, status: 'incomplete' }));
        pushLog('[!!] transfer finished with failures — awaiting your decision');
      } else {
        await finalizeSessionInternal();
      }
    }
  }, [uploadFile, finalizeSessionInternal, pushLog]);

  processQueueRef.current = processQueue;

  const startUpload = useCallback(() => {
    setNotice(null);
    statusRef.current = 'uploading';
    setSession(prev => ({ ...prev, status: 'uploading' }));
  }, []);

  const cancelSession = useCallback(async () => {
    // Abort in-flight requests first, otherwise they keep streaming into a
    // session directory nothing will ever finalize.
    cancelledRef.current = true;
    for (const controller of Array.from(abortControllersRef.current.values())) {
      controller.abort();
    }
    cancelledRef.current = false;

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
    setNotice(null);
  }, [getAuthToken, session.sessionId]);

  const retryFile = useCallback((id: string) => {
    const target = filesRef.current.find(f => f.id === id);
    updateFile(id, { status: 'queued', progress: 0, error: undefined, attempts: 0, nextAttemptAt: undefined });
    if (target) pushLog(`retrying ${target.relativePath}...`);
    statusRef.current = 'uploading';
    setSession(prev => ({ ...prev, status: 'uploading' }));
    processQueueRef.current?.();
  }, [pushLog, updateFile]);

  const retryFailed = useCallback(() => {
    const failed = filesRef.current.filter(f => f.status === 'error');
    if (failed.length === 0) return;
    for (const f of failed) {
      updateFile(f.id, { status: 'queued', progress: 0, error: undefined, attempts: 0, nextAttemptAt: undefined });
    }
    pushLog(`retrying ${failed.length} failed file(s)...`);
    statusRef.current = 'uploading';
    setSession(prev => ({ ...prev, status: 'uploading' }));
    processQueueRef.current?.();
  }, [pushLog, updateFile]);

  const finalizeAnyway = useCallback(() => {
    pushLog('proceeding to finalize with missing files — albums may be incomplete');
    finalizeSessionInternal();
  }, [finalizeSessionInternal, pushLog]);

  const addPicked = useCallback((picked: PickedFile[]) => {
    const seen = new Set(filesRef.current.map(f => f.relativePath));
    const newFiles: UploadFile[] = [];
    let skipped = 0;
    let duplicates = 0;

    for (const { file, relativePath } of picked) {
      const ext = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        skipped += 1;
        continue;
      }
      if (seen.has(relativePath)) {
        duplicates += 1;
        continue;
      }
      seen.add(relativePath);
      newFiles.push({
        id: crypto.randomUUID(),
        file,
        relativePath,
        status: 'queued',
        progress: 0,
        size: file.size,
        attempts: 0,
      });
    }

    const parts: string[] = [];
    if (newFiles.length > 0) {
      parts.push(`added ${newFiles.length} file(s) · ${formatBytes(newFiles.reduce((s, f) => s + f.size, 0))}`);
    }
    if (skipped > 0) parts.push(`skipped ${skipped} unsupported`);
    if (duplicates > 0) parts.push(`skipped ${duplicates} already queued`);
    if (picked.length === 0) parts.push('nothing to add — no readable files in that drop');
    const summary = parts.join(' · ');
    setNotice(summary || null);
    if (summary) pushLog(summary);

    if (newFiles.length === 0) return;

    // Pickers hand files back in filesystem order, which scatters tracks across
    // the manifest grid; sorting each batch keeps albums and track numbers together.
    newFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }));

    filesRef.current = [...filesRef.current, ...newFiles];
    setSession(prev => ({ ...prev, files: [...prev.files, ...newFiles] }));
  }, [pushLog]);

  useEffect(() => {
    if (session.status === 'uploading') {
      processQueueRef.current?.();
    }
  }, [session.status, session.files.length]);

  // Releases files whose backoff has elapsed, and keeps the countdown ticking.
  useEffect(() => {
    if (!hasRetrying) return undefined;
    const t = setInterval(() => {
      const now = Date.now();
      const due = filesRef.current.filter(f => f.status === 'retrying' && (f.nextAttemptAt || 0) <= now);
      for (const f of due) {
        updateFile(f.id, { status: 'queued', nextAttemptAt: undefined });
      }
      setRetryTick(n => n + 1);
      if (due.length > 0) processQueueRef.current?.();
    }, 500);
    return () => clearInterval(t);
  }, [hasRetrying, updateFile]);

  useEffect(() => {
    const goOnline = () => {
      offlineRef.current = false;
      setOffline(false);
      pushLog('connection restored — resuming transfers');
      processQueueRef.current?.();
    };
    const goOffline = () => {
      offlineRef.current = true;
      setOffline(true);
      pushLog('connection lost — transfers paused, will resume automatically');
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [pushLog]);

  const handleInputSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addPicked(Array.from(e.target.files || []).map(file => ({ file, relativePath: fileRelativePath(file) })));
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    // webkitGetAsEntry has to be called before the handler yields — the item
    // list is emptied as soon as the drop event finishes dispatching.
    const entries = Array.from(e.dataTransfer.items || [])
      .filter(item => item.kind === 'file')
      .map(item => item.webkitGetAsEntry())
      .filter((entry): entry is FileSystemEntry => Boolean(entry));

    if (entries.length === 0) {
      addPicked(Array.from(e.dataTransfer.files).map(file => ({ file, relativePath: file.name })));
      return;
    }

    const picked: PickedFile[] = [];
    for (const entry of entries) {
      await collectEntry(entry, '', picked);
    }
    addPicked(picked);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
  };

  const reviewing = session.status === 'idle';
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

          {session.result.imports && session.result.imports.length > 0 && (
            <div className="native-upload-imports">
              <h3>&gt; library import (beets)</h3>
              {session.result.imports.some(i => i.status !== 'imported') && (
                <p className="native-upload-import-warning">
                  Not everything was added to the library automatically. Anything below that
                  isn&apos;t [ OK ] is sitting in the uploads folder waiting for a moderator.
                </p>
              )}
              {session.result.imports.map((imp, idx) => (
                <div key={idx} className={`native-upload-import ${imp.status}`}>
                  <span className="native-upload-import-badge">{importBadge(imp.status)}</span>
                  <div>
                    <div className="native-upload-import-name">{imp.finalDirName}</div>
                    <div className="native-upload-import-meta">{importSummary(imp)}</div>
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
          {session.files.length > 0 && (
            <div className="native-upload-manifest term-panel">
              <span className="term-panel-label">
                {reviewing ? `manifest — review before upload` : `transfer (${counts.done}/${session.files.length})`}
              </span>

              {reviewing ? (
                <div className="native-upload-manifest-head">
                  <div className="native-upload-manifest-summary">
                    <span><strong>{session.files.length}</strong> files</span>
                    <span><strong>{folderCount}</strong> folder(s)</span>
                    <span><strong>{formatBytes(totalBytes)}</strong> total</span>
                  </div>
                  <div className="native-upload-manifest-actions">
                    <Button label="[ CONFIRM &amp; UPLOAD ]" onClick={startUpload} type="basic" className="native-upload-terminal-button" />
                    <Button label="[ CLEAR ]" onClick={cancelSession} type="basic" className="native-upload-terminal-button native-upload-cancel" />
                  </div>
                </div>
              ) : (
                <div className="native-upload-manifest-head">
                  <div className="native-upload-overall-meter">
                    [<span className="ascii-bar-filled">{overallMeter.filled}</span><span className="ascii-bar-empty">{overallMeter.empty}</span>] {overallProgress}%
                  </div>
                  <div className="native-upload-stats-inline">
                    <span>xfer <strong>{formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}</strong></span>
                    <span>rate <strong>{formatBytes(speed)}/s</strong></span>
                    <span>eta <strong>{formatDuration(eta)}</strong></span>
                    <span>
                      files <strong>{counts.done} done · {activeCount} active · {counts.queued} queued
                      {counts.retrying > 0 && ` · ${counts.retrying} retrying`}
                      {counts.failed > 0 && ` · ${counts.failed} failed`}</strong>
                    </span>
                  </div>
                </div>
              )}

              {offline && (
                <div className="native-upload-offline">
                  !! no connection — transfers paused, they will resume by themselves
                </div>
              )}

              <div className="native-upload-grid">
                {session.files.map(item => {
                  const slash = item.relativePath.lastIndexOf('/');
                  const dir = slash === -1 ? '' : item.relativePath.slice(0, slash + 1);
                  const base = slash === -1 ? item.relativePath : item.relativePath.slice(slash + 1);
                  return (
                    <div
                      key={item.id}
                      className={`native-upload-cell ${item.status}`}
                      title={`${item.relativePath} — ${statusLabel(item)}`}
                    >
                      <span className="native-upload-cell-badge">{statusBadge(item.status)}</span>
                      <span className="native-upload-cell-name">
                        {dir && <span className="native-upload-cell-dir">{dir}</span>}
                        <span className="native-upload-cell-base">{base}</span>
                      </span>
                      <span className="native-upload-cell-size">{formatBytes(item.size)}</span>
                      {item.status === 'error' && (
                        <button className="native-upload-cell-retry" onClick={() => retryFile(item.id)} title={item.error}>
                          ↻
                        </button>
                      )}
                      <span className="native-upload-cell-fill" style={{ width: `${item.progress}%` }} />
                    </div>
                  );
                })}
              </div>

              {session.status === 'incomplete' && (
                <div className="native-upload-gate">
                  <div className="native-upload-gate-title">
                    !! {failureReport.failedCount} of {failureReport.totalCount} file(s) did not upload
                  </div>
                  <p className="native-upload-gate-warning">
                    These folders are missing tracks. Incomplete albums usually fail to match
                    during metadata processing, so they land in the library wrong — or not at all.
                  </p>
                  <div className="native-upload-gate-folders">
                    {failureReport.incomplete.map(folder => (
                      <div key={folder.name} className="native-upload-gate-folder">
                        <span className="native-upload-gate-folder-name">{folder.name}</span>
                        <span className="native-upload-gate-folder-count">
                          {folder.done} of {folder.total} uploaded · {folder.failed} missing
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="native-upload-gate-hint">
                    Retrying only re-sends the missing files — nothing already uploaded is repeated.
                  </p>
                  <div className="native-upload-gate-actions">
                    <Button label="[ RETRY MISSING FILES ]" onClick={retryFailed} type="basic" className="native-upload-terminal-button" />
                    <Button label="[ FINALIZE ANYWAY ]" onClick={finalizeAnyway} type="basic" className="native-upload-terminal-button native-upload-cancel" />
                    <Button label="[ CANCEL ]" onClick={cancelSession} type="basic" className="native-upload-terminal-button native-upload-cancel" />
                  </div>
                </div>
              )}

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

              {(session.status === 'uploading' || session.status === 'finalizing' || session.status === 'error') && (
                <div className="native-upload-actions">
                  {session.status === 'error' ? (
                    <>
                      {canRetryFinalize && (
                        <Button label="[ RETRY FINALIZE ]" onClick={finalizeSessionInternal} type="basic" className="native-upload-terminal-button" />
                      )}
                      <Button label="[ START OVER ]" onClick={cancelSession} type="basic" className="native-upload-terminal-button native-upload-cancel" />
                    </>
                  ) : (
                    <Button label="[ CANCEL ]" onClick={cancelSession} type="basic" className="native-upload-terminal-button native-upload-cancel" />
                  )}
                </div>
              )}

              {session.error && <div className="native-upload-error">!! {session.error}</div>}
            </div>
          )}

          {reviewing && (
            <div
              className={`native-upload-dropzone term-panel ${dragOver ? 'dragover' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <span className="term-panel-label">drop_zone</span>
              <div className="native-upload-dropzone-text">
                &gt; drag {session.files.length > 0 ? 'more ' : ''}folders or files here<span className="native-upload-cursor">_</span>
              </div>
              <div className="native-upload-dropzone-or">— or —</div>
              <div className="native-upload-dropzone-buttons">
                <label className="native-upload-file-button">
                  [ SELECT FOLDERS ]
                  <input
                    type="file"
                    multiple
                    {...{ webkitdirectory: 'true', directory: '' }}
                    onChange={handleInputSelect}
                  />
                </label>
                <label className="native-upload-file-button">
                  [ SELECT FILES ]
                  <input
                    type="file"
                    multiple
                    accept={ACCEPT_ATTRIBUTE}
                    onChange={handleInputSelect}
                  />
                </label>
              </div>
              <div className="native-upload-dropzone-hint">
                folder picker greys out individual files — use [ SELECT FILES ] for loose tracks
              </div>
              {notice && <div className="native-upload-notice">&gt; {notice}</div>}
            </div>
          )}

          {reviewing && (
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
          )}

          {!reviewing && (
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
          )}
        </>
      )}
    </div>
  );
};

export default NativeUpload;
