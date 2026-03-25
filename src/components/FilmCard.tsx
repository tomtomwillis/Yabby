import React from 'react';
import './FilmCard.css';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

interface FilmCardProps {
  posterPath: string | null;
  title: string;
  releaseYear: string;
  overview?: string;
  pitch?: string;
  submittedByUsername?: string;
  label?: string;
  leaveDate?: string;
  trailerUrl?: string;
}

const FilmCard: React.FC<FilmCardProps> = ({
  posterPath,
  title,
  releaseYear,
  overview,
  pitch,
  submittedByUsername,
  label,
  leaveDate,
  trailerUrl,
}) => {
  return (
    <div className="film-card">
      {label && <p className="film-card-label">{label}</p>}
      <div className="film-card-inner">
        {posterPath ? (
          <img
            src={`${TMDB_IMAGE_BASE}${posterPath}`}
            alt={title}
            className="film-card-poster"
          />
        ) : (
          <div className="film-card-poster-placeholder" />
        )}
        <div className="film-card-info">
          <p className="film-card-title">
            {title} {releaseYear && <span className="film-card-year">({releaseYear})</span>}
          </p>
          {pitch && <p className="film-card-pitch">"{pitch}"</p>}
          {submittedByUsername && (
            <p className="film-card-submitted-by">submitted by {submittedByUsername}</p>
          )}
          {overview && <p className="film-card-overview">{overview}</p>}
          {trailerUrl && (
            <a
              href={trailerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="film-card-trailer-link"
            >
              ▶ Play trailer
            </a>
          )}
          {leaveDate && (
            <p className="film-card-leave-date">leaving {leaveDate}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilmCard;
