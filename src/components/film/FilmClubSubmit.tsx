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
      const { username, hasUsername } = await getUserData(user.uid);
      // A submission carries the submitter's name, which the rules match
      // against the profile — no name on the profile, no submission.
      if (!hasUsername) {
        setErrorMsg('Set a username on your profile before submitting a film.');
        setStatus('error');
        return;
      }
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

  const canSubmit = !hasSubmissions || isAdmin;

  return (
    <div className="film-club-container">

      {!loadingSubmissions && hasSubmissions && (
        <div className="film-club-section">
          <h2 className="fc-h">
            <span className="fc-h-label">your picks</span>
            <span className="fc-h-rule" aria-hidden="true"></span>
            <span className="fc-h-note">for {targetMonthName.toLowerCase()}</span>
          </h2>
          <a href="/film-club" className="links">← back to film club</a>
          <div className="fc-submit-cards">
            {userSubmissions.map((s) => (
              <FilmCard
                key={s.title}
                posterPath={s.posterPath}
                title={s.title}
                releaseYear={s.releaseYear}
                overview={s.overview}
                pitch={s.pitch}
                submittedByUsername={s.username}
              />
            ))}
          </div>
        </div>
      )}

      {canSubmit && (
        /* The one band on the page that is typed into rather than read. */
        <div className="film-club-section fc-submit-band">
          <h2 className="fc-h">
            <span className="fc-h-label">{hasSubmissions ? 'another film' : 'your pick'}</span>
            <span className="fc-h-rule" aria-hidden="true"></span>
            <span className="fc-h-note">for {targetMonthName.toLowerCase()}</span>
          </h2>

          {!loadingSubmissions && !hasSubmissions && (
            <>
              <a href="/film-club" className="links">← back to film club</a>
              <p className="normal-text">
                Choose a film, write why you think the group should watch it, and submit it for {targetMonthName}.
              </p>
            </>
          )}

          <FilmSearchBox onFilmSelect={handleFilmSelect} />

          {selectedFilm && (
            <FilmCard
              posterPath={selectedFilm.posterPath}
              title={selectedFilm.title}
              releaseYear={selectedFilm.releaseYear}
              overview={selectedFilm.overview}
            />
          )}

          {selectedFilm && status !== 'success' && (
            <div className="fc-submit-pitch">
              <span className="fc-submit-label">why this film?</span>
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
              className="film-club-btn film-club-btn-primary fc-submit-send"
            >
              {status === 'submitting' ? 'submitting…' : 'submit film'}
            </button>
          )}

          {status === 'success' && (
            <p className="fc-msg fc-msg--good" role="status">film submitted.</p>
          )}

          {status === 'error' && (
            <p className="fc-msg fc-msg--bad" role="status">{errorMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default FilmClubSubmit;
