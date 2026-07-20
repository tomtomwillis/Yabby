import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import Button from '../basic/Button';
import { fetchSubsonicJson, createSubsonicAuth } from '../../utils/navidrome';
import type { SubsonicAuth } from '../../utils/navidrome';
import { getCurrentSeason } from '../../utils/seasons';
import type { Sticker, FirestoreTimestamp } from '../../types/firestore';
import './PlaylistManager.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Job {
  key: string;
  label: string;
  dateRange?: { start: Date; end: Date };
}

type Stage = 'idle' | 'needsCredentials' | 'previewing' | 'running' | 'done' | 'error';

interface SongEntry {
  trackId: string;
  title: string;
  timestampMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestampToMs(ts: FirestoreTimestamp): number {
  return ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1e6);
}

async function fetchFavouriteSongs(dateRange?: { start: Date; end: Date }): Promise<SongEntry[]> {
  const snap = await getDocs(collection(db, 'stickers'));
  const entries: SongEntry[] = [];

  snap.forEach(docSnap => {
    const data = docSnap.data() as Sticker;
    if (!data.favoriteTrackId) return;
    const ms = timestampToMs(data.timestamp);
    if (dateRange && (ms < dateRange.start.getTime() || ms >= dateRange.end.getTime())) return;
    entries.push({
      trackId: data.favoriteTrackId,
      title: data.favoriteTrackTitle || data.favoriteTrackId,
      timestampMs: ms,
    });
  });

  entries.sort((a, b) => b.timestampMs - a.timestampMs);

  const seen = new Set<string>();
  const deduped: SongEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.trackId)) continue;
    seen.add(entry.trackId);
    deduped.push(entry);
  }
  return deduped;
}

function todayDescription(): string {
  return `Updated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PlaylistManager: React.FC = () => {
  const season = useMemo(() => getCurrentSeason(), []);
  const jobs: Job[] = useMemo(() => [
    { key: 'all', label: '⚛️ Songs from Stickers - All' },
    {
      key: 'season',
      label: `⚛️ Songs from Stickers - ${season.name} ${season.year}`,
      dateRange: { start: season.start, end: season.end },
    },
  ], [season]);

  const [stage, setStage] = useState<Stage>('idle');
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [pendingJob, setPendingJob] = useState<Job | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [previewSongs, setPreviewSongs] = useState<SongEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logLines]);

  const log = (line: string) => setLogLines(prev => [...prev, line]);

  const preview = async (job: Job) => {
    log(`Looking up songs for "${job.label}"...`);
    try {
      const songs = await fetchFavouriteSongs(job.dateRange);
      setPreviewSongs(songs);
      log(`${songs.length} song${songs.length === 1 ? '' : 's'} will be added.`);
      songs.slice(0, 5).forEach(s => log(`  - ${s.title}`));
      if (songs.length > 5) log(`  ...and ${songs.length - 5} more.`);
      log('Proceed? (y/n)');
      setStage('previewing');
    } catch (err) {
      log(`Error fetching stickers: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setStage('error');
    }
  };

  const startJob = async (job: Job) => {
    setActiveJob(job);
    setLogLines([]);
    setPreviewSongs([]);
    if (!credentials) {
      setPendingJob(job);
      setStage('needsCredentials');
      return;
    }
    await preview(job);
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    const creds = { username, password };
    setCredentials(creds);
    setPassword('');
    const job = pendingJob;
    setPendingJob(null);
    if (job) await preview(job);
  };

  const handleCancel = () => {
    log('Cancelled.');
    setStage('idle');
    setActiveJob(null);
  };

  const handleConfirm = async () => {
    if (!activeJob || !credentials) return;
    setStage('running');
    const auth: SubsonicAuth = createSubsonicAuth(credentials.username, credentials.password);

    try {
      log(`Connecting to Navidrome as ${credentials.username}...`);
      const listResult = await fetchSubsonicJson('getPlaylists', {}, auth);
      const existing = (listResult.playlists?.playlist || []).find(
        (p: { name: string; id: string }) => p.name === activeJob.label
      );

      if (existing) {
        log(`Found existing playlist (id=${existing.id}). Deleting...`);
        await fetchSubsonicJson('deletePlaylist', { id: existing.id }, auth);
        log('Deleted existing playlist.');
      } else {
        log('No existing playlist found. Will create new.');
      }

      log(`Creating playlist with ${previewSongs.length} songs...`);
      const createResult = await fetchSubsonicJson('createPlaylist', {
        name: activeJob.label,
        songId: previewSongs.map(s => s.trackId),
      }, auth);
      const newId = createResult.playlist?.id;

      if (newId) {
        log('Setting description...');
        await fetchSubsonicJson('updatePlaylist', {
          playlistId: newId,
          comment: todayDescription(),
          public: 'true',
        }, auth);
      }

      log(`Done — playlist updated with ${previewSongs.length} songs.`);
      setStage('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log(`Error: ${message}`);
      setStage('error');
      if (/auth|credential|wrong username|password/i.test(message)) {
        setCredentials(null);
      }
    }
  };

  const handleReset = () => {
    setStage('idle');
    setActiveJob(null);
    setLogLines([]);
    setPreviewSongs([]);
  };

  return (
    <div className="mm-tool">
      <div className="mm-window" role="region" aria-label="Playlist manager">
        <div className="mm-titlebar">
          <span className="mm-titlebar-icon" aria-hidden="true">⚛️</span>
          <span className="mm-titlebar-title">Playlists v1.0</span>
          <span className="mm-titlebar-controls" aria-hidden="true">
            <span className="mm-titlebar-btn">_</span>
            <span className="mm-titlebar-btn">▢</span>
            <span className="mm-titlebar-btn">×</span>
          </span>
        </div>

        <div className="mm-chrome">
          <div className="playlist-layout">
            <div className="playlist-jobs">
              {jobs.map(job => (
                <button
                  key={job.key}
                  type="button"
                  className="playlist-job-btn"
                  disabled={stage === 'running'}
                  onClick={() => startJob(job)}
                >
                  {job.label}
                </button>
              ))}
            </div>

            <div className="playlist-terminal">
              <div className="playlist-log" ref={logRef}>
                {logLines.length === 0 && (
                  <p className="playlist-log-empty">Pick a playlist to update.</p>
                )}
                {logLines.map((line, idx) => (
                  <p key={idx} className="playlist-log-line">{line}</p>
                ))}
              </div>

              {stage === 'needsCredentials' && (
                <form className="playlist-creds-form" onSubmit={handleCredentialsSubmit}>
                  <label className="mm-label" htmlFor="playlist-username">Your Navidrome username</label>
                  <input
                    id="playlist-username"
                    type="text"
                    className="mm-input"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                  <label className="mm-label" htmlFor="playlist-password">Your Navidrome password</label>
                  <input
                    id="playlist-password"
                    type="password"
                    className="mm-input"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <div className="mm-actions">
                    <span className="mm-btn-primary">
                      <Button type="basic" htmlType="submit" label="Continue" />
                    </span>
                    <Button type="basic" label="Cancel" onClick={handleReset} />
                  </div>
                </form>
              )}

              {stage === 'previewing' && (
                <div className="playlist-prompt-bar">
                  <Button type="basic" label="y — Proceed" onClick={handleConfirm} />
                  <Button type="basic" label="n — Cancel" onClick={handleCancel} />
                </div>
              )}

              {(stage === 'done' || stage === 'error') && (
                <div className="mm-actions">
                  <Button type="basic" label="Back to Playlists" onClick={handleReset} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mm-statusbar" aria-hidden="true">
          <span className="mm-statusbar-section mm-statusbar-section--grow">
            <span className="mm-statusbar-blip" />
            {activeJob ? activeJob.label : 'Ready'}
          </span>
          <span className="mm-statusbar-section">
            ⚛️ Playlists ⚛️
          </span>
        </div>
      </div>
    </div>
  );
};

export default PlaylistManager;
