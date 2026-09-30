import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { getCurrentMonthId, getPrevMonthId } from '../../utils/useFilmClub';
import './HomeFilmClub.css';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';
const DAY_MS = 86_400_000;

interface FilmData {
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
}

function daysFrom(today: Date, target: Date): number {
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

function inDays(n: number): string {
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

/** Mirrors useFilmClub's schedule: the film changes on the 1st, and voting for
 *  next month closes five days before the end of this one. In those last five
 *  days, voting is already open for the month after. */
function schedule() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const y = today.getFullYear();
  const m = today.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const isRevealPhase = lastDay - today.getDate() < 5;
  const voteMonth = isRevealPhase ? m + 1 : m;
  const voteDeadline = new Date(y, voteMonth, new Date(y, voteMonth + 1, 0).getDate() - 5);
  return {
    isRevealPhase,
    daysToNewFilm: daysFrom(today, new Date(y, m + 1, 1)),
    daysToVote: daysFrom(today, voteDeadline),
    voteForName: new Date(y, voteMonth + 1, 1).toLocaleDateString('en-GB', { month: 'long' }),
    // Matches FilmClub's vote link, which names the month once this one's vote has closed.
    voteLink: isRevealPhase
      ? `/film-club-vote?month=${y + Math.floor((m + 1) / 12)}-${String(((m + 1) % 12) + 1).padStart(2, '0')}`
      : '/film-club-vote',
  };
}

/** This month's film at a glance. One read, or two when the month doc has not
 *  yet had last month's winner promoted into it. */
const HomeFilmClub: React.FC = () => {
  const [film, setFilm] = useState<FilmData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [{ isRevealPhase, daysToNewFilm, daysToVote, voteForName, voteLink }] = useState(schedule);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, 'filmClub', getCurrentMonthId()));
      let current = (snap.data() as MonthDoc | undefined)?.currentFilm ?? null;
      if (!current) {
        const prev = await getDoc(doc(db, 'filmClub', getPrevMonthId()));
        current = (prev.data() as MonthDoc | undefined)?.nextFilm ?? null;
      }
      if (cancelled) return;
      setFilm(current);
      setStatus('ready');
    })().catch(() => {
      if (!cancelled) setStatus('failed');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') return <p className="hp-note">finding the film…</p>;
  if (status === 'failed') return <p className="hp-note">couldn't reach the film club.</p>;

  const track = (link: string) => window.umami?.track('home_film_club_link', { link });

  return (
    <div className="home-film">
      {film ? (
        <div className="hf-film">
          {film.posterPath && (
            <img
              className="hf-poster"
              src={`${TMDB_IMAGE_BASE}${film.posterPath}`}
              alt={`${film.title} poster`}
              loading="lazy"
            />
          )}
          <div className="hf-body">
            <Link className="hf-title" to="/film-club" onClick={() => track('film')}>
              {film.title}
              {film.releaseYear && <span className="hf-year"> ({film.releaseYear})</span>}
            </Link>
            {film.submittedByUsername && (
              <span className="hf-meta">chosen by {film.submittedByUsername}</span>
            )}
            {film.pitch && <blockquote className="hf-pitch">“{film.pitch}”</blockquote>}
            {film.overview && <p className="hf-overview">{film.overview}</p>}
          </div>
        </div>
      ) : (
        <p className="hp-note">no film picked for this month yet.</p>
      )}

      <p className="hf-meta">
        new film {inDays(daysToNewFilm)}
        {' · '}
        {isRevealPhase ? `voting for ${voteForName.toLowerCase()} closes ` : 'voting closes '}
        {inDays(daysToVote)}
      </p>

      <p className="hf-links">
        <Link className="hf-link" to="/film-club-submit" onClick={() => track('submit')}>
          submit a film
        </Link>
        <span aria-hidden="true"> · </span>
        <Link className="hf-link" to={voteLink} onClick={() => track('vote')}>
          vote
        </Link>
        <span aria-hidden="true"> · </span>
        <Link className="hf-link" to="/filmclubmessage" onClick={() => track('messageboard')}>
          message board
        </Link>
      </p>
    </div>
  );
};

export default HomeFilmClub;
