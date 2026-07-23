import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import './NativeUpload.css';
import Button from './basic/Button';

type FileStatus = 'queued' | 'uploading' | 'verifying' | 'done' | 'error';

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

function statusIcon(status: FileStatus): string {
  switch (status) {
    case 'queued': return '⊘';
    case 'uploading': return '↑';
    case 'verifying': return '✓';
    case 'done': return '✓';
    case 'error': return '✗';
    default: return '⊘';
  }
}

const NativeUpload: React.FC = () => {
  const [session, setSession] = useState<UploadSession>(() => ({ sessionId: crypto.randomUUID(), files: [], status: 'idle' }));
  const [dragOver, setDragOver] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const activeCountRef = useRef(0);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const speedWindowRef = useRef<{ time: number; bytes: number }[]>([]);
  const lastProgressRef = useRef<Map<string, number>>(new Map());

  const totalBytes = useMemo(() => session.files.reduce((sum, f) => sum + f.size, 0), [session.files]);
  const uploadedBytes = useMemo(() =>
    session.files.reduce((sum, f) => {
      if (f.status === 'done' || f.status === 'verifying') return sum + f.size;
      if (f.status === 'uploading') return sum + Math.round((f.progress / 100) * f.size);
      return sum;
    }, 0),
    [session.files]
  );

  useEffect(() => {
    if (totalBytes === 0) {
      setOverallProgress(0);
      return;
    }
    setOverallProgress(Math.round((uploadedBytes / totalBytes) * 100));
  }, [uploadedBytes, totalBytes]);

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
    const token = await getAuthToken();
    if (!token) {
      setFileError(uploadFileItem.id, 'You must be logged in to upload.');
      return;
    }

    let sha256 = uploadFileItem.sha256;
    if (!sha256) {
      updateFile(uploadFileItem.id, { status: 'verifying' });
      sha256 = await computeSha256Chunked(uploadFileItem.file);
      updateFile(uploadFileItem.id, { sha256 });
    }

    updateFile(uploadFileItem.id, { status: 'uploading', progress: 0, error: undefined });

    const controller = new AbortController();
    abortControllersRef.current.set(uploadFileItem.id, controller);

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/upload/file`, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('X-File-Checksum', sha256 as string);

      xhr.upload.addEventListener('progress', event => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        updateFile(uploadFileItem.id, { progress: percent });

        const now = Date.now();
        const previous = lastProgressRef.current.get(uploadFileItem.id) || 0;
        const delta = event.loaded - previous;
        if (delta > 0) {
          speedWindowRef.current.push({ time: now, bytes: uploadedBytes + event.loaded });
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
              resolve();
            } else {
              setFileError(uploadFileItem.id, response.error || 'Upload failed.');
              reject(new Error(response.error || 'Upload failed.'));
            }
          } catch {
            setFileError(uploadFileItem.id, 'Invalid server response.');
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
          reject(new Error(message));
        }
      });

      xhr.addEventListener('error', () => {
        abortControllersRef.current.delete(uploadFileItem.id);
        setFileError(uploadFileItem.id, 'Network error. Click retry to try again.');
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
  }, [getAuthToken, session.sessionId, setFileError, updateFile, uploadedBytes]);

  const processQueue = useCallback(async () => {
    if (session.status !== 'uploading') return;

    while (activeCountRef.current < MAX_CONCURRENT) {
      const next = session.files.find(f => f.status === 'queued');
      if (!next) break;

      activeCountRef.current += 1;
      uploadFile(next).finally(() => {
        activeCountRef.current -= 1;
        processQueue();
      });
    }

    const remaining = session.files.some(f => f.status === 'queued' || f.status === 'uploading');
    if (!remaining) {
      const hasErrors = session.files.some(f => f.status === 'error');
      if (hasErrors) {
        setSession(prev => ({ ...prev, status: 'error' }));
      } else {
        await finalizeSessionInternal();
      }
    }
  }, [session.files, session.status, uploadFile]);

  const finalizeSessionInternal = useCallback(async () => {
    setSession(prev => ({ ...prev, status: 'finalizing' }));
    const token = await getAuthToken();
    if (!token) {
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
        setSession(prev => ({ ...prev, status: 'error', error: data.error || 'Finalize failed.' }));
        return;
      }

      setSession(prev => ({ ...prev, status: 'complete', result: data }));
    } catch (err) {
      setSession(prev => ({ ...prev, status: 'error', error: 'Finalize request failed. Please try again.' }));
    }
  }, [getAuthToken, session.sessionId]);

  const startUpload = useCallback(() => {
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
    setSession({ sessionId: crypto.randomUUID(), files: [], status: 'idle' });
    activeCountRef.current = 0;
    abortControllersRef.current.clear();
    speedWindowRef.current = [];
    lastProgressRef.current.clear();
    setSpeed(0);
    setEta(0);
  }, [getAuthToken, session.sessionId]);

  const retryFile = useCallback(async (id: string) => {
    updateFile(id, { status: 'queued', progress: 0, error: undefined });
    setSession(prev => ({ ...prev, status: 'uploading' }));
  }, [updateFile]);

  const addFiles = useCallback((incoming: FileList | null, isDirectory: boolean) => {
    if (!incoming) return;

    const newFiles: UploadFile[] = [];
    for (const file of Array.from(incoming)) {
      const relativePath = fileRelativePath(file, isDirectory);
      const ext = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
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

    if (newFiles.length === 0) return;

    setSession(prev => ({
      ...prev,
      status: prev.status === 'idle' ? 'uploading' : prev.status,
      files: [...prev.files, ...newFiles],
    }));
  }, []);

  useEffect(() => {
    if (session.status === 'uploading') {
      processQueue();
    }
  }, [session.status, session.files.length, processQueue]);

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

  return (
    <div className="native-upload-container">
      {session.status === 'complete' && session.result ? (
        <div className="native-upload-results">
          <h2 className="native-upload-results-title">Upload Complete</h2>
          <div className="native-upload-results-summary">
            <span>{session.result.albums.length} album(s)</span>
            <span>{session.result.totalFiles} file(s)</span>
            <span>{formatBytes(session.result.totalSizeBytes)}</span>
          </div>

          {session.result.albums.length > 0 && (
            <div className="native-upload-albums">
              <h3>Organized Albums</h3>
              {session.result.albums.map((album, idx) => (
                <div key={idx} className="native-upload-album">
                  <div className="native-upload-album-name">{album.finalDirName}</div>
                  <div className="native-upload-album-meta">
                    {album.fileCount} tracks • {formatBytes(album.totalSizeBytes)}
                    {album.coverArtRenamed && ' • cover art renamed'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {session.result.rejections.length > 0 && (
            <div className="native-upload-rejections">
              <h3>Rejected Files</h3>
              {session.result.rejections.map((rej, idx) => (
                <div key={idx} className="native-upload-rejection">
                  <span className="native-upload-rejection-file">{rej.file}</span>
                  <span className="native-upload-rejection-reason">{rej.reason}</span>
                </div>
              ))}
            </div>
          )}

          <Button label="Upload More" onClick={cancelSession} type="basic" />
        </div>
      ) : (
        <>
          <div
            className={`native-upload-dropzone ${dragOver ? 'dragover' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="native-upload-dropzone-text">
              Drag and drop folders or files here
            </div>
            <div className="native-upload-dropzone-or">or</div>
            <div className="native-upload-dropzone-buttons">
              <label className="native-upload-file-button">
                Select Folder
                <input
                  type="file"
                  {...{ webkitdirectory: 'true', directory: '' }}
                  onChange={handleDirectorySelect}
                  disabled={anyUploading || session.status === 'finalizing'}
                />
              </label>
              <label className="native-upload-file-button">
                Select Files
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  disabled={anyUploading || session.status === 'finalizing'}
                />
              </label>
            </div>
            <div className="native-upload-limits">
              Audio: MP3, FLAC, WAV, OGG, Opus, M4A, AAC, WV, APE, AIFF
              <br />
              Images: JPG, PNG
            </div>
          </div>

          {session.files.length > 0 && (
            <div className="native-upload-file-section">
              <div className="native-upload-overall">
                <div className="native-upload-overall-bar">
                  <div
                    className="native-upload-overall-progress"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
                <div className="native-upload-stats">
                  <span>{overallProgress}%</span>
                  <span>{formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}</span>
                  <span>{formatBytes(speed)}/s</span>
                  <span>ETA {formatDuration(eta)}</span>
                </div>
              </div>

              <div className="native-upload-file-list">
                {session.files.map(uploadFile => (
                  <div key={uploadFile.id} className={`native-upload-file ${uploadFile.status}`}>
                    <div className="native-upload-file-status">{statusIcon(uploadFile.status)}</div>
                    <div className="native-upload-file-info">
                      <div className="native-upload-file-name" title={uploadFile.relativePath}>
                        {uploadFile.relativePath}
                      </div>
                      <div className="native-upload-file-meta">
                        {formatBytes(uploadFile.size)} • {uploadFile.status}
                        {uploadFile.error && `: ${uploadFile.error}`}
                      </div>
                      <div className="native-upload-file-bar">
                        <div
                          className="native-upload-file-progress"
                          style={{ width: `${uploadFile.progress}%` }}
                        />
                      </div>
                    </div>
                    {uploadFile.status === 'error' && (
                      <button
                        className="native-upload-retry-button"
                        onClick={() => retryFile(uploadFile.id)}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="native-upload-actions">
                {session.status === 'idle' || (session.status === 'uploading' && session.files.every(f => f.status === 'queued')) ? (
                  <Button label="Start Upload" onClick={startUpload} type="basic" />
                ) : null}

                {(session.status === 'uploading' || session.status === 'finalizing') && (
                  <Button label="Cancel" onClick={cancelSession} type="basic" className="native-upload-cancel" />
                )}

                {session.status === 'error' && (
                  <Button label="Start Over" onClick={cancelSession} type="basic" />
                )}
              </div>

              {session.error && <div className="native-upload-error">{session.error}</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default NativeUpload;
