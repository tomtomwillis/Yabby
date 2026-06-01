import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { getCurrentMonthId } from '../../utils/useFilmClub';
import './HomepageFilmClub.css';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';
const CACHE_TTL = 60 * 60 * 1000;

interface FilmData {
  title: string;
  releaseYear: string;
  posterPath: string | null;
  overview: string;
  pitch: string;
  submittedByUsername: string;
}

function truncate(text: string, limit: number): string {
  const words = text.split(/\s+/);
  if (words.length <= limit) return text;
  return words.slice(0, limit).join(' ') + '…';
}

function getLeavingDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long',
  });
}

function HomepageFilmClub() {
  const monthId = getCurrentMonthId();
  const cacheKey = `filmclub_${monthId}`;
  const [film, setFilm] = useState<FilmData | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { data, cachedAt } = JSON.parse(cached);
        if (Date.now() - cachedAt < CACHE_TTL) {
          setFilm(data);
          return;
        }
      } catch { /* stale or corrupt cache */ }
    }

    getDoc(doc(db, 'filmClub', monthId)).then((snap) => {
      if (!snap.exists()) return;
      const currentFilm = snap.data()?.currentFilm as FilmData | undefined;
      if (!currentFilm) return;
      setFilm(currentFilm);
      localStorage.setItem(cacheKey, JSON.stringify({ data: currentFilm, cachedAt: Date.now() }));
    }).catch(console.error);
  }, [monthId, cacheKey]);

  if (!film) return null;

  return (
    <div className="homepage-film-club">
      <div className="homepage-film-club-inner">
        <div className="homepage-film-club-poster-col">
          <span className="homepage-film-club-now-watching">Now watching</span>
          {film.posterPath ? (
            <img
              src={`${TMDB_IMAGE_BASE}${film.posterPath}`}
              alt={film.title}
              className="homepage-film-club-poster"
              loading="lazy"
            />
          ) : (
            <div className="homepage-film-club-poster-placeholder" />
          )}
        </div>
        <div className="homepage-film-club-info">
          <p className="homepage-film-club-title">
            {film.title}
            {film.releaseYear && <span className="homepage-film-club-year"> ({film.releaseYear})</span>}
          </p>
          <p className="homepage-film-club-meta">Leaving {getLeavingDate()}</p>
          {film.submittedByUsername && (
            <p className="homepage-film-club-meta">submitted by {film.submittedByUsername}</p>
          )}
          {film.pitch && (
            <p className="homepage-film-club-pitch">"{truncate(film.pitch, 20)}"</p>
          )}
          {film.overview && (
            <p className="homepage-film-club-overview">{truncate(film.overview, 20)}</p>
          )}
          <div className="homepage-film-club-btn-row">
            <Link to="/filmclubmessage" className="homepage-film-club-btn">
              Film Club Messageboard
            </Link>
            <Link to="/film-club-vote" className="homepage-film-club-btn">
              Vote next months film
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomepageFilmClub;
