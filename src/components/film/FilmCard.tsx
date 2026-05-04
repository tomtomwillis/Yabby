import React, { useState } from 'react';
import './FilmCard.css';

function truncateWords(text: string, limit: number): string {
  const words = text.split(/\s+/);
  if (words.length <= limit) return text;
  return words.slice(0, limit).join(' ') + '…';
}

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
  downloadLinks?: { label: string; url: string }[];
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
  downloadLinks,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (url: string, index: number) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  return (
    <div className="film-card">
      {(label || leaveDate) && (
        <div className="film-card-label-row">
          {label && <span className="film-card-label">{label}</span>}
          {leaveDate && <span className="film-card-label">leaving {leaveDate}</span>}
        </div>
      )}
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
          {overview && (
            <p className="film-card-overview">
              {window.innerWidth <= 480 ? truncateWords(overview, 15) : overview}
            </p>
          )}
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

          {downloadLinks && downloadLinks.some((l) => l.url) && (
            <div className="film-card-download-row" style={{ marginTop: '0.75rem' }}>
              <span className="film-card-download-label">Magnet link for download:</span>
              <div className="film-card-download-buttons">
                {downloadLinks.filter((l) => l.url).map((l, i) => (
                  <button key={i} onClick={() => handleCopy(l.url, i)} className="film-club-btn film-club-btn-secondary">
                    {copiedIndex === i ? 'Copied!' : (l.label || 'Download')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilmCard;
