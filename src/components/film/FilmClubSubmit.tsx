import { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../firebaseConfig';
import { getUserData } from '../../utils/userCache';
import { useAdmin } from '../../utils/useAdmin';
import { useFilmClub } from '../../utils/useFilmClub';
import FilmSearchBox from '../basic/FilmSearchBox';
import type { FilmResult } from '../basic/FilmSearchBox';
import FilmCard from './FilmCard';
import TextBox from '../basic/MessageTextBox';

function FilmClubSubmit() {
  const { isAdmin } = useAdmin();
  const { submitMonthId, userSubmissions, loadingSubmissions } = useFilmClub();

  const [selectedFilm, setSelectedFilm] = useState<FilmResult | null>(null);
  const [pitch, setPitch] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const [midYear, midMonth] = submitMonthId.split('-').map(Number);
  const targetMonthName = new Date(midYear, midMonth, 1).toLocaleDateString('en-GB', { month: 'long' });
  const hasSubmissions = userSubmissions.length > 0;

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
      const data = {
        userId: user.uid,
        username,
        title: selectedFilm.title,
        releaseYear: selectedFilm.releaseYear,
        posterPath: selectedFilm.posterPath,
        overview: selectedFilm.overview,
        pitch: pitch.trim(),
        tmdbId: selectedFilm.id,
        timestamp: serverTimestamp(),
      };
      const docId = `${user.uid}_${selectedFilm.id}`;
      await setDoc(doc(db, 'filmClub', submitMonthId, 'submissions', docId), data);
      setSelectedFilm(null);
      setPitch('');
      window.location.href = '/film-club';
    } catch (err) {
      console.error('Submit error:', err);
      setErrorMsg('Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '600px', padding: '0 1rem', boxSizing: 'border-box' }}>

      <a href="/film-club" className="links" style={{ fontSize: '1rem' }}>← back to film club</a>

      {!loadingSubmissions && hasSubmissions && (
        <>
          <p className="normal-text">
            Your submission{userSubmissions.length > 1 ? 's' : ''} for {targetMonthName}:
          </p>
          {userSubmissions.map((s) => (
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
          {isAdmin && (
            <p className="normal-text" style={{ marginTop: '1.5rem' }}>
              Submit another film:
            </p>
          )}
        </>
      )}

      {!loadingSubmissions && !hasSubmissions && (
        <p className="normal-text">
          Choose a film, write why you think the group should watch it, and submit it for {targetMonthName}.
        </p>
      )}

      {(!hasSubmissions || isAdmin) && <FilmSearchBox onFilmSelect={handleFilmSelect} />}

      {selectedFilm && (!hasSubmissions || isAdmin) && (
        <div style={{ marginTop: '1.5rem' }}>
          <FilmCard
            posterPath={selectedFilm.posterPath}
            title={selectedFilm.title}
            releaseYear={selectedFilm.releaseYear}
            overview={selectedFilm.overview}
          />
        </div>
      )}

      {selectedFilm && (!hasSubmissions || isAdmin) && status !== 'success' && (
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

      {selectedFilm && (!hasSubmissions || isAdmin) && status !== 'success' && (
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
  );
}

export default FilmClubSubmit;
