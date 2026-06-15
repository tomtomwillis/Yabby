import React, { useEffect, useState } from 'react';
import './AlbumSearchBox.css';
import Button from './Button';
import { fetchSubsonicXml } from '../../utils/navidrome';

interface AlbumResult {
  id: string;
  name: string;
  artist: string;
}

interface AlbumSearchBoxProps {
  placeholder?: string;
  onAlbumSelect: (albumId: string) => void;
  onUrlSubmit: (url: string) => void;
}

const AlbumSearchBox: React.FC<AlbumSearchBoxProps> = ({
  placeholder = "Search for an album or paste URL...",
  onAlbumSelect,
  onUrlSubmit,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [albumResults, setAlbumResults] = useState<AlbumResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string>('');

  const fetchAlbumResults = async (query: string): Promise<AlbumResult[]> => {
    setSearchStatus("Searching...");

    try {
      const xmlDoc = await fetchSubsonicXml('search3', { query, artistCount: 0, albumCount: 5 });

      const albumElements = Array.from(xmlDoc.getElementsByTagName('album'));

      const albums: AlbumResult[] = albumElements.map((album) => ({
        id: album.getAttribute('id') || '',
        name: album.getAttribute('name') || 'Unknown Album',
        artist: album.getAttribute('artist') || 'Unknown Artist',
      })).slice(0, 5);

      if (albums.length === 0) {
        setSearchStatus("No albums found");
      } else {
        setSearchStatus("");
      }

      return albums;
    } catch (error) {
      console.error('Search error:', error);
      setSearchStatus("Search failed");
      return [];
    }
  };

  useEffect(() => {
    const trimmedInput = inputValue.trim();

    // Don't search if input is empty or starts with https: (URL being pasted)
    if (!trimmedInput || trimmedInput.toLowerCase().startsWith('https:')) {
      setAlbumResults([]);
      setIsSearching(false);
      setSearchStatus('');
      return;
    }

    // Only search if input is 3+ characters
    if (trimmedInput.length >= 3) {
      setIsSearching(true);

      // Debounce search
      const timeoutId = setTimeout(() => {
        fetchAlbumResults(trimmedInput).then((results) => {
          setAlbumResults(results);
        });
      }, 300);

      return () => clearTimeout(timeoutId);
    } else {
      setAlbumResults([]);
      setIsSearching(false);
      setSearchStatus('');
    }
  }, [inputValue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleSend = () => {
    const trimmedInput = inputValue.trim();

    if (!trimmedInput) return;

    // Check if input is a URL
    if (trimmedInput.toLowerCase().startsWith('https:')) {
      onUrlSubmit(trimmedInput);
      setInputValue('');
      setAlbumResults([]);
    }
  };

  const handleAlbumClick = (albumId: string) => {
    onAlbumSelect(albumId);
    setInputValue('');
    setAlbumResults([]);
    setIsSearching(false);
    setSearchStatus('');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const isUrl = inputValue.trim().toLowerCase().startsWith('https:');
  const showSendButton = isUrl && inputValue.trim().length > 0;

  return (
    <div className="album-search-container">
      <div className="album-search-input-area">
        <input
          type="text"
          className="album-search-input"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
        />
        {showSendButton && (
          <div className="album-search-send-button">
            <Button
              type="basic"
              label="Go"
              onClick={handleSend}
              size="2.5em"
            />
          </div>
        )}
      </div>

      {isSearching && searchStatus && (
        <p className="album-search-status">{searchStatus}</p>
      )}

      {albumResults.length > 0 && (
        <div className="album-search-results">
          <ul>
            {albumResults.map((album) => (
              <li key={album.id}>
                <button
                  onClick={() => handleAlbumClick(album.id)}
                  className="album-result-button"
                >
                  <span className="album-result-name">{album.name}</span>
                  <span className="album-result-artist">{album.artist}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AlbumSearchBox;
