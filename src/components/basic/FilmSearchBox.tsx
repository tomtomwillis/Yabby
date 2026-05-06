import React, { useEffect, useState } from 'react';
import { TMDB } from '@tdanks2000/tmdb-wrapper';
import './FilmSearchBox.css';

export interface FilmResult {
  id: number;
  title: string;
  releaseYear: string;
  posterPath: string | null;
  overview: string;
}

interface FilmSearchBoxProps {
  placeholder?: string;
  onFilmSelect: (film: FilmResult) => void;
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w92';

const tmdb = new TMDB({ apiKey: import.meta.env.VITE_TMDB_API_KEY });

const FilmSearchBox: React.FC<FilmSearchBoxProps> = ({
  placeholder = 'Search for a film...',
  onFilmSelect,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<FilmResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');

  const fetchFilmResults = async (query: string): Promise<FilmResult[]> => {
    setSearchStatus('Searching...');
    try {
      const response = await tmdb.search.movies({ query });
      const movies = (response as any).results ?? [];

      if (movies.length === 0) {
        setSearchStatus('No films found');
      } else {
        setSearchStatus('');
      }

      return movies.slice(0, 6).map((m: any) => ({
        id: m.id,
        title: m.title,
        releaseYear: m.release_date ? m.release_date.slice(0, 4) : '',
        posterPath: m.poster_path ?? null,
        overview: m.overview ?? '',
      }));
    } catch (error) {
      console.error('TMDB search error:', error);
      setSearchStatus('Search failed');
      return [];
    }
  };

  useEffect(() => {
    const trimmed = inputValue.trim();

    if (!trimmed || trimmed.length < 3) {
      setResults([]);
      setIsSearching(false);
      setSearchStatus('');
      return;
    }

    setIsSearching(true);
    const timeoutId = setTimeout(() => {
      fetchFilmResults(trimmed).then((r) => {
        setResults(r);
        setIsSearching(false);
      });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [inputValue]);

  const handleSelect = (film: FilmResult) => {
    onFilmSelect(film);
    setInputValue('');
    setResults([]);
    setIsSearching(false);
    setSearchStatus('');
  };

  return (
    <div className="film-search-container">
      <div className="film-search-input-area">
        <input
          type="text"
          className="film-search-input"
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
      </div>

      {isSearching && searchStatus && (
        <p className="film-search-status">{searchStatus}</p>
      )}

      {!isSearching && searchStatus && (
        <p className="film-search-status">{searchStatus}</p>
      )}

      {results.length > 0 && (
        <div className="film-search-results">
          <ul>
            {results.map((film) => (
              <li key={film.id}>
                <button
                  className="film-result-button"
                  onClick={() => handleSelect(film)}
                >
                  {film.posterPath ? (
                    <img
                      src={`${TMDB_IMAGE_BASE}${film.posterPath}`}
                      alt={film.title}
                      className="film-result-poster"
                    />
                  ) : (
                    <div className="film-result-poster-placeholder" />
                  )}
                  <div className="film-result-info">
                    <span className="film-result-title">{film.title}</span>
                    {film.releaseYear && (
                      <span className="film-result-year">{film.releaseYear}</span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FilmSearchBox;
