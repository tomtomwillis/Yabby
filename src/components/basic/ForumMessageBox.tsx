import React, { useEffect, useState, useRef } from 'react';
import './ForumMessageBox.css';
import Button from './Button';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { trackedGetDocs as getDocs } from '../../utils/firestoreMetrics';

interface Result {
  id: string;
  name: string;
  type: 'artist' | 'album' | 'list' | 'playlist' | 'place' | 'city' | 'instant' | 'travel';
}

type SearchCommand = 'list' | 'playlist' | 'travel' | 'city';
type SlashMode = 'command' | SearchCommand | null;

const INSTANT_COMMANDS: Record<string, { label: string; path: string }> = {
  filmclub: { label: 'Film Club', path: '/film-club' },
  radio:    { label: 'Radio',     path: '/radio' },
  news:     { label: 'News',      path: '/news' },
  stickers: { label: 'Stickers',  path: '/stickers' },
  wiki:     { label: 'Wiki',      path: '/wiki' },
};

const SEARCH_COMMANDS: readonly SearchCommand[] = ['list', 'playlist', 'travel', 'city'];

const SEARCH_COMMAND_LABELS: Record<SearchCommand, string> = {
  list:     'search lists',
  playlist: 'search public playlists',
  travel:   'search a travel rec',
  city:     'search a list of filtered recs for a city',
};

const SLASH_MODE_LABELS: Record<SearchCommand, string> = {
  list:     'Lists',
  playlist: 'Playlists',
  travel:   'Places',
  city:     'Cities',
};

interface ForumMessageBoxProps {
  placeholder?: string;
  onSend?: (text: string) => void;
  disabled?: boolean;
  maxWords?: number;
  maxChars?: number;
  className?: string;
  showSendButton?: boolean;
  initialValue?: string;
  onImageAttach?: (file: File | null) => void;
}

const ForumBox: React.FC<ForumMessageBoxProps> = ({
  placeholder = "Type your message...",
  onSend,
  disabled = false,
  maxWords = 250,
  maxChars = 1000,
  className = '',
  showSendButton = true,
  initialValue = '',
  onImageAttach,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [artistResults, setArtistResults] = useState<Result[]>([]);
  const [albumResults, setAlbumResults] = useState<Result[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string>("");
  const [newMessage, setNewMessage] = useState(initialValue);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Slash command state
  const [slashMode, setSlashMode] = useState<SlashMode>(null);
  const [slashSearchTerm, setSlashSearchTerm] = useState('');
  const [slashResults, setSlashResults] = useState<Result[]>([]);

  // Lazy-loaded data for search commands
  const [allLists, setAllLists] = useState<Result[]>([]);
  const [allPlaces, setAllPlaces] = useState<{ id: string; displayName: string; city: string; cityKey: string }[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<Result[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const triggerPositionRef = useRef<number>(-1);
  const listsFetchPromiseRef = useRef<Promise<void> | null>(null);
  const placesFetchPromiseRef = useRef<Promise<void> | null>(null);
  const playlistsFetchPromiseRef = useRef<Promise<void> | null>(null);

  const API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
  const API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
  const SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
  const CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID;

  const ensureListsLoaded = (): Promise<void> => {
    if (listsFetchPromiseRef.current) return listsFetchPromiseRef.current;
    const p = (async () => {
      try {
        const listsQuery = query(
          collection(db, 'lists'),
          where('isPublic', '!=', false),
        );
        const snapshot = await getDocs(listsQuery);
        const lists: Result[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.title) {
            lists.push({ id: docSnap.id, name: data.title, type: 'list' as const });
          }
        });
        lists.sort((a, b) => a.name.localeCompare(b.name));
        setAllLists(lists);
      } catch (error) {
        console.error('Error fetching lists:', error);
        listsFetchPromiseRef.current = null;
      }
    })();
    listsFetchPromiseRef.current = p;
    return p;
  };

  const ensurePlacesLoaded = (): Promise<void> => {
    if (placesFetchPromiseRef.current) return placesFetchPromiseRef.current;
    const p = (async () => {
      try {
        const snapshot = await getDocs(collection(db, 'places'));
        const places: { id: string; displayName: string; city: string; cityKey: string }[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.displayName) {
            places.push({
              id: docSnap.id,
              displayName: data.displayName,
              city: data.city || '',
              cityKey: data.cityKey || '',
            });
          }
        });
        setAllPlaces(places);
      } catch (error) {
        console.error('Error fetching places:', error);
        placesFetchPromiseRef.current = null;
      }
    })();
    placesFetchPromiseRef.current = p;
    return p;
  };

  const ensurePlaylistsLoaded = (): Promise<void> => {
    if (playlistsFetchPromiseRef.current) return playlistsFetchPromiseRef.current;
    const p = (async () => {
      try {
        const response = await fetch(
          `${SERVER_URL}/rest/getPlaylists?u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`,
          { headers: { Authorization: 'Basic ' + btoa(`${API_USERNAME}:${API_PASSWORD}`) } },
        );
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'application/xml');
        const playlists: Result[] = Array.from(xmlDoc.getElementsByTagName('playlist')).map((el) => ({
          id: el.getAttribute('id') || '',
          name: el.getAttribute('name') || 'Unknown Playlist',
          type: 'playlist' as const,
        }));
        setAllPlaylists(playlists);
      } catch (error) {
        console.error('Error fetching playlists:', error);
        playlistsFetchPromiseRef.current = null;
      }
    })();
    playlistsFetchPromiseRef.current = p;
    return p;
  };

  const fetchResults = async (queryStr: string): Promise<Result[][]> => {
    setSearchStatus("Searching...");
    const response = await fetch(
      `${SERVER_URL}/rest/search3?query=${queryStr}&artistCount=5&albumCount=5&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`,
      {
        headers: {
          Authorization: 'Basic ' + btoa(`${API_USERNAME}:${API_PASSWORD}`),
        },
      }
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'application/xml');

    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('XML parsing error: ' + parserError.textContent);
    }

    const subsonicResponse = xmlDoc.querySelector('subsonic-response');
    if (subsonicResponse?.getAttribute('status') === 'failed') {
      const errorElement = xmlDoc.querySelector('error');
      const errorMessage = errorElement?.getAttribute('message') || 'Unknown API error';
      throw new Error(`API Error: ${errorMessage}`);
    }

    const artistEls = Array.from(xmlDoc.getElementsByTagName('artist'));
    const albumEls = Array.from(xmlDoc.getElementsByTagName('album'));

    const albums: Result[] = albumEls.map((album) => ({
      id: album.getAttribute('id') || '',
      name: album.getAttribute('name') || 'Unknown Album',
      type: 'album' as const,
    })).slice(0, 3);

    const artists: Result[] = artistEls.map((artist) => ({
      id: artist.getAttribute('id') || '',
      name: artist.getAttribute('name') || 'Unknown Artist',
      type: 'artist' as const,
    })).slice(0, 3);

    if (albums.length === 0 && artists.length === 0) {
      setSearchStatus("No results :(");
    } else {
      setSearchStatus("Tag an artist or album!");
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([albums, artists]);
      }, 500);
    });
  };

  useEffect(() => {
    if (searchQuery.length >= 3) {
      setIsSearching(true);
      fetchResults(searchQuery).then((data) => {
        setAlbumResults(data[0]);
        setArtistResults(data[1]);
      });
    } else {
      setAlbumResults([]);
      setArtistResults([]);
    }
  }, [searchQuery]);

  // Reactive slash search filtering — runs when mode, term, or loaded data changes
  useEffect(() => {
    if (slashMode === null || slashMode === 'command') return;

    if (slashMode === 'list') {
      if (!slashSearchTerm.trim()) { setSlashResults([]); return; }
      const filtered = allLists
        .filter((l) => l.name.toLowerCase().includes(slashSearchTerm.toLowerCase()))
        .slice(0, 5);
      setSlashResults(filtered);
    } else if (slashMode === 'travel') {
      const filtered = allPlaces
        .filter((p) => !slashSearchTerm.trim() || p.displayName.toLowerCase().includes(slashSearchTerm.toLowerCase()))
        .slice(0, 5)
        .map((p) => ({ id: p.id, name: p.displayName, type: 'place' as const }));
      setSlashResults(filtered);
    } else if (slashMode === 'city') {
      const cityMap = new Map<string, string>();
      for (const p of allPlaces) {
        if (p.cityKey && !cityMap.has(p.cityKey)) {
          cityMap.set(p.cityKey, p.city || p.cityKey);
        }
      }
      const filtered = Array.from(cityMap.entries())
        .filter(([, label]) => !slashSearchTerm.trim() || label.toLowerCase().includes(slashSearchTerm.toLowerCase()))
        .sort(([, a], [, b]) => a.localeCompare(b))
        .slice(0, 8)
        .map(([cityKey, label]) => ({ id: cityKey, name: label, type: 'city' as const }));
      setSlashResults(filtered);
    } else if (slashMode === 'playlist') {
      if (!slashSearchTerm.trim()) { setSlashResults([]); return; }
      const filtered = allPlaylists
        .filter((p) => p.name.toLowerCase().includes(slashSearchTerm.toLowerCase()))
        .slice(0, 5);
      setSlashResults(filtered);
    }
  }, [slashMode, slashSearchTerm, allLists, allPlaces, allPlaylists]);

  const handleSend = () => {
    if ((newMessage.trim() || imagePreviewUrl) && onSend && !disabled) {
      onSend(newMessage.trim());
      setNewMessage('');
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
        setImagePreviewUrl(null);
        onImageAttach?.(null);
      }
      clearSearch();
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setIsSearching(false);
    setSlashMode(null);
    setSlashResults([]);
    setSlashSearchTerm('');
    triggerPositionRef.current = -1;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;

    if (value.length > maxChars) return;

    const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
    if (wordCount > maxWords) return;

    setNewMessage(value);

    if (!value.trim()) {
      clearSearch();
      return;
    }

    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const slashIndex = textBeforeCursor.lastIndexOf('/');

    // @ trigger (artists/albums) — must be at start or preceded by whitespace
    if (atIndex !== -1 && atIndex > slashIndex && (atIndex === 0 || /\s/.test(value[atIndex - 1]))) {
      const queryText = textBeforeCursor.slice(atIndex + 1);
      if (!/\n/.test(queryText)) {
        triggerPositionRef.current = atIndex;
        setSearchQuery(queryText);
        setIsSearching(true);
        setSlashMode(null);
        setSlashResults([]);
        setSlashSearchTerm('');
        return;
      }
    }

    // / trigger (slash commands) — must be at start or preceded by whitespace
    if (slashIndex !== -1 && slashIndex > atIndex && (slashIndex === 0 || /\s/.test(value[slashIndex - 1]))) {
      const afterSlash = textBeforeCursor.slice(slashIndex + 1);
      if (!/\n/.test(afterSlash)) {
        triggerPositionRef.current = slashIndex;
        const spaceIdx = afterSlash.indexOf(' ');
        const command = (spaceIdx === -1 ? afterSlash : afterSlash.slice(0, spaceIdx)).toLowerCase();
        const searchTerm = spaceIdx === -1 ? '' : afterSlash.slice(spaceIdx + 1);
        setSlashSearchTerm(searchTerm);
        setSearchQuery('');
        setIsSearching(false);

        if (spaceIdx === -1) {
          // No space yet — show matching command suggestions
          const instantMatches: Result[] = Object.entries(INSTANT_COMMANDS)
            .filter(([k]) => k.startsWith(command))
            .map(([k, v]) => ({ id: k, name: `/${k} — ${v.label}`, type: 'instant' as const }));
          const searchMatches: Result[] = SEARCH_COMMANDS
            .filter((k) => k.startsWith(command))
            .map((k) => ({ id: k, name: `/${k} — ${SEARCH_COMMAND_LABELS[k]}`, type: k as Result['type'] }));
          setSlashResults([...searchMatches, ...instantMatches]);
          setSlashMode('command');
        } else if (SEARCH_COMMANDS.includes(command as SearchCommand)) {
          setSlashMode(command as SearchCommand);
          // slashResults populated reactively by useEffect above
          if (command === 'list') ensureListsLoaded();
          if (command === 'travel' || command === 'city') ensurePlacesLoaded();
          if (command === 'playlist') ensurePlaylistsLoaded();
        } else if (Object.keys(INSTANT_COMMANDS).some((k) => k.startsWith(command))) {
          // Instant command typed with a trailing space
          const instantMatches: Result[] = Object.entries(INSTANT_COMMANDS)
            .filter(([k]) => k.startsWith(command))
            .map(([k, v]) => ({ id: k, name: `/${k} — ${v.label}`, type: 'instant' as const }));
          setSlashResults(instantMatches);
          setSlashMode('command');
        } else {
          setSlashMode(null);
          setSlashResults([]);
        }
        return;
      }
    }

    clearSearch();
  };

  const selectResult = (result: Result) => {
    let link: string;
    const linkText = result.type === 'instant' ? INSTANT_COMMANDS[result.id].label : result.name;

    if (result.type === 'instant') {
      link = `${window.location.origin}${INSTANT_COMMANDS[result.id].path}`;
    } else if (result.type === 'playlist') {
      link = `${SERVER_URL}/app/#/playlist/${result.id}/show`;
    } else if (result.type === 'place') {
      link = `${window.location.origin}/travel?place=${result.id}`;
    } else if (result.type === 'city') {
      link = `${window.location.origin}/travel?city=${result.id}`;
    } else if (result.type === 'list') {
      link = `${window.location.origin}/lists/${result.id}`;
    } else {
      link = `${SERVER_URL}/app/#/${result.type}/${result.id}/show`;
    }

    const triggerPos = triggerPositionRef.current;
    if (triggerPos === -1) return;

    const cursorPos = textareaRef.current?.selectionStart ?? newMessage.length;
    const replacement = `[${linkText}](${link}) `;
    const before = newMessage.slice(0, triggerPos);
    const after = newMessage.slice(cursorPos);
    const updatedMessage = before + replacement + after;

    setNewMessage(updatedMessage);
    clearSearch();

    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = triggerPos + replacement.length;
        textareaRef.current.focus();
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
      }
    }, 0);
  };

  // Clicking a search command suggestion activates that command's search mode
  const activateSearchCommand = (commandName: string) => {
    const triggerPos = triggerPositionRef.current;
    if (triggerPos === -1) return;
    const cursorPos = textareaRef.current?.selectionStart ?? newMessage.length;
    const inserted = `/${commandName} `;
    const updated = newMessage.slice(0, triggerPos) + inserted + newMessage.slice(cursorPos);
    setNewMessage(updated);

    const cmd = commandName as SearchCommand;
    setSlashMode(cmd);
    setSlashSearchTerm('');
    setSlashResults([]);

    if (cmd === 'list') ensureListsLoaded();
    if (cmd === 'travel' || cmd === 'city') ensurePlacesLoaded();
    if (cmd === 'playlist') ensurePlaylistsLoaded();

    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = triggerPos + inserted.length;
        textareaRef.current.focus();
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
      }
    }, 0);
  };

  const autoResize = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  };

  useEffect(() => {
    autoResize();
  }, [newMessage]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          alert('Image must be under 5 MB.');
          return;
        }
        if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
        setImagePreviewUrl(URL.createObjectURL(file));
        onImageAttach?.(file);
        return;
      }
    }
  };

  const removeImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    onImageAttach?.(null);
  };

  const wordCount = newMessage.trim() ? newMessage.trim().split(/\s+/).length : 0;
  const charCount = newMessage.length;
  const canSend = (newMessage.trim().length > 0 || !!imagePreviewUrl) && wordCount <= maxWords && charCount <= maxChars && !disabled;

  const isSlashSearchMode = slashMode !== null && slashMode !== 'command';
  const slashModeLabel = isSlashSearchMode ? SLASH_MODE_LABELS[slashMode as SearchCommand] : '';

  const slashEmptyHint = (() => {
    if (slashMode === 'list') return 'Type to search lists…';
    if (slashMode === 'playlist') return 'Type to search playlists…';
    if (slashMode === 'travel') return allPlaces.length === 0 ? 'Loading places…' : 'Type to search places…';
    if (slashMode === 'city') return allPlaces.length === 0 ? 'Loading cities…' : 'No cities found';
    return '';
  })();

  return (
    <div className={`textbox-container ${disabled ? 'disabled' : ''} ${className}`}>
      <div className="input-area">
        <textarea
          ref={textareaRef}
          className="text-input"
          value={newMessage}
          onChange={handleInputChange}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />
        {showSendButton && (
          <div className="send-button-container">
            <Button
              type="basic"
              label="Send"
              onClick={handleSend}
              size="2.5em"
              disabled={!canSend}
            />
          </div>
        )}
      </div>

      {imagePreviewUrl && (
        <div className="image-preview-container">
          <div className="image-preview-frame">
            <img src={imagePreviewUrl} alt="Attached image preview" className="image-preview" />
            <button className="image-preview-remove" onClick={removeImage} aria-label="Remove image">
              ✕
            </button>
          </div>
        </div>
      )}

      {isSearching && <p>{searchStatus}</p>}

      {artistResults.length > 0 && (
        <figure>
          <figcaption>Artists</figcaption>
          <ul style={{ marginTop: "10px", listStyleType: "none", padding: 0 }}>
            {artistResults.map((result, index) => (
              <li key={index}>
                <button onClick={() => selectResult(result)}>{result.name}</button>
              </li>
            ))}
          </ul>
        </figure>
      )}
      {albumResults.length > 0 && (
        <figure>
          <figcaption>Albums</figcaption>
          <ul style={{ marginTop: "10px", listStyleType: "none", padding: 0 }}>
            {albumResults.map((result, index) => (
              <li key={index}>
                <button onClick={() => selectResult(result)}>{result.name}</button>
              </li>
            ))}
          </ul>
        </figure>
      )}

      {slashMode === 'command' && slashResults.length > 0 && (
        <figure>
          <figcaption>Commands</figcaption>
          <ul style={{ marginTop: "10px", listStyleType: "none", padding: 0 }}>
            {slashResults.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() =>
                    r.type === 'instant' ? selectResult(r) : activateSearchCommand(r.id)
                  }
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        </figure>
      )}

      {isSlashSearchMode && (
        <figure>
          <figcaption>{slashModeLabel}</figcaption>
          {slashResults.length === 0 ? (
            <p>{slashEmptyHint}</p>
          ) : (
            <ul style={{ marginTop: "10px", listStyleType: "none", padding: 0 }}>
              {slashResults.map((r) => (
                <li key={r.id}>
                  <button onClick={() => selectResult(r)}>{r.name}</button>
                </li>
              ))}
            </ul>
          )}
        </figure>
      )}

      <div className="word-counter">
        {wordCount}/{maxWords} words | {charCount}/{maxChars} characters
      </div>
    </div>
  );
};

export default ForumBox;
