import { useState, useEffect } from 'react';
import { doc, setDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { getUserData } from '../utils/userCache';
import Header from '../components/basic/Header';
import FilmSearchBox from '../components/basic/FilmSearchBox';
import type { FilmResult } from '../components/basic/FilmSearchBox';
import FilmCard from '../components/FilmCard';
import TextBox from '../components/basic/MessageTextBox';
import '../App.css';

function getMonthId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

interface ExistingSubmission {
  userId: string;
  title: string;
  releaseYear: string;
  posterPath: string | null;
  overview: string;
  pitch: string;
  username: string;
}

function FilmClubSubmit() {
  const [existingSubmissions, setExistingSubmissions] = useState<ExistingSubmission[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [selectedFilm, setSelectedFilm] = useState<FilmResult | null>(null);
  const [pitch, setPitch] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const monthId = getMonthId();

  // Load all submissions for this user this month
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) { setLoadingExisting(false); return; }

    getDocs(collection(db, 'filmClub', monthId, 'submissions')).then((snap) => {
      const mine: ExistingSubmission[] = [];
      snap.forEach((d) => {
        const data = d.data() as ExistingSubmission;
        if (data.userId === user.uid) mine.push(data);
      });
      setExistingSubmissions(mine);
      setLoadingExisting(false);
    }).catch(() => setLoadingExisting(false));
  }, [monthId]);

  const handleFilmSelect = (film: FilmResult) => {
    setSelectedFilm(film);
    setPitch('');
    setStatus('idle');
    setErrorMsg('');
  };

  const handleSubmit = async () => {
    if (!selectedFilm) return;

    const user = auth.currentUser;
    if (!user) {
      setErrorMsg('You must be logged in to submit.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    try {
      const { username } = await getUserData(user.uid);
      const newSub: ExistingSubmission = {
        userId: user.uid,
        username,
        title: selectedFilm.title,
        releaseYear: selectedFilm.releaseYear,
        posterPath: selectedFilm.posterPath,
        overview: selectedFilm.overview,
        pitch: pitch.trim(),
      };
      const data = { ...newSub, tmdbId: selectedFilm.id, timestamp: serverTimestamp() };
      const docId = `${user.uid}_${selectedFilm.id}`;
      await setDoc(doc(db, 'filmClub', monthId, 'submissions', docId), data);
      setExistingSubmissions((prev) => {
        const without = prev.filter((s) => s.title !== newSub.title);
        return [...without, newSub];
      });
      setStatus('success');
      setSelectedFilm(null);
      setPitch('');
    } catch (err) {
      console.error('Submit error:', err);
      setErrorMsg('Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  const now = new Date();
  const monthName = now.toLocaleDateString('en-GB', { month: 'long' });
  const nextMonthName = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-GB', { month: 'long' });
  const hasSubmissions = existingSubmissions.length > 0;

  return (
    <div className="app-container">
      <Header title="Film Club" subtitle="submit a film" />

      <div style={{ width: '100%', maxWidth: '600px', padding: '0 1rem', boxSizing: 'border-box' }}>

        <a href="/film-club" className="links" style={{ fontSize: '1rem' }}>← back to film club</a>

        {!loadingExisting && hasSubmissions && status !== 'success' && (
          <>
            <p className="normal-text">
              Your submission{existingSubmissions.length > 1 ? 's' : ''} for {nextMonthName}:
            </p>
            {existingSubmissions.map((s) => (
              <div key={s.title} style={{ marginTop: '0.75rem' }}>
                <FilmCard
                  posterPath={s.posterPath}
                  title={s.title}
                  releaseYear={s.releaseYear}
                  overview={s.overview}
                  pitch={s.pitch}
                  submittedByUsername={s.username}
                />
              </div>
            ))}
            <p className="normal-text" style={{ marginTop: '1.5rem' }}>
              Submit another film:
            </p>
          </>
        )}

        {!loadingExisting && !hasSubmissions && (
          <p className="normal-text">
            Choose a film, write why you think the group should watch it, and submit it for {monthName}'s vote.
          </p>
        )}

        <FilmSearchBox onFilmSelect={handleFilmSelect} />

        {selectedFilm && (
          <div style={{ marginTop: '1.5rem' }}>
            <FilmCard
              posterPath={selectedFilm.posterPath}
              title={selectedFilm.title}
              releaseYear={selectedFilm.releaseYear}
              overview={selectedFilm.overview}
            />
          </div>
        )}

        {selectedFilm && status !== 'success' && (
          <div style={{ marginTop: '1rem' }}>
            <p className="normal-text" style={{ marginBottom: '0.5rem' }}>Why this film?</p>
            <TextBox
              placeholder="Tell everyone why you picked this film..."
              value={pitch}
              onChange={setPitch}
              showSendButton={false}
              maxWords={150}
              maxChars={600}
            />
          </div>
        )}

        {selectedFilm && status !== 'success' && (
          <button
            onClick={handleSubmit}
            disabled={status === 'submitting'}
            style={{
              marginTop: '1rem',
              padding: '0.6rem 1.4rem',
              backgroundColor: 'var(--colour2)',
              color: 'var(--colour4)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontFamily: 'var(--font2)',
              cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'submitting' ? 'Submitting...' : 'Submit film'}
          </button>
        )}

        {status === 'success' && (
          <p className="normal-text" style={{ color: 'var(--colour1)', marginTop: '1rem' }}>
            Film submitted!
          </p>
        )}

        {status === 'error' && (
          <p className="normal-text" style={{ color: 'var(--colour3)', marginTop: '1rem' }}>
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  );
}

export default FilmClubSubmit;
