import { useState, useEffect, useRef } from 'react';
import {
  doc, onSnapshot, collection, getDocs,
  setDoc, runTransaction, deleteDoc,
} from 'firebase/firestore';
import { db, auth } from '../../firebaseConfig';
import { getUserData } from '../../utils/userCache';
import { useAdmin } from '../../utils/useAdmin';
import { useFilmClub, type Submission } from '../../utils/useFilmClub';
import FilmCard from './FilmCard';
import FilmSearchBox from '../basic/FilmSearchBox';
import type { FilmResult } from '../basic/FilmSearchBox';
import './FilmClub.css';

// ── IRV algorithm ───────────────────────────────────────────────────────────

function calculateIRV(votes: { ranking: string[] }[], candidateIds: string[]): string | null {
  if (candidateIds.length === 0) return null;
  if (candidateIds.length === 1) return candidateIds[0];

  let remaining = [...candidateIds];

  while (remaining.length > 1) {
    const counts: Record<string, number> = {};
    remaining.forEach((id) => { counts[id] = 0; });

    let totalVotes = 0;
    for (const vote of votes) {
      const top = vote.ranking.find((id) => remaining.includes(id));
      if (top) { counts[top]++; totalVotes++; }
    }

    if (totalVotes === 0) return remaining[0];

    const winner = remaining.find((id) => counts[id] / totalVotes > 0.5);
    if (winner) return winner;

    const minVotes = Math.min(...remaining.map((id) => counts[id]));
    const elimIdx = remaining.findIndex((id) => counts[id] === minVotes);
    remaining = remaining.filter((_, i) => i !== elimIdx);
  }

  return remaining[0] ?? null;
}

// ── Types ───────────────────────────────────────────────────────────────────

interface FilmData {
  tmdbId: number;
  title: string;
  releaseYear: string;
  posterPath: string | null;
  overview: string;
  pitch: string;
  submittedByUsername: string;
}

interface MonthDoc {
  currentFilm?: FilmData;
  nextFilm?: FilmData;
  winnerCalculated?: boolean;
  downloadLinks?: { label: string; url: string }[];
}

// ── Component ───────────────────────────────────────────────────────────────

function FilmClub() {
  const {
    monthId, nextMonthId, isRevealPhase,
    leavingDate, votingDeadline, nextMonthName, monthAfterNextName,
    userSubmissions, submissionsCount,
  } = useFilmClub();

  const { isAdmin } = useAdmin();

  const [monthData, setMonthData] = useState<MonthDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentFilmTrailerUrl, setCurrentFilmTrailerUrl] = useState<string | null>(null);
  const [nextFilmTrailerUrl, setNextFilmTrailerUrl] = useState<string | null>(null);

  // Admin state
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminFilmSelection, setAdminFilmSelection] = useState<FilmResult | null>(null);
  const [adminSaveStatus, setAdminSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [allSubmissions, setAllSubmissions] = useState<(Submission & { docId: string })[]>([]);
  const [adminDownloadLinks, setAdminDownloadLinks] = useState<{ label: string; url: string }[]>([{ label: '', url: '' }, { label: '', url: '' }]);
  const [downloadSaveStatus, setDownloadSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const irvTriggeredRef = useRef(false);

  // ── Pre-populate download links from Firestore ───────────────────────────
  useEffect(() => {
    if (monthData?.downloadLinks) {
      const links = monthData.downloadLinks;
      setAdminDownloadLinks(links.length > 0 ? links : [{ label: '', url: '' }, { label: '', url: '' }]);
    }
  }, [monthData?.downloadLinks]);

  // ── Fetch trailer for current film ──────────────────────────────────────
  useEffect(() => {
    const tmdbId = monthData?.currentFilm?.tmdbId;
    if (!tmdbId) return;
    fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${import.meta.env.VITE_TMDB_API_KEY}`)
      .then((r) => r.json())
      .then((data) => {
        const trailer = (data.results ?? []).find(
          (v: { type: string; site: string; key: string }) => v.type === 'Trailer' && v.site === 'YouTube'
        );
        setCurrentFilmTrailerUrl(trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null);
      })
      .catch(() => setCurrentFilmTrailerUrl(null));
  }, [monthData?.currentFilm?.tmdbId]);

  // ── Fetch trailer for next film ──────────────────────────────────────────
  useEffect(() => {
    const tmdbId = monthData?.nextFilm?.tmdbId;
    if (!tmdbId) return;
    fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${import.meta.env.VITE_TMDB_API_KEY}`)
      .then((r) => r.json())
      .then((data) => {
        const trailer = (data.results ?? []).find(
          (v: { type: string; site: string; key: string }) => v.type === 'Trailer' && v.site === 'YouTube'
        );
        setNextFilmTrailerUrl(trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null);
      })
      .catch(() => setNextFilmTrailerUrl(null));
  }, [monthData?.nextFilm?.tmdbId]);

  // ── Firestore: real-time month doc ──────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'filmClub', monthId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as MonthDoc & { downloadLinks?: unknown };
          // Migrate old { small, medium, large } shape to array
          if (data.downloadLinks && !Array.isArray(data.downloadLinks)) {
            const old = data.downloadLinks as Record<string, string>;
            data.downloadLinks = (['small', 'medium', 'large'] as const)
              .filter((k) => old[k])
              .map((k) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), url: old[k] }));
          }
          setMonthData(data as MonthDoc);
        } else {
          setMonthData(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('FilmClub snapshot error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [monthId]);

  // ── Load admin submissions (next month during reveal phase) ──────────────
  const adminMonthId = isRevealPhase ? nextMonthId : monthId;
  const [adminMidYear, adminMidMonth] = adminMonthId.split('-').map(Number);
  const adminSubmissionsForMonth = new Date(adminMidYear, adminMidMonth, 1).toLocaleDateString('en-GB', { month: 'long' });
  useEffect(() => {
    getDocs(collection(db, 'filmClub', adminMonthId, 'submissions')).then((snap) => {
      setAllSubmissions(snap.docs.map((d) => ({ docId: d.id, ...(d.data() as Submission) })));
    }).catch(console.error);
  }, [adminMonthId]);

  // ── Auto IRV trigger ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRevealPhase) return;
    if (!monthData) return;
    if (monthData.winnerCalculated) return;
    if (irvTriggeredRef.current) return;
    irvTriggeredRef.current = true;

    const runIRV = async () => {
      const [subsSnap, votesSnap] = await Promise.all([
        getDocs(collection(db, 'filmClub', monthId, 'submissions')),
        getDocs(collection(db, 'filmClub', monthId, 'votes')),
      ]);

      const submissions: Record<string, Submission> = {};
      subsSnap.forEach((d) => {
        submissions[d.id] = { ...(d.data() as Submission) };
      });

      const votes = votesSnap.docs.map((d) => d.data() as { ranking: string[] });
      const candidateIds = Object.keys(submissions);

      if (candidateIds.length === 0) return;

      const winnerId = calculateIRV(votes, candidateIds);
      if (!winnerId) return;

      const winner = submissions[winnerId];
      const nextFilm: FilmData = {
        tmdbId: winner.tmdbId,
        title: winner.title,
        releaseYear: winner.releaseYear,
        posterPath: winner.posterPath,
        overview: winner.overview,
        pitch: winner.pitch,
        submittedByUsername: winner.username,
      };

      const monthRef = doc(db, 'filmClub', monthId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(monthRef);
        if (snap.data()?.winnerCalculated) return;
        tx.set(monthRef, { nextFilm, winnerCalculated: true }, { merge: true });
      });
    };

    runIRV().catch(console.error);
  }, [isRevealPhase, monthData, monthId]);

  // ── Admin: set current film ──────────────────────────────────────────────
  const handleAdminSetCurrentFilm = (film: FilmResult) => {
    setAdminFilmSelection(film);
    setAdminSaveStatus('idle');
  };

  const handleAdminSave = async () => {
    if (!adminFilmSelection) return;
    setAdminSaveStatus('saving');
    try {
      const { username } = await getUserData(auth.currentUser?.uid ?? '');
      const currentFilm: FilmData = {
        tmdbId: adminFilmSelection.id,
        title: adminFilmSelection.title,
        releaseYear: adminFilmSelection.releaseYear,
        posterPath: adminFilmSelection.posterPath,
        overview: adminFilmSelection.overview,
        pitch: '',
        submittedByUsername: username,
      };
      await setDoc(doc(db, 'filmClub', monthId), { currentFilm }, { merge: true });
      setAdminSaveStatus('saved');
      setAdminFilmSelection(null);
    } catch (err) {
      console.error('Admin set film error:', err);
      setAdminSaveStatus('error');
    }
  };

  // ── Admin: save download links ───────────────────────────────────────────
  const handleAdminSaveDownloadLinks = async () => {
    setDownloadSaveStatus('saving');
    try {
      const links = adminDownloadLinks.filter((l) => l.url.trim());
      await setDoc(doc(db, 'filmClub', monthId), { downloadLinks: links }, { merge: true });
      setDownloadSaveStatus('saved');
    } catch (err) {
      console.error('Download links save error:', err);
      setDownloadSaveStatus('error');
    }
  };

  // ── Admin: delete submission ─────────────────────────────────────────────
  const handleAdminDeleteSubmission = async (docId: string) => {
    try {
      await deleteDoc(doc(db, 'filmClub', adminMonthId, 'submissions', docId));
      setAllSubmissions((prev) => prev.filter((s) => s.docId !== docId));
    } catch (err) {
      console.error('Delete submission error:', err);
    }
  };

  const voteLink = isRevealPhase ? `/film-club-vote?month=${nextMonthId}` : '/film-club-vote';

  if (loading) return null;

  return (
    <div className="film-club-container">

      {/* Current film */}
      {monthData?.currentFilm ? (
        <div className="film-club-section">
          <FilmCard
            label="Now watching"
            posterPath={monthData.currentFilm.posterPath}
            title={monthData.currentFilm.title}
            releaseYear={monthData.currentFilm.releaseYear}
            overview={monthData.currentFilm.overview || undefined}
            pitch={monthData.currentFilm.pitch || undefined}
            submittedByUsername={monthData.currentFilm.submittedByUsername || undefined}
            leaveDate={leavingDate}
            trailerUrl={currentFilmTrailerUrl ?? undefined}
            downloadLinks={monthData.downloadLinks}
          />
        </div>
      ) : (
        <div className="film-club-section">
          <p className="normal-text">No film selected for this month yet.</p>
        </div>
      )}

      {/* Phase B: reveal next film */}
      {isRevealPhase && monthData?.nextFilm && (
        <div className="film-club-section">
          <FilmCard
            label={`Next month's film — ${nextMonthName}`}
            posterPath={monthData.nextFilm.posterPath}
            title={monthData.nextFilm.title}
            releaseYear={monthData.nextFilm.releaseYear}
            overview={monthData.nextFilm.overview || undefined}
            pitch={monthData.nextFilm.pitch || undefined}
            submittedByUsername={monthData.nextFilm.submittedByUsername || undefined}
            trailerUrl={nextFilmTrailerUrl ?? undefined}
          />
        </div>
      )}

      {isRevealPhase && !monthData?.nextFilm && (
        <div className="film-club-section">
          <p className="normal-text" style={{ fontFamily: 'var(--font2)', fontSize: '0.875rem', color: 'var(--colour5)', opacity: 0.7 }}>
            Calculating next month's film…
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="film-club-section film-club-actions">
        {isRevealPhase ? (
          <>
            <p className="normal-text">
              Voting for {nextMonthName} is closed. You can now submit and vote for <strong>{monthAfterNextName}</strong>'s film.
            </p>
            <div className="film-club-action-row">
              <a href="/film-club-submit" className="film-club-btn film-club-btn-primary">
                Submit a film for {monthAfterNextName}
              </a>
              <a href={voteLink} className="film-club-btn film-club-btn-secondary">
                Vote for {monthAfterNextName}
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="film-club-action-row">
              <a href="/film-club-submit" className="film-club-btn film-club-btn-primary">
                {userSubmissions.length > 0 ? 'Submit another film' : `Submit a film for ${nextMonthName}`}
              </a>
              <a href="/film-club-vote" className="film-club-btn film-club-btn-primary">
                Vote for {nextMonthName}
              </a>
            </div>
            {userSubmissions.length > 0 && (
              <p className="normal-text" style={{ marginTop: '0.5rem' }}>
                Your {nextMonthName} Film Club submission{userSubmissions.length > 1 ? 's' : ''}: <strong>{userSubmissions.map((s) => s.title).join(', ')}</strong>
              </p>
            )}
            <p className="film-club-deadline">
              {submissionsCount} film{submissionsCount !== 1 ? 's' : ''} submitted · voting closes {votingDeadline}
            </p>
          </>
        )}
      </div>

      {/* Admin toggle */}
      {isAdmin && (
        <div style={{ textAlign: 'right', marginBottom: '0.5rem' }}>
          <button
            onClick={() => setShowAdminPanel((v) => !v)}
            className="film-club-btn"
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
          >
            {showAdminPanel ? 'Hide admin' : 'Admin'}
          </button>
        </div>
      )}

      {/* Admin panel */}
      {isAdmin && showAdminPanel && (
        <div className="film-club-section film-club-admin">
          {allSubmissions.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <p className="film-club-admin-label" style={{ marginBottom: '0.5rem' }}>Delete submissions for {adminSubmissionsForMonth}</p>
              {allSubmissions.map((s) => (
                <div key={s.docId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--colour5)' }}>
                  <span className="normal-text" style={{ fontSize: '0.875rem' }}>
                    {s.title} ({s.releaseYear}) — {s.username}
                  </span>
                  <button
                    onClick={() => handleAdminDeleteSubmission(s.docId)}
                    className="film-club-btn"
                    style={{ marginLeft: '1rem', padding: '0.25rem 0.75rem', fontSize: '0.8rem', backgroundColor: 'var(--colour3)', color: 'var(--colour4)', border: 'none', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginBottom: '1.5rem' }}>
            <p className="film-club-admin-label" style={{ marginBottom: '0.5rem' }}>Download links for current film</p>
            {adminDownloadLinks.map((link, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => setAdminDownloadLinks((prev) => prev.map((l, j) => j === i ? { ...l, label: e.target.value } : l))}
                  placeholder="Size (e.g. 1080p)"
                  style={{ width: '8rem', flexShrink: 0, padding: '0.35rem 0.6rem', fontSize: '0.875rem', fontFamily: 'var(--font2)', background: 'var(--colour4)', color: 'var(--colour5)', border: '1px solid var(--colour5)', borderRadius: '6px' }}
                />
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => setAdminDownloadLinks((prev) => prev.map((l, j) => j === i ? { ...l, url: e.target.value } : l))}
                  placeholder="https://…"
                  style={{ flex: 1, padding: '0.35rem 0.6rem', fontSize: '0.875rem', fontFamily: 'var(--font2)', background: 'var(--colour4)', color: 'var(--colour5)', border: '1px solid var(--colour5)', borderRadius: '6px' }}
                />
                <button
                  onClick={() => setAdminDownloadLinks((prev) => prev.filter((_, j) => j !== i))}
                  className="film-club-btn"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', flexShrink: 0 }}
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setAdminDownloadLinks((prev) => [...prev, { label: '', url: '' }])}
              className="film-club-btn"
              style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem', marginBottom: '0.5rem' }}
            >+ Add link</button>
            <button
              onClick={handleAdminSaveDownloadLinks}
              disabled={downloadSaveStatus === 'saving'}
              className="film-club-btn film-club-btn-primary"
              style={{ marginTop: '0.5rem' }}
            >
              {downloadSaveStatus === 'saving' ? 'Saving…' : 'Save download links'}
            </button>
            {downloadSaveStatus === 'saved' && (
              <p className="normal-text" style={{ color: 'var(--colour1)', marginTop: '0.5rem' }}>Saved!</p>
            )}
            {downloadSaveStatus === 'error' && (
              <p className="normal-text" style={{ color: 'var(--colour3)', marginTop: '0.5rem' }}>Error saving.</p>
            )}
          </div>

          <p className="film-club-admin-label" style={{ marginBottom: '0.5rem' }}>Set currently playing film</p>
          <FilmSearchBox onFilmSelect={handleAdminSetCurrentFilm} />
          {adminFilmSelection && (
            <div style={{ marginTop: '1rem' }}>
              <FilmCard
                posterPath={adminFilmSelection.posterPath}
                title={adminFilmSelection.title}
                releaseYear={adminFilmSelection.releaseYear}
              />
              <button
                onClick={handleAdminSave}
                disabled={adminSaveStatus === 'saving'}
                className="film-club-btn film-club-btn-primary"
                style={{ marginTop: '0.75rem' }}
              >
                {adminSaveStatus === 'saving' ? 'Saving…' : 'Set as current film'}
              </button>
              {adminSaveStatus === 'saved' && (
                <p className="normal-text" style={{ color: 'var(--colour1)', marginTop: '0.5rem' }}>Saved!</p>
              )}
              {adminSaveStatus === 'error' && (
                <p className="normal-text" style={{ color: 'var(--colour3)', marginTop: '0.5rem' }}>Error saving.</p>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default FilmClub;
