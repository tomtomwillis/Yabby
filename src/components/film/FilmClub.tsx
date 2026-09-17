import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, collection, getDocs, runTransaction } from 'firebase/firestore';
import {
  setDocShadowed, updateDocShadowed, deleteDocShadowed, reportWrite, DELETE_FIELD,
} from '../../api/shadow';
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
  directDownloadLinks?: { label: string; url: string }[];
  currentFilmDescription?: string;
  nextFilmDescription?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

function FilmClub() {
  const {
    monthId, prevMonthId, nextMonthId, isRevealPhase,
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
  const [adminDirectDownloadLinks, setAdminDirectDownloadLinks] = useState<{ label: string; url: string }[]>([{ label: '', url: '' }]);
  const [directDownloadSaveStatus, setDirectDownloadSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [adminDescription, setAdminDescription] = useState('');
  const [descriptionSaveStatus, setDescriptionSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [adminNextDescription, setAdminNextDescription] = useState('');
  const [nextDescriptionSaveStatus, setNextDescriptionSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [clearFilmStatus, setClearFilmStatus] = useState<'idle' | 'clearing' | 'error'>('idle');
  const [irvStatus, setIrvStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  const [nextShowingAt, setNextShowingAt] = useState<string>('');
  const [nextShowingInput, setNextShowingInput] = useState<string>('');
  const [nextShowingStatus, setNextShowingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [prevMonthData, setPrevMonthData] = useState<MonthDoc | null>(null);

  const irvTriggeredRef = useRef(false);
  const autoPromotedRef = useRef(false);

  // ── Pre-populate download links from Firestore ───────────────────────────
  useEffect(() => {
    if (monthData?.downloadLinks) {
      const links = monthData.downloadLinks;
      setAdminDownloadLinks(links.length > 0 ? links : [{ label: '', url: '' }, { label: '', url: '' }]);
    }
  }, [monthData?.downloadLinks]);

  // ── Pre-populate direct download links from Firestore ────────────────────
  useEffect(() => {
    if (monthData?.directDownloadLinks) {
      const links = monthData.directDownloadLinks;
      setAdminDirectDownloadLinks(links.length > 0 ? links : [{ label: '', url: '' }]);
    }
  }, [monthData?.directDownloadLinks]);

  // ── Pre-populate description from Firestore ──────────────────────────────
  useEffect(() => {
    setAdminDescription(monthData?.currentFilmDescription ?? '');
  }, [monthData?.currentFilmDescription]);

  useEffect(() => {
    setAdminNextDescription(monthData?.nextFilmDescription ?? '');
  }, [monthData?.nextFilmDescription]);

  // ── Fetch trailer for current film ──────────────────────────────────────
  useEffect(() => {
    const tmdbId = monthData?.currentFilm?.tmdbId ?? prevMonthData?.nextFilm?.tmdbId;
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
  }, [monthData?.currentFilm?.tmdbId, prevMonthData?.nextFilm?.tmdbId]);

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

  // ── Firestore: cinema state (next showing time) ─────────────────────────
  const loadCinemaState = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'cinema', 'state'));
      const value = snap.exists() ? ((snap.data() as { nextShowingAt?: string }).nextShowingAt ?? '') : '';
      setNextShowingAt(value);
      setNextShowingInput(value);
    } catch (err) {
      console.error('Cinema state load error:', err);
    }
  }, []);

  useEffect(() => {
    loadCinemaState();
  }, [loadCinemaState]);

  // ── Firestore: month doc (loaded once; refreshed after admin writes) ────
  const loadMonthData = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'filmClub', monthId));
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
    } catch (err) {
      console.error('FilmClub month load error:', err);
    } finally {
      setLoading(false);
    }
  }, [monthId]);

  useEffect(() => {
    loadMonthData();
  }, [loadMonthData]);

  // ── Firestore: previous month doc (for nextFilm promotion) ─────────────
  useEffect(() => {
    getDoc(doc(db, 'filmClub', prevMonthId))
      .then((snap) => { setPrevMonthData(snap.exists() ? (snap.data() as MonthDoc) : null); })
      .catch(console.error);
  }, [prevMonthId]);

  // ── Auto-promote prevMonth.nextFilm → currentMonth.currentFilm ──────────
  useEffect(() => {
    if (!isAdmin) return;
    if (loading) return;
    if (monthData?.currentFilm) return;
    if (!prevMonthData?.nextFilm) return;
    if (autoPromotedRef.current) return;
    autoPromotedRef.current = true;

    const promotion: Partial<MonthDoc> = { currentFilm: prevMonthData.nextFilm };
    if (prevMonthData.nextFilmDescription) promotion.currentFilmDescription = prevMonthData.nextFilmDescription;
    setDocShadowed(doc(db, 'filmClub', monthId), promotion, { merge: true })
      .then(() => loadMonthData())
      .catch(console.error);
  }, [isAdmin, loading, monthData, prevMonthData, monthId, loadMonthData]);

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
      const result = { nextFilm, winnerCalculated: true };
      const wrote = await runTransaction(db, async (tx) => {
        const snap = await tx.get(monthRef);
        if (snap.data()?.winnerCalculated) return false;
        tx.set(monthRef, result, { merge: true });
        return true;
      });
      // A transaction drives the SDK directly, so the shadow hears about it here.
      if (wrote) reportWrite('set', monthRef.path, result, { merge: true });
      await loadMonthData();
    };

    runIRV().catch(console.error);
  }, [isRevealPhase, monthData, monthId, loadMonthData]);

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
      await setDocShadowed(doc(db, 'filmClub', monthId), { currentFilm }, { merge: true });
      await loadMonthData();
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
      await setDocShadowed(doc(db, 'filmClub', monthId), { downloadLinks: links }, { merge: true });
      await loadMonthData();
      setDownloadSaveStatus('saved');
    } catch (err) {
      console.error('Download links save error:', err);
      setDownloadSaveStatus('error');
    }
  };

  // ── Admin: save direct download links ────────────────────────────────────
  const handleAdminSaveDirectDownloadLinks = async () => {
    setDirectDownloadSaveStatus('saving');
    try {
      const links = adminDirectDownloadLinks.filter((l) => l.url.trim());
      await setDocShadowed(doc(db, 'filmClub', monthId), { directDownloadLinks: links }, { merge: true });
      await loadMonthData();
      setDirectDownloadSaveStatus('saved');
    } catch (err) {
      console.error('Direct download links save error:', err);
      setDirectDownloadSaveStatus('error');
    }
  };

  // ── Admin: save description ──────────────────────────────────────────────
  const handleAdminSaveDescription = async () => {
    setDescriptionSaveStatus('saving');
    try {
      await setDocShadowed(doc(db, 'filmClub', monthId), { currentFilmDescription: adminDescription }, { merge: true });
      await loadMonthData();
      setDescriptionSaveStatus('saved');
    } catch (err) {
      console.error('Description save error:', err);
      setDescriptionSaveStatus('error');
    }
  };

  // ── Admin: save next film description ───────────────────────────────────
  const handleAdminSaveNextDescription = async () => {
    setNextDescriptionSaveStatus('saving');
    try {
      await setDocShadowed(doc(db, 'filmClub', monthId), { nextFilmDescription: adminNextDescription }, { merge: true });
      await loadMonthData();
      setNextDescriptionSaveStatus('saved');
    } catch (err) {
      console.error('Next film description save error:', err);
      setNextDescriptionSaveStatus('error');
    }
  };

  // ── Admin: save / clear next cinema showing ──────────────────────────────
  const handleSaveNextShowing = async () => {
    if (!nextShowingInput) return;
    setNextShowingStatus('saving');
    try {
      await setDocShadowed(doc(db, 'cinema', 'state'), { nextShowingAt: nextShowingInput }, { merge: true });
      setNextShowingAt(nextShowingInput);
      setNextShowingStatus('saved');
    } catch (err) {
      console.error('Next showing save error:', err);
      setNextShowingStatus('error');
    }
  };

  const handleClearNextShowing = async () => {
    setNextShowingStatus('saving');
    try {
      await updateDocShadowed(doc(db, 'cinema', 'state'), { nextShowingAt: DELETE_FIELD });
      setNextShowingAt('');
      setNextShowingInput('');
      setNextShowingStatus('saved');
    } catch (err) {
      console.error('Next showing clear error:', err);
      setNextShowingStatus('error');
    }
  };

  // ── Admin: clear current film ────────────────────────────────────────────
  const handleAdminClearCurrentFilm = async () => {
    setClearFilmStatus('clearing');
    try {
      await updateDocShadowed(doc(db, 'filmClub', monthId), {
        currentFilm: DELETE_FIELD,
        currentFilmDescription: DELETE_FIELD,
      });
      await loadMonthData();
      setClearFilmStatus('idle');
    } catch (err) {
      console.error('Clear film error:', err);
      setClearFilmStatus('error');
    }
  };

  // ── Admin: force re-run IRV ──────────────────────────────────────────────
  const handleAdminRerunIRV = async () => {
    setIrvStatus('running');
    try {
      const [subsSnap, votesSnap] = await Promise.all([
        getDocs(collection(db, 'filmClub', adminMonthId, 'submissions')),
        getDocs(collection(db, 'filmClub', adminMonthId, 'votes')),
      ]);

      const submissions: Record<string, Submission> = {};
      subsSnap.forEach((d) => { submissions[d.id] = d.data() as Submission; });

      const votes = votesSnap.docs.map((d) => d.data() as { ranking: string[] });
      const candidateIds = Object.keys(submissions);

      if (candidateIds.length === 0) {
        setIrvStatus('error');
        return;
      }

      const winnerId = calculateIRV(votes, candidateIds);
      if (!winnerId) {
        setIrvStatus('error');
        return;
      }

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

      await setDocShadowed(doc(db, 'filmClub', adminMonthId), { nextFilm, winnerCalculated: true }, { merge: true });
      if (adminMonthId === monthId) await loadMonthData();
      setIrvStatus('done');
    } catch (err) {
      console.error('Admin IRV error:', err);
      setIrvStatus('error');
    }
  };

  // ── Admin: delete submission ─────────────────────────────────────────────
  const handleAdminDeleteSubmission = async (docId: string) => {
    try {
      await deleteDocShadowed(doc(db, 'filmClub', adminMonthId, 'submissions', docId));
      setAllSubmissions((prev) => prev.filter((s) => s.docId !== docId));
    } catch (err) {
      console.error('Delete submission error:', err);
    }
  };

  const voteLink = isRevealPhase ? `/film-club-vote?month=${nextMonthId}` : '/film-club-vote';

  const effectiveCurrentFilm = monthData?.currentFilm ?? prevMonthData?.nextFilm ?? null;

  if (loading) return null;

  return (
    <div className="film-club-container">

      {/* Current film */}
      {effectiveCurrentFilm ? (
        <div className="film-club-section">
          <FilmCard
            label="Now watching"
            posterPath={effectiveCurrentFilm.posterPath}
            title={effectiveCurrentFilm.title}
            releaseYear={effectiveCurrentFilm.releaseYear}
            overview={effectiveCurrentFilm.overview || undefined}
            pitch={effectiveCurrentFilm.pitch || undefined}
            submittedByUsername={effectiveCurrentFilm.submittedByUsername || undefined}
            leaveDate={leavingDate}
            trailerUrl={currentFilmTrailerUrl ?? undefined}
            downloadLinks={monthData?.downloadLinks}
            directDownloadLinks={monthData?.directDownloadLinks}
            description={monthData?.currentFilmDescription || undefined}
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
          <p className="fc-note fc-note--quiet">
            Calculating next month's film…
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="film-club-section film-club-actions">
        <h2 className="fc-h">
          <span className="fc-h-label">take part</span>
          <span className="fc-h-rule" aria-hidden="true"></span>
          <span className="fc-h-note">{isRevealPhase ? monthAfterNextName.toLowerCase() : nextMonthName.toLowerCase()}</span>
        </h2>

        <a href="/filmclubmessage" className="film-club-btn film-club-btn-wide">
          film club message board
        </a>
        {/* <a href="/cinema" className="film-club-btn film-club-btn-primary film-club-btn-wide" style={{ marginBottom: '1rem' }}>
          Cinema
        </a> */}
        {isRevealPhase ? (
          <>
            <p className="normal-text">
              Voting for {nextMonthName} is closed. You can now submit and vote for <strong>{monthAfterNextName}</strong>'s film.
            </p>
            <div className="film-club-action-row">
              <a href="/film-club-submit" className="film-club-btn film-club-btn-primary">
                Submit a film for {monthAfterNextName}
              </a>
              <a href={voteLink} className="film-club-btn">
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
              <a href="/film-club-vote" className="film-club-btn">
                Vote for {nextMonthName}
              </a>
            </div>
            {userSubmissions.length > 0 && (
              <p className="normal-text">
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
        <div className="fc-admin-toggle-row">
          <button
            onClick={() => setShowAdminPanel((v) => !v)}
            className="fc-act"
            aria-expanded={showAdminPanel}
          >
            {showAdminPanel ? 'Hide admin' : 'Admin'}
          </button>
        </div>
      )}

      {/* Admin panel */}
      {isAdmin && showAdminPanel && (
        <div className="film-club-section film-club-admin">
          <div className="fc-admin-block">
            <p className="film-club-admin-label">Re-run IRV for {adminSubmissionsForMonth}</p>
            <button
              onClick={handleAdminRerunIRV}
              disabled={irvStatus === 'running'}
              className="film-club-btn film-club-btn-primary"
            >
              {irvStatus === 'running' ? 'Calculating…' : 'Re-run winner calculation'}
            </button>
            {irvStatus === 'done' && <p className="fc-msg fc-msg--good" role="status">done — winner updated.</p>}
            {irvStatus === 'error' && <p className="fc-msg fc-msg--bad" role="status">failed — no submissions, or IRV returned no result.</p>}
          </div>

          <div className="fc-admin-block">
            <p className="film-club-admin-label">Next cinema showing</p>
            <div className="fc-admin-row">
              <input
                type="datetime-local"
                value={nextShowingInput}
                onChange={(e) => { setNextShowingInput(e.target.value); setNextShowingStatus('idle'); }}
                className="fc-admin-input"
              />
              <button
                onClick={handleSaveNextShowing}
                disabled={nextShowingStatus === 'saving' || !nextShowingInput || nextShowingInput === nextShowingAt}
                className="film-club-btn film-club-btn-primary"
              >
                {nextShowingStatus === 'saving' ? 'Saving…' : 'Save'}
              </button>
              {nextShowingAt && (
                <button
                  onClick={handleClearNextShowing}
                  disabled={nextShowingStatus === 'saving'}
                  className="film-club-btn film-club-btn-del"
                >
                  Clear
                </button>
              )}
            </div>
            {nextShowingAt && (
              <p className="fc-note fc-note--quiet">
                Currently set to: <strong>{new Date(nextShowingAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong>
              </p>
            )}
            {nextShowingStatus === 'saved' && (
              <p className="fc-msg fc-msg--good" role="status">saved.</p>
            )}
            {nextShowingStatus === 'error' && (
              <p className="fc-msg fc-msg--bad" role="status">could not save.</p>
            )}
          </div>

          {allSubmissions.length > 0 && (
            <div className="fc-admin-block">
              <p className="film-club-admin-label">Delete submissions for {adminSubmissionsForMonth}</p>
              <ul className="fc-admin-list">
              {allSubmissions.map((s) => (
                <li key={s.docId} className="fc-admin-list-row">
                  <span className="fc-admin-list-name">
                    {s.title} ({s.releaseYear}) — {s.username}
                  </span>
                  <span className="fc-admin-list-leader" aria-hidden="true"></span>
                  <button
                    onClick={() => handleAdminDeleteSubmission(s.docId)}
                    className="fc-act fc-act--del"
                  >
                    del
                  </button>
                </li>
              ))}
              </ul>
            </div>
          )}
          <div className="fc-admin-block">
            <p className="film-club-admin-label">Magnet links for current film</p>
            {adminDownloadLinks.map((link, i) => (
              <div key={i} className="fc-admin-row">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => setAdminDownloadLinks((prev) => prev.map((l, j) => j === i ? { ...l, label: e.target.value } : l))}
                  placeholder="Size (e.g. 1080p)"
                  className="fc-admin-input fc-admin-input--label"
                />
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => setAdminDownloadLinks((prev) => prev.map((l, j) => j === i ? { ...l, url: e.target.value } : l))}
                  placeholder="https://…"
                  className="fc-admin-input fc-admin-input--url"
                />
                <button
                  onClick={() => setAdminDownloadLinks((prev) => prev.filter((_, j) => j !== i))}
                  className="film-club-btn film-club-btn-del fc-admin-drop"
                  aria-label="Remove link"
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setAdminDownloadLinks((prev) => [...prev, { label: '', url: '' }])}
              className="film-club-btn"
            >+ add link</button>
            <button
              onClick={handleAdminSaveDownloadLinks}
              disabled={downloadSaveStatus === 'saving'}
              className="film-club-btn film-club-btn-primary fc-admin-save"
            >
              {downloadSaveStatus === 'saving' ? 'Saving…' : 'Save download links'}
            </button>
            {downloadSaveStatus === 'saved' && (
              <p className="fc-msg fc-msg--good" role="status">saved.</p>
            )}
            {downloadSaveStatus === 'error' && (
              <p className="fc-msg fc-msg--bad" role="status">could not save.</p>
            )}
          </div>

          <div className="fc-admin-block">
            <p className="film-club-admin-label">Direct download links for current film</p>
            {adminDirectDownloadLinks.map((link, i) => (
              <div key={i} className="fc-admin-row">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => setAdminDirectDownloadLinks((prev) => prev.map((l, j) => j === i ? { ...l, label: e.target.value } : l))}
                  placeholder="Label (e.g. 1080p)"
                  className="fc-admin-input fc-admin-input--label"
                />
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => setAdminDirectDownloadLinks((prev) => prev.map((l, j) => j === i ? { ...l, url: e.target.value } : l))}
                  placeholder="https://…"
                  className="fc-admin-input fc-admin-input--url"
                />
                <button
                  onClick={() => setAdminDirectDownloadLinks((prev) => prev.filter((_, j) => j !== i))}
                  className="film-club-btn film-club-btn-del fc-admin-drop"
                  aria-label="Remove link"
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setAdminDirectDownloadLinks((prev) => [...prev, { label: '', url: '' }])}
              className="film-club-btn"
            >+ add link</button>
            <button
              onClick={handleAdminSaveDirectDownloadLinks}
              disabled={directDownloadSaveStatus === 'saving'}
              className="film-club-btn film-club-btn-primary fc-admin-save"
            >
              {directDownloadSaveStatus === 'saving' ? 'Saving…' : 'Save direct download links'}
            </button>
            {directDownloadSaveStatus === 'saved' && (
              <p className="fc-msg fc-msg--good" role="status">saved.</p>
            )}
            {directDownloadSaveStatus === 'error' && (
              <p className="fc-msg fc-msg--bad" role="status">could not save.</p>
            )}
          </div>

          <div className="fc-admin-block">
            <p className="film-club-admin-label">Description for current film</p>
            <textarea
              value={adminDescription}
              onChange={(e) => { setAdminDescription(e.target.value); setDescriptionSaveStatus('idle'); }}
              placeholder="Add context or notes about this month's film…"
              rows={4}
              className="fc-admin-input fc-admin-input--area"
            />
            <button
              onClick={handleAdminSaveDescription}
              disabled={descriptionSaveStatus === 'saving'}
              className="film-club-btn film-club-btn-primary fc-admin-save"
            >
              {descriptionSaveStatus === 'saving' ? 'Saving…' : 'Save description'}
            </button>
            {descriptionSaveStatus === 'saved' && (
              <p className="fc-msg fc-msg--good" role="status">saved.</p>
            )}
            {descriptionSaveStatus === 'error' && (
              <p className="fc-msg fc-msg--bad" role="status">could not save.</p>
            )}
          </div>

          {isRevealPhase && monthData?.nextFilm && (
            <div className="fc-admin-block">
              <p className="film-club-admin-label">Description for next month's film ({nextMonthName})</p>
              <textarea
                value={adminNextDescription}
                onChange={(e) => { setAdminNextDescription(e.target.value); setNextDescriptionSaveStatus('idle'); }}
                placeholder={`Add context or notes about ${nextMonthName}'s film…`}
                rows={4}
                className="fc-admin-input fc-admin-input--area"
              />
              <button
                onClick={handleAdminSaveNextDescription}
                disabled={nextDescriptionSaveStatus === 'saving'}
                className="film-club-btn film-club-btn-primary fc-admin-save"
              >
                {nextDescriptionSaveStatus === 'saving' ? 'Saving…' : 'Save description'}
              </button>
              {nextDescriptionSaveStatus === 'saved' && (
                <p className="fc-msg fc-msg--good" role="status">saved.</p>
              )}
              {nextDescriptionSaveStatus === 'error' && (
                <p className="fc-msg fc-msg--bad" role="status">could not save.</p>
              )}
            </div>
          )}

          {monthData?.currentFilm && (
            <div className="fc-admin-block">
              <p className="film-club-admin-label">Clear current film</p>
              <button
                onClick={handleAdminClearCurrentFilm}
                disabled={clearFilmStatus === 'clearing'}
                className="film-club-btn film-club-btn-del"
              >
                {clearFilmStatus === 'clearing' ? 'Clearing…' : 'Clear current film'}
              </button>
              {clearFilmStatus === 'error' && (
                <p className="fc-msg fc-msg--bad" role="status">could not clear.</p>
              )}
            </div>
          )}

          <p className="film-club-admin-label">Set currently playing film</p>
          <FilmSearchBox onFilmSelect={handleAdminSetCurrentFilm} />
          {adminFilmSelection && (
            <div className="fc-admin-preview">
              <FilmCard
                posterPath={adminFilmSelection.posterPath}
                title={adminFilmSelection.title}
                releaseYear={adminFilmSelection.releaseYear}
              />
              <button
                onClick={handleAdminSave}
                disabled={adminSaveStatus === 'saving'}
                className="film-club-btn film-club-btn-primary fc-admin-save"
              >
                {adminSaveStatus === 'saving' ? 'Saving…' : 'Set as current film'}
              </button>
              {adminSaveStatus === 'saved' && (
                <p className="fc-msg fc-msg--good" role="status">saved.</p>
              )}
              {adminSaveStatus === 'error' && (
                <p className="fc-msg fc-msg--bad" role="status">could not save.</p>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default FilmClub;
