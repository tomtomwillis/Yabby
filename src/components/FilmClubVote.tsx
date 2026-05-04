import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import FilmCard from './FilmCard';
import './FilmClubVote.css';

function getMonthId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

interface Submission {
  submissionId: string; // Firestore doc ID: {userId}_{tmdbId}
  userId: string;
  username: string;
  title: string;
  releaseYear: string;
  posterPath: string | null;
  overview: string;
  pitch: string;
  tmdbId: number;
}

function FilmClubVote() {
  const params = new URLSearchParams(window.location.search);
  const monthId = params.get('month') ?? getMonthId();
  const userId = auth.currentUser?.uid ?? null;

  const [ranking, setRanking] = useState<Submission[]>([]);
  const [trailerUrls, setTrailerUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [votingClosed, setVotingClosed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // DnD state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggedIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const load = async () => {
      // Check if voting is closed
      const monthSnap = await getDoc(doc(db, 'filmClub', monthId));
      if (monthSnap.exists() && monthSnap.data().winnerCalculated) {
        setVotingClosed(true);
        setLoading(false);
        return;
      }

      // Load submissions
      const subsSnap = await getDocs(collection(db, 'filmClub', monthId, 'submissions'));
      const allSubs: Submission[] = [];
      subsSnap.forEach((d) => {
        allSubs.push({ submissionId: d.id, ...(d.data() as Omit<Submission, 'submissionId'>) });
      });

      const voteable = allSubs;

      // Load existing vote if any
      if (userId) {
        const voteSnap = await getDoc(doc(db, 'filmClub', monthId, 'votes', userId));
        if (voteSnap.exists()) {
          const savedRanking: string[] = voteSnap.data().ranking ?? [];
          // Reconstruct order from saved ranking, append any new submissions at the end
          const ordered: Submission[] = [];
          savedRanking.forEach((id) => {
            const found = voteable.find((s) => s.submissionId === id);
            if (found) ordered.push(found);
          });
          voteable.forEach((s) => {
            if (!ordered.find((o) => o.submissionId === s.submissionId)) ordered.push(s);
          });
          setRanking(ordered);
        } else {
          setRanking(voteable);
        }
      } else {
        setRanking(voteable);
      }

      // Fetch trailers in parallel
      const trailerMap: Record<string, string> = {};
      await Promise.all(allSubs.map(async (sub) => {
        try {
          const res = await fetch(
            `https://api.themoviedb.org/3/movie/${sub.tmdbId}/videos?api_key=${import.meta.env.VITE_TMDB_API_KEY}`
          );
          const data = await res.json();
          const trailer = (data.results ?? []).find(
            (v: { type: string; site: string; key: string }) => v.type === 'Trailer' && v.site === 'YouTube'
          );
          if (trailer) trailerMap[sub.submissionId] = `https://www.youtube.com/watch?v=${trailer.key}`;
        } catch { /* no trailer */ }
      }));
      setTrailerUrls(trailerMap);

      setLoading(false);
    };

    load().catch(console.error);
  }, [monthId, userId]);

  // DnD handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    draggedIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', '');
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = draggedIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newRanking = [...ranking];
    const [moved] = newRanking.splice(fromIndex, 1);
    newRanking.splice(dropIndex, 0, moved);
    setRanking(newRanking);
    setDraggedIndex(null);
    setDragOverIndex(null);
    draggedIndexRef.current = null;
    setSaveStatus('idle');
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    draggedIndexRef.current = null;
  };

  const moveItem = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= ranking.length) return;
    const newRanking = [...ranking];
    const [moved] = newRanking.splice(fromIndex, 1);
    newRanking.splice(toIndex, 0, moved);
    setRanking(newRanking);
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaveStatus('saving');
    try {
      await setDoc(doc(db, 'filmClub', monthId, 'votes', userId), {
        ranking: ranking.map((s) => s.submissionId),
        updatedAt: serverTimestamp(),
      });
      setSaveStatus('saved');
    } catch (err) {
      console.error('Vote save error:', err);
      setSaveStatus('error');
    }
  };

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const votingDeadlineDay = lastDay - 5;
  const votingDeadline = new Date(year, month - 1, votingDeadlineDay)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const [midYear, midMonth] = monthId.split('-').map(Number);
  const nextMonthName = new Date(midYear, midMonth, 1).toLocaleDateString('en-GB', { month: 'long' });

  if (loading) return null;

  if (votingClosed) {
    return (
      <div className="film-vote-container">
        <p className="normal-text">Voting for this month has closed.</p>
        <a href="/film-club" className="links" style={{ fontSize: '1rem' }}>← back to film club</a>
      </div>
    );
  }

  if (ranking.length === 0) {
    return (
      <div className="film-vote-container">
        <a href="/film-club" className="links" style={{ fontSize: '1rem' }}>← back to film club</a>
        <p className="normal-text">No films have been submitted yet. Be the first!</p>
        <a href="/film-club-submit" className="links" style={{ fontSize: '1rem' }}>submit a film</a>
      </div>
    );
  }

  const isMobile = window.innerWidth <= 480;

  return (
    <div className="film-vote-container">
      <a href="/film-club" className="links" style={{ fontSize: '1rem' }}>← back to film club</a>
      <p className="normal-text">
        {isMobile
          ? <>Use the arrows to rank the films for {nextMonthName}. Your top pick goes first. Voting closes <strong>{votingDeadline}</strong>.</>
          : <>Drag to rank the films for {nextMonthName}. Your top pick goes first. Voting closes <strong>{votingDeadline}</strong>.</>
        }
      </p>

      <button
        onClick={handleSave}
        disabled={saveStatus === 'saving'}
        className="film-vote-save-btn"
      >
        {saveStatus === 'saving' ? 'Saving...' : 'Save ranking'}
      </button>

      {saveStatus === 'saved' && (
        <p className="normal-text" style={{ color: 'var(--colour1)', marginTop: '0.5rem' }}>
          Ranking saved! You can update it any time before {votingDeadline}.
        </p>
      )}
      {saveStatus === 'error' && (
        <p className="normal-text" style={{ color: 'var(--colour3)', marginTop: '0.5rem' }}>
          Something went wrong. Please try again.
        </p>
      )}

      <div className="film-vote-list">
        {ranking.map((submission, index) => (
          <div
            key={submission.submissionId}
            className={`film-vote-item ${draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
            draggable={!isMobile}
            onDragStart={isMobile ? undefined : (e) => handleDragStart(e, index)}
            onDragEnd={isMobile ? undefined : handleDragEnd}
            onDragOver={isMobile ? undefined : (e) => handleDragOver(e, index)}
            onDragLeave={isMobile ? undefined : handleDragLeave}
            onDrop={isMobile ? undefined : (e) => handleDrop(e, index)}
          >
            <div className="film-vote-handle">
              <span className="film-vote-rank">#{index + 1}</span>
              {isMobile ? (
                <div className="film-vote-arrow-buttons">
                  <button
                    className="film-vote-arrow-btn"
                    onClick={() => moveItem(index, 'up')}
                    disabled={index === 0}
                    aria-label="Move up"
                  >▲</button>
                  <button
                    className="film-vote-arrow-btn"
                    onClick={() => moveItem(index, 'down')}
                    disabled={index === ranking.length - 1}
                    aria-label="Move down"
                  >▼</button>
                </div>
              ) : (
                <span className="film-vote-drag-icon">⠿</span>
              )}
            </div>
            <div className="film-vote-card">
              <FilmCard
                posterPath={submission.posterPath}
                title={submission.title}
                releaseYear={submission.releaseYear}
                overview={submission.overview}
                pitch={submission.pitch}
                submittedByUsername={submission.username}
                trailerUrl={trailerUrls[submission.submissionId]}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FilmClubVote;
