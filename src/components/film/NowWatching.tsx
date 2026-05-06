import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { getCurrentMonthId } from '../../utils/useFilmClub';
import FilmCard from './FilmCard';
import './FilmClub.css';

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
  downloadLinks?: { label: string; url: string }[];
  directDownloadLinks?: { label: string; url: string }[];
  currentFilmDescription?: string;
}

function getLeavingDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long',
  });
}

function NowWatching() {
  const monthId = getCurrentMonthId();
  const leavingDate = getLeavingDate();
  const [monthData, setMonthData] = useState<MonthDoc | null>(null);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);

  useEffect(() => {
    getDoc(doc(db, 'filmClub', monthId)).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as MonthDoc & { downloadLinks?: unknown };
      if (data.downloadLinks && !Array.isArray(data.downloadLinks)) {
        const old = data.downloadLinks as Record<string, string>;
        data.downloadLinks = (['small', 'medium', 'large'] as const)
          .filter((k) => old[k])
          .map((k) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), url: old[k] }));
      }
      setMonthData(data as MonthDoc);
    }).catch(console.error);
  }, [monthId]);

  useEffect(() => {
    const tmdbId = monthData?.currentFilm?.tmdbId;
    if (!tmdbId) return;
    fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${import.meta.env.VITE_TMDB_API_KEY}`)
      .then((r) => r.json())
      .then((data) => {
        const trailer = (data.results ?? []).find(
          (v: { type: string; site: string; key: string }) => v.type === 'Trailer' && v.site === 'YouTube'
        );
        setTrailerUrl(trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null);
      })
      .catch(() => setTrailerUrl(null));
  }, [monthData?.currentFilm?.tmdbId]);

  if (!monthData?.currentFilm) return null;

  const { currentFilm, downloadLinks, directDownloadLinks, currentFilmDescription } = monthData;

  return (
    <div className="film-club-container">
      <FilmCard
        label="Now watching"
        posterPath={currentFilm.posterPath}
        title={currentFilm.title}
        releaseYear={currentFilm.releaseYear}
        overview={currentFilm.overview || undefined}
        pitch={currentFilm.pitch || undefined}
        submittedByUsername={currentFilm.submittedByUsername || undefined}
        leaveDate={leavingDate}
        trailerUrl={trailerUrl ?? undefined}
        downloadLinks={downloadLinks}
        directDownloadLinks={directDownloadLinks}
        description={currentFilmDescription || undefined}
      />
    </div>
  );
}

export default NowWatching;
