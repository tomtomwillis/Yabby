import { useState, useEffect, useRef } from 'react';
import {
  doc, onSnapshot, collection, getDocs,
  setDoc, runTransaction, deleteDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { getUserData } from '../utils/userCache';
import { useAdmin } from '../utils/useAdmin';
import Header from '../components/basic/Header';
import FilmCard from '../components/FilmCard';
import FilmSearchBox from '../components/basic/FilmSearchBox';
import type { FilmResult } from '../components/basic/FilmSearchBox';
import '../App.css';
import '../components/FilmClub.css';

// ── Date helpers ────────────────────────────────────────────────────────────

function getMonthId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function getNextMonthId() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const y = next.getFullYear();
  const m = next.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function getPhaseInfo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const daysRemaining = lastDay - now.getDate();
  const isRevealPhase = daysRemaining < 5;

  const leavingDate = new Date(year, month, 0).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long',
  });
  const votingDeadlineDay = lastDay - 5;
  const votingDeadline = new Date(year, month - 1, votingDeadlineDay).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long',
  });
  const nextMonthName = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long' });
  const monthAfterNextName = new Date(year, month + 1, 1).toLocaleDateString('en-GB', { month: 'long' });

  return { isRevealPhase, leavingDate, votingDeadline, nextMonthName, monthAfterNextName };
}

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
}

interface Submission {
  userId: string;
  title: string;
  releaseYear: string;
  posterPath: string | null;
  overview: string;
  pitch: string;
  username: string;
  tmdbId: number;
}

// ── Component ───────────────────────────────────────────────────────────────

function FilmClub() {
  const { isRevealPhase, leavingDate, votingDeadline, nextMonthName, monthAfterNextName } = getPhaseInfo();
  const monthId = getMonthId();
  const nextMonthId = getNextMonthId();

  const { isAdmin } = useAdmin();
  const userId = auth.currentUser?.uid ?? null;

  const [monthData, setMonthData] = useState<MonthDoc | null>(null);
  const [userSubmissions, setUserSubmissions] = useState<Submission[]>([]);
  const [submissionsCount, setSubmissionsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [currentFilmTrailerUrl, setCurrentFilmTrailerUrl] = useState<string | null>(null);

  // Admin state
  const [adminFilmSelection, setAdminFilmSelection] = useState<FilmResult | null>(null);
  const [adminSaveStatus, setAdminSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [allSubmissions, setAllSubmissions] = useState<(Submission & { docId: string })[]>([]);

  // Guard against duplicate IRV runs
  const irvTriggeredRef = useRef(false);

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

  // ── Firestore: real-time month doc ──────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'filmClub', monthId),
      (snap) => {
        setMonthData(snap.exists() ? (snap.data() as MonthDoc) : null);
        setLoading(false);
      },
      (err) => {
        console.error('FilmClub snapshot error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [monthId]);

  // ── Load user submission + submission count ──────────────────────────────
  useEffect(() => {
    getDocs(collection(db, 'filmClub', monthId, 'submissions')).then((snap) => {
      setSubmissionsCount(snap.size);
      setAllSubmissions(snap.docs.map((d) => ({ docId: d.id, ...(d.data() as Submission) })));
      if (!userId) return;
      const myDocs = snap.docs.filter((d) => (d.data() as Submission).userId === userId);
      setUserSubmissions(myDocs.map((d) => ({ ...(d.data() as Submission) })));
    }).catch(console.error);
  }, [monthId, userId]);

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

  // ── Admin: delete submission ─────────────────────────────────────────────
  const handleAdminDeleteSubmission = async (docId: string) => {
    try {
      await deleteDoc(doc(db, 'filmClub', monthId, 'submissions', docId));
      setAllSubmissions((prev) => prev.filter((s) => s.docId !== docId));
      setSubmissionsCount((prev) => prev - 1);
    } catch (err) {
      console.error('Delete submission error:', err);
    }
  };

  // ── Phase B: voting for the month-after-next ─────────────────────────────
  // In reveal phase, the vote button targets next month's submissions
  const voteLink = isRevealPhase ? `/film-club-vote?month=${nextMonthId}` : '/film-club-vote';

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="app-container">
        <Header title="Film Club" subtitle="watch with yabbyville" />
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header title="Film Club" subtitle="watch with yabbyville" />

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
              pitch={monthData.nextFilm.pitch || undefined}
              submittedByUsername={monthData.nextFilm.submittedByUsername || undefined}
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
                  Your submission{userSubmissions.length > 1 ? 's' : ''}: <strong>{userSubmissions.map((s) => s.title).join(', ')}</strong>
                </p>
              )}
              <p className="film-club-deadline">
                {submissionsCount} film{submissionsCount !== 1 ? 's' : ''} submitted · voting closes {votingDeadline}
              </p>
            </>
          )}
        </div>

        {/* Admin panel */}
        {isAdmin && (
          <div className="film-club-section film-club-admin">
            <p className="film-club-admin-label">Admin — set current film</p>
            {allSubmissions.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <p className="film-club-admin-label" style={{ marginBottom: '0.5rem' }}>Delete submissions</p>
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
    </div>
  );
}

export default FilmClub;
