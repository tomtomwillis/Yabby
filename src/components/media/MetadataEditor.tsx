import React, { useMemo, useState } from 'react';
import AlbumSearchBox from '../basic/AlbumSearchBox';
import Button from '../basic/Button';
import { auth } from '../../firebaseConfig';
import ArtistCreditEditor, { DEFAULT_JOIN_PHRASE } from './ArtistCreditEditor';
import type { ArtistCredit } from './ArtistCreditEditor';
import './MetadataEditor.css';

const MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL || '/api/media';

type Stage = 'search' | 'loading' | 'editing' | 'confirming' | 'applying' | 'success' | 'error';

interface PreviewTrack {
  path: string;
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  subsonicId?: string;
  duration?: number;
  track?: number;
  readError?: string;
}

interface PreviewResponse {
  albumDir: string;
  albumName: string;
  artistName: string;
  tracks: PreviewTrack[];
}

interface DraftTrack {
  path: string;
  origTitle: string;
  origArtistString: string;
  origAlbumArtistString: string;
  origAlbum: string;
  title: string;
  artists: ArtistCredit[];
  duration?: number;
  trackNumber?: number;
}

interface ApplyResultRow {
  path: string;
  before: { title: string; artist: string; albumArtist: string; album: string };
  after: { title: string; artist: string; albumArtist: string; album: string };
  changed: string[];
}

interface ApplyResponse {
  editSessionId: string;
  albumDir: string;
  results: ApplyResultRow[];
  beetsUpdate: 'ok' | 'warning' | 'skipped';
}

function parseArtistString(s: string): ArtistCredit[] {
  const trimmed = (s || '').trim();
  if (!trimmed) return [{ name: '', joinPhrase: DEFAULT_JOIN_PHRASE }];
  return [{ name: trimmed, joinPhrase: DEFAULT_JOIN_PHRASE }];
}

function joinCredits(credits: ArtistCredit[]): string {
  let out = '';
  for (let i = 0; i < credits.length; i++) {
    out += credits[i].name;
    if (i < credits.length - 1) out += credits[i].joinPhrase;
  }
  return out;
}

function getAuthHeader(): Promise<string> {
  const user = auth.currentUser;
  if (!user) return Promise.reject(new Error('Not signed in'));
  return user.getIdToken(true).then(t => `Bearer ${t}`);
}

const MetadataEditor: React.FC = () => {
  const [stage, setStage] = useState<Stage>('search');
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const [albumId, setAlbumId] = useState<string | null>(null);
  const [albumName, setAlbumName] = useState('');
  const [artistName, setArtistName] = useState('');
  const [albumDraft, setAlbumDraft] = useState('');
  const [origAlbum, setOrigAlbum] = useState('');
  const [albumArtists, setAlbumArtists] = useState<ArtistCredit[]>([]);
  const [origAlbumArtistString, setOrigAlbumArtistString] = useState('');
  const [applyAlbumArtistToTracks, setApplyAlbumArtistToTracks] = useState(false);
  const [tracks, setTracks] = useState<DraftTrack[]>([]);

  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
  const [hasRolledBack, setHasRolledBack] = useState(false);

  const reset = () => {
    setStage('search');
    setAlbumId(null);
    setAlbumName('');
    setArtistName('');
    setAlbumDraft('');
    setOrigAlbum('');
    setAlbumArtists([]);
    setOrigAlbumArtistString('');
    setApplyAlbumArtistToTracks(false);
    setTracks([]);
    setErrorMessage('');
    setStatusMessage('');
    setApplyResult(null);
    setHasRolledBack(false);
  };

  // -------------------------------------------------------------------------
  // Load album preview
  // -------------------------------------------------------------------------

  const loadAlbum = async (id: string) => {
    setStage('loading');
    setStatusMessage('Loading album metadata...');
    setErrorMessage('');
    try {
      const Authorization = await getAuthHeader();
      const resp = await fetch(`${MEDIA_API_URL}/metadata/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization },
        body: JSON.stringify({ subsonicAlbumId: id }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to load album.');
      const preview: PreviewResponse = data;
      setAlbumId(id);
      setAlbumName(preview.albumName);
      setArtistName(preview.artistName);
      setAlbumDraft(preview.albumName);
      setOrigAlbum(preview.albumName);
      const firstAlbumArtist = preview.tracks[0]?.albumArtist || preview.artistName;
      setOrigAlbumArtistString(firstAlbumArtist);
      setAlbumArtists(parseArtistString(firstAlbumArtist));
      setTracks(preview.tracks.map((t) => ({
        path: t.path,
        origTitle: t.title,
        origArtistString: t.artist,
        origAlbumArtistString: t.albumArtist,
        origAlbum: t.album,
        title: t.title,
        artists: parseArtistString(t.artist),
        duration: t.duration,
        trackNumber: t.track,
      })));
      setStage('editing');
    } catch (err: any) {
      setStage('error');
      setErrorMessage(err.message || 'Failed to load album.');
    }
  };

  // -------------------------------------------------------------------------
  // Build edit payload
  // -------------------------------------------------------------------------

  const albumLevelChanged = useMemo(() => {
    if (albumDraft !== origAlbum) return true;
    const joinedAlbumArtists = joinCredits(albumArtists);
    if (joinedAlbumArtists !== origAlbumArtistString) return true;
    return false;
  }, [albumDraft, origAlbum, albumArtists, origAlbumArtistString]);

  const buildEditsPayload = () => {
    const joinedAlbumArtists = joinCredits(albumArtists);
    const albumChanged = albumDraft !== origAlbum;
    const albumArtistChanged = joinedAlbumArtists !== origAlbumArtistString;

    const edits: Array<{
      path: string;
      fields: {
        title?: string;
        album?: string;
        artists?: ArtistCredit[];
        albumArtists?: ArtistCredit[];
      };
    }> = [];
    const diff: Array<{
      path: string;
      title: string;
      changes: Array<{ field: string; before: string; after: string }>;
    }> = [];

    for (const t of tracks) {
      const fields: typeof edits[0]['fields'] = {};
      const changes: Array<{ field: string; before: string; after: string }> = [];

      const titleChanged = t.title !== t.origTitle;
      if (titleChanged) {
        fields.title = t.title;
        changes.push({ field: 'Title', before: t.origTitle, after: t.title });
      }

      const effectiveArtists = applyAlbumArtistToTracks ? albumArtists : t.artists;
      const joinedArtists = joinCredits(effectiveArtists);
      const artistChanged = joinedArtists !== t.origArtistString;
      if (artistChanged) {
        fields.artists = effectiveArtists;
        changes.push({ field: 'Artist', before: t.origArtistString, after: joinedArtists });
      }

      if (albumChanged) {
        fields.album = albumDraft;
        changes.push({ field: 'Album', before: t.origAlbum, after: albumDraft });
      }
      if (albumArtistChanged) {
        fields.albumArtists = albumArtists;
        changes.push({
          field: 'Album Artist',
          before: t.origAlbumArtistString,
          after: joinedAlbumArtists,
        });
      }

      if (Object.keys(fields).length > 0) {
        edits.push({ path: t.path, fields });
        diff.push({ path: t.path, title: t.title, changes });
      }
    }

    return { edits, diff };
  };

  // -------------------------------------------------------------------------
  // Apply
  // -------------------------------------------------------------------------

  const handleApply = async () => {
    if (!albumId) return;
    const { edits } = buildEditsPayload();
    if (edits.length === 0) {
      setStage('error');
      setErrorMessage('No changes to apply.');
      return;
    }
    setStage('applying');
    setStatusMessage('Writing tags and updating beets...');
    setErrorMessage('');
    try {
      const Authorization = await getAuthHeader();
      const resp = await fetch(`${MEDIA_API_URL}/metadata/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization },
        body: JSON.stringify({ subsonicAlbumId: albumId, edits }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to apply edits.');
      setApplyResult(data as ApplyResponse);
      setStage('success');
    } catch (err: any) {
      setStage('error');
      setErrorMessage(err.message || 'Failed to apply edits.');
    }
  };

  // -------------------------------------------------------------------------
  // Rollback
  // -------------------------------------------------------------------------

  const handleRollback = async () => {
    if (!albumId) return;
    if (!window.confirm('Restore this album\'s metadata to the state before the most recent edit?')) {
      return;
    }
    setStage('applying');
    setStatusMessage('Restoring previous tags...');
    try {
      const Authorization = await getAuthHeader();
      const resp = await fetch(`${MEDIA_API_URL}/metadata/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization },
        body: JSON.stringify({ subsonicAlbumId: albumId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to restore.');
      setHasRolledBack(true);
      setStatusMessage(`Restored ${data.fileCount} files.`);
      setStage('success');
    } catch (err: any) {
      setStage('error');
      setErrorMessage(err.message || 'Failed to restore.');
    }
  };

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const updateTrack = (index: number, patch: Partial<DraftTrack>) => {
    setTracks(prev => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const { diff } = useMemo(() => {
    if (stage !== 'confirming' && stage !== 'editing') return { diff: [] as ReturnType<typeof buildEditsPayload>['diff'] };
    return buildEditsPayload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, albumDraft, origAlbum, albumArtists, origAlbumArtistString, tracks, applyAlbumArtistToTracks]);

  const hasAnyChanges = diff.length > 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="metadata-editor">
      {stage === 'search' && (
        <>
          <p className="metadata-editor__hint">
            Search for an album to edit its track metadata.
          </p>
          <AlbumSearchBox
            placeholder="Search for an album..."
            onAlbumSelect={loadAlbum}
            onUrlSubmit={() => { /* not supported here */ }}
          />
        </>
      )}

      {(stage === 'loading' || stage === 'applying') && (
        <div className="metadata-editor__status">
          <p className="metadata-editor__status-processing">{statusMessage}</p>
        </div>
      )}

      {stage === 'editing' && (
        <div className="metadata-editor__edit">
          <div className="metadata-editor__album-card">
            <div>
              <div className="metadata-editor__album-title">{albumName}</div>
              <div className="metadata-editor__album-artist">{artistName}</div>
            </div>
            <Button type="basic" label="← Change Album" onClick={reset} size="2em" />
          </div>

          <section className="metadata-editor__section">
            <h3 className="metadata-editor__section-title">Album-level</h3>
            <p className="metadata-editor__section-hint">
              Applies to every track on this album.
            </p>
            <label className="metadata-editor__label">Album name</label>
            <input
              type="text"
              className="metadata-editor__input"
              value={albumDraft}
              onChange={(e) => setAlbumDraft(e.target.value)}
              maxLength={500}
            />
            <label className="metadata-editor__label">Album artist credit</label>
            <ArtistCreditEditor
              value={albumArtists}
              onChange={setAlbumArtists}
              ariaLabel="Album artist credit"
            />
            <label className="metadata-editor__checkbox">
              <input
                type="checkbox"
                checked={applyAlbumArtistToTracks}
                onChange={(e) => setApplyAlbumArtistToTracks(e.target.checked)}
              />
              <span>Also apply album artist to every track's artist field</span>
            </label>
            {albumLevelChanged && (
              <p className="metadata-editor__changed-flag">
                Album-level changes will be applied to all {tracks.length} tracks.
              </p>
            )}
          </section>

          <section className="metadata-editor__section">
            <h3 className="metadata-editor__section-title">Tracks</h3>
            <ul className="metadata-editor__tracks">
              {tracks.map((t, i) => (
                <li className="metadata-editor__track" key={t.path}>
                  <div className="metadata-editor__track-header">
                    <span className="metadata-editor__track-num">{t.trackNumber ?? i + 1}.</span>
                    <input
                      type="text"
                      className="metadata-editor__input metadata-editor__input--title"
                      value={t.title}
                      onChange={(e) => updateTrack(i, { title: e.target.value })}
                      maxLength={500}
                      placeholder="Track title"
                    />
                  </div>
                  <div className="metadata-editor__track-credit">
                    <label className="metadata-editor__label">Artist credit</label>
                    <ArtistCreditEditor
                      value={t.artists}
                      onChange={(next) => updateTrack(i, { artists: next })}
                      ariaLabel={`Artist credit for ${t.title}`}
                      disabled={applyAlbumArtistToTracks}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="metadata-editor__actions">
            <Button
              type="basic"
              label={hasAnyChanges ? `Review ${diff.length} change${diff.length === 1 ? '' : 's'}` : 'No changes yet'}
              onClick={() => hasAnyChanges && setStage('confirming')}
              disabled={!hasAnyChanges}
            />
          </div>
        </div>
      )}

      {stage === 'confirming' && (
        <div className="metadata-editor__confirm">
          <h3 className="metadata-editor__section-title">Confirm changes</h3>
          <p className="metadata-editor__section-hint">
            A backup of the current tags will be saved before writing. You can undo this edit within 24 hours.
          </p>
          <ul className="metadata-editor__diff-list">
            {diff.map((d) => (
              <li key={d.path} className="metadata-editor__diff-item">
                <div className="metadata-editor__diff-title">{d.title}</div>
                <ul className="metadata-editor__diff-changes">
                  {d.changes.map((c, idx) => (
                    <li key={idx} className="metadata-editor__diff-change">
                      <span className="metadata-editor__diff-field">{c.field}:</span>
                      <span className="metadata-editor__diff-before">{c.before || <em>empty</em>}</span>
                      <span className="metadata-editor__diff-arrow">→</span>
                      <span className="metadata-editor__diff-after">{c.after || <em>empty</em>}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className="metadata-editor__actions">
            <Button type="basic" label="← Back to edit" onClick={() => setStage('editing')} />
            <Button type="basic" label="Apply changes" onClick={handleApply} />
          </div>
        </div>
      )}

      {stage === 'success' && (
        <div className="metadata-editor__status">
          {hasRolledBack ? (
            <>
              <p className="metadata-editor__status-success">&#10003; Restored to previous state.</p>
              <p className="metadata-editor__status-details">{statusMessage}</p>
            </>
          ) : applyResult ? (
            <>
              <p className="metadata-editor__status-success">
                &#10003; Updated {applyResult.results.filter(r => r.changed.length > 0).length} tracks.
              </p>
              {applyResult.beetsUpdate === 'ok' && (
                <p className="metadata-editor__status-details">Beets library updated.</p>
              )}
              {applyResult.beetsUpdate === 'warning' && (
                <p className="metadata-editor__status-warning">
                  Tags were written but `beet update` reported a problem. Library may be temporarily out of sync.
                </p>
              )}
              <ul className="metadata-editor__diff-list">
                {applyResult.results.filter(r => r.changed.length > 0).map((r) => (
                  <li key={r.path} className="metadata-editor__diff-item">
                    <div className="metadata-editor__diff-title">{r.after.title || r.before.title}</div>
                    <ul className="metadata-editor__diff-changes">
                      {r.changed.map((field) => (
                        <li key={field} className="metadata-editor__diff-change">
                          <span className="metadata-editor__diff-field">{field}:</span>
                          <span className="metadata-editor__diff-before">{(r.before as any)[field] || <em>empty</em>}</span>
                          <span className="metadata-editor__diff-arrow">→</span>
                          <span className="metadata-editor__diff-after">{(r.after as any)[field] || <em>empty</em>}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="metadata-editor__actions">
            {!hasRolledBack && albumId && (
              <Button type="basic" label="Undo last edit" onClick={handleRollback} />
            )}
            <Button type="basic" label="Edit another album" onClick={reset} />
          </div>
        </div>
      )}

      {stage === 'error' && (
        <div className="metadata-editor__status">
          <p className="metadata-editor__status-error-title">Error</p>
          <p className="metadata-editor__status-error-msg">{errorMessage}</p>
          <div className="metadata-editor__actions">
            {albumId && (
              <Button type="basic" label="← Back to edit" onClick={() => { setStage('editing'); setErrorMessage(''); }} />
            )}
            <Button type="basic" label="Start over" onClick={reset} />
          </div>
        </div>
      )}
    </div>
  );
};

export default MetadataEditor;
