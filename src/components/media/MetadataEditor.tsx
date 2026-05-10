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

function statusbarLabel(stage: Stage, albumName: string): string {
  switch (stage) {
    case 'search':     return 'Ready';
    case 'loading':    return 'Loading album...';
    case 'editing':    return albumName ? `Editing: ${albumName}` : 'Editing';
    case 'confirming': return 'Awaiting confirmation';
    case 'applying':   return 'Writing tags...';
    case 'success':    return 'Done!';
    case 'error':      return 'Error';
    default:           return 'Ready';
  }
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

  const titlebarText =
    stage === 'editing' && albumName
      ? `MetaTagger v3.0  —  ${albumName}.album`
      : stage === 'confirming'
      ? 'MetaTagger v3.0  —  Confirm Edits'
      : stage === 'success'
      ? 'MetaTagger v3.0  —  Saved!'
      : stage === 'error'
      ? 'MetaTagger v3.0  —  Error'
      : 'MetaTagger v3.0  —  Untitled.album';

  return (
    <div className="mm-tool">
      <div className="mm-window" role="region" aria-label="Metadata editor">
        <div className="mm-titlebar">
          <span className="mm-titlebar-icon" aria-hidden="true">♪</span>
          <span className="mm-titlebar-title">{titlebarText}</span>
          <span className="mm-titlebar-controls" aria-hidden="true">
            <span className="mm-titlebar-btn">_</span>
            <span className="mm-titlebar-btn">▢</span>
            <span className="mm-titlebar-btn">×</span>
          </span>
        </div>

        <div className="mm-chrome">
          {stage === 'search' && (
            <div className="mm-welcome">
              <p className="mm-welcome-greeting">
                ✧ Welcome, metadata manager! ✧
              </p>
              <p className="mm-hint">
                Search for an album to fix its tags.
              </p>
              <AlbumSearchBox
                placeholder="Search for an album..."
                onAlbumSelect={loadAlbum}
                onUrlSubmit={() => { /* not supported here */ }}
              />
              <div className="mm-ascii-divider" aria-hidden="true">
                ━━━━━━━━━━ ★ ━━━━━━━━━━
              </div>
              <p className="mm-welcome-tip">
                💾 Tags are backed up automatically — contact an admin if you really mess up!
              </p>
            </div>
          )}

          {(stage === 'loading' || stage === 'applying') && (
            <div className="mm-status">
              <div className="mm-loader-icon" aria-hidden="true">⌛</div>
              <p className="mm-status-processing">{statusMessage}</p>
              <div className="mm-progress-bar" aria-hidden="true">
                <div className="mm-progress-fill" />
              </div>
            </div>
          )}

          {stage === 'editing' && (
            <div>
              <div className="metadata-editor__album-card">
                <table className="metadata-editor__album-info">
                  <tbody>
                    <tr>
                      <td className="metadata-editor__album-info-label">Album</td>
                      <td className="metadata-editor__album-info-value">{albumName}</td>
                    </tr>
                    <tr>
                      <td className="metadata-editor__album-info-label">Artist</td>
                      <td className="metadata-editor__album-info-value">{artistName}</td>
                    </tr>
                    <tr>
                      <td className="metadata-editor__album-info-label">Tracks</td>
                      <td className="metadata-editor__album-info-value">{tracks.length}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="metadata-editor__album-card-action">
                  <Button type="basic" label="« Change album" onClick={reset} />
                </div>
              </div>

              <section className="mm-section">
                <h3 className="mm-section-title">
                  <span className="mm-section-title-deco" aria-hidden="true">★</span>
                  Album-wide edits
                  <span className="mm-section-title-deco" aria-hidden="true">★</span>
                </h3>
                <p className="mm-section-hint">
                  These changes apply to every track on the album.
                </p>

                <label className="mm-label" htmlFor="me-album-name">Album name</label>
                <input
                  id="me-album-name"
                  type="text"
                  className="mm-input"
                  value={albumDraft}
                  onChange={(e) => setAlbumDraft(e.target.value)}
                  maxLength={500}
                />

                <label className="mm-label">Album artist credit</label>
                <ArtistCreditEditor
                  value={albumArtists}
                  onChange={setAlbumArtists}
                  ariaLabel="Album artist credit"
                />

                <label className="mm-checkbox">
                  <input
                    type="checkbox"
                    checked={applyAlbumArtistToTracks}
                    onChange={(e) => setApplyAlbumArtistToTracks(e.target.checked)}
                  />
                  <span>Also apply this album artist to every track's artist field</span>
                </label>

                {albumLevelChanged && (
                  <p className="metadata-editor__changed-flag">
                    Album-level changes will be applied to all {tracks.length} tracks.
                  </p>
                )}
              </section>

              <section className="mm-section">
                <h3 className="mm-section-title">
                  <span className="mm-section-title-deco" aria-hidden="true">♪</span>
                  Track listing
                  <span className="mm-section-title-deco" aria-hidden="true">♪</span>
                </h3>
                <ul className="metadata-editor__tracks">
                  {tracks.map((t, i) => (
                    <li className="metadata-editor__track" key={t.path}>
                      <div className="metadata-editor__track-header">
                        <span className="metadata-editor__track-num">
                          {String(t.trackNumber ?? i + 1).padStart(2, '0')}
                        </span>
                        <input
                          type="text"
                          className="mm-input metadata-editor__input--title"
                          value={t.title}
                          onChange={(e) => updateTrack(i, { title: e.target.value })}
                          maxLength={500}
                          placeholder="Track title"
                          aria-label={`Title for track ${t.trackNumber ?? i + 1}`}
                        />
                      </div>
                      <div
                        className={
                          'metadata-editor__track-credit' +
                          (applyAlbumArtistToTracks ? ' metadata-editor__track-credit--locked' : '')
                        }
                      >
                        {applyAlbumArtistToTracks ? (
                          <p className="metadata-editor__track-credit-locked-msg">
                            Inheriting album artist credit
                          </p>
                        ) : (
                          <label className="mm-label">Artist credit</label>
                        )}
                        <ArtistCreditEditor
                          value={applyAlbumArtistToTracks ? albumArtists : t.artists}
                          onChange={(next) => updateTrack(i, { artists: next })}
                          ariaLabel={`Artist credit for ${t.title}`}
                          disabled={applyAlbumArtistToTracks}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="mm-actions">
                <span className="mm-btn-primary">
                  <Button
                    type="basic"
                    label={hasAnyChanges ? `Review ${diff.length} change${diff.length === 1 ? '' : 's'} »` : 'No changes yet'}
                    onClick={() => hasAnyChanges && setStage('confirming')}
                    disabled={!hasAnyChanges}
                  />
                </span>
              </div>
            </div>
          )}

          {stage === 'confirming' && (
            <div>
              <div className="metadata-editor__confirm-banner">
                A backup will be saved before writing. You can undo this edit within 24 hours.
              </div>
              <h3 className="mm-section-title">
                <span className="mm-section-title-deco" aria-hidden="true">»</span>
                Confirm changes
                <span className="mm-section-title-deco" aria-hidden="true">«</span>
              </h3>
              <ul className="metadata-editor__diff-list">
                {diff.map((d) => (
                  <li key={d.path} className="metadata-editor__diff-item">
                    <span className="metadata-editor__diff-title">{d.title}</span>
                    <ul className="metadata-editor__diff-changes">
                      {d.changes.map((c, idx) => (
                        <li key={idx} className="metadata-editor__diff-change">
                          <span className="metadata-editor__diff-field">{c.field}:</span>
                          <span className="metadata-editor__diff-before">{c.before || <em>empty</em>}</span>
                          <span className="metadata-editor__diff-arrow" aria-hidden="true">→</span>
                          <span className="metadata-editor__diff-after">{c.after || <em>empty</em>}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <div className="mm-actions">
                <Button type="basic" label="« Back to edit" onClick={() => setStage('editing')} />
                <span className="mm-btn-primary">
                  <Button type="basic" label="Apply changes ✓" onClick={handleApply} />
                </span>
              </div>
            </div>
          )}

          {stage === 'success' && (
            <div className="mm-status">
              {hasRolledBack ? (
                <>
                  <p className="mm-status-success-banner" aria-hidden="true">
                    ━━━━━━ RESTORED ━━━━━━
                  </p>
                  <p className="mm-status-success">✓ Restored to previous state.</p>
                  <p className="mm-status-details">{statusMessage}</p>
                </>
              ) : applyResult ? (
                <>
                  <p className="mm-status-success-banner" aria-hidden="true">
                    ━━━━━━ SUCCESS! ━━━━━━
                  </p>
                  <p className="mm-status-success">
                    ✓ Updated {applyResult.results.filter(r => r.changed.length > 0).length} tracks.
                  </p>
                  {applyResult.beetsUpdate === 'ok' && (
                    <p className="mm-status-details">Beets library updated.</p>
                  )}
                  {applyResult.beetsUpdate === 'warning' && (
                    <p className="mm-status-warning">
                      Tags were written, but <code>beet update</code> reported a problem.
                      Library may be temporarily out of sync.
                    </p>
                  )}
                  <ul className="metadata-editor__diff-list" style={{ textAlign: 'left' }}>
                    {applyResult.results.filter(r => r.changed.length > 0).map((r) => (
                      <li key={r.path} className="metadata-editor__diff-item">
                        <span className="metadata-editor__diff-title">{r.after.title || r.before.title}</span>
                        <ul className="metadata-editor__diff-changes">
                          {r.changed.map((field) => (
                            <li key={field} className="metadata-editor__diff-change">
                              <span className="metadata-editor__diff-field">{field}:</span>
                              <span className="metadata-editor__diff-before">
                                {(r.before as any)[field] || <em>empty</em>}
                              </span>
                              <span className="metadata-editor__diff-arrow" aria-hidden="true">→</span>
                              <span className="metadata-editor__diff-after">
                                {(r.after as any)[field] || <em>empty</em>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <div className="mm-actions">
                {!hasRolledBack && albumId && (
                  <Button type="basic" label="↶ Undo last edit" onClick={handleRollback} />
                )}
                <span className="mm-btn-primary">
                  <Button type="basic" label="Edit another album »" onClick={reset} />
                </span>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className="mm-status">
              <p className="mm-status-error-title">Error</p>
              <p className="mm-status-error-msg">{errorMessage}</p>
              <div className="mm-actions">
                {albumId && (
                  <Button type="basic" label="« Back to edit" onClick={() => { setStage('editing'); setErrorMessage(''); }} />
                )}
                <Button type="basic" label="Start over" onClick={reset} />
              </div>
            </div>
          )}
        </div>

        <div className="mm-statusbar" aria-hidden="true">
          <span className="mm-statusbar-section mm-statusbar-section--grow">
            <span className="mm-statusbar-blip" />
            {statusbarLabel(stage, albumName)}
          </span>
          <span className="mm-statusbar-section">
            {stage === 'editing' && hasAnyChanges
              ? `${diff.length} pending change${diff.length === 1 ? '' : 's'}`
              : stage === 'editing'
              ? 'no changes'
              : 'idle'}
          </span>
          <span className="mm-statusbar-section">
            ♪ MetaTagger ♪
          </span>
        </div>
      </div>
    </div>
  );
};

export default MetadataEditor;
