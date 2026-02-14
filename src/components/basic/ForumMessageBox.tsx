import React, { useEffect, useState, useRef } from 'react';
import './ForumMessageBox.css';
import Button from './Button';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface Result {
  id: string;
  name: string;
  type: string;
}

interface ForumMessageBoxProps {
  placeholder?: string;
  onSend?: (text: string) => void;
  disabled?: boolean;
  maxWords?: number;
  maxChars?: number;
  className?: string;
  showSendButton?: boolean;
  initialValue?: string;
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
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [listSearchQuery, setListSearchQuery] = useState<string>("");
  const [artistResults, setArtistResults] = useState<Result[]>([]);
  const [albumResults, setAlbumResults] = useState<Result[]>([]);
  const [listResults, setListResults] = useState<Result[]>([]);
  const [allLists, setAllLists] = useState<Result[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchingLists, setIsSearchingLists] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string>("");
  const [newMessage, setNewMessage] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track the position of the trigger character (@ or #) for replacement
  const triggerPositionRef = useRef<number>(-1);

  // API configuration from environment variables
  const API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
  const API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
  const SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
  const CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID;

  // Set up real-time listener for all public lists
  useEffect(() => {
    const listsQuery = query(
      collection(db, 'lists'),
      where('isPublic', '!=', false)
    );

    const unsubscribe = onSnapshot(listsQuery, (snapshot) => {
      const lists: Result[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.title) {
          lists.push({
            id: doc.id,
            name: data.title,
            type: 'list'
          });
        }
      });
      lists.sort((a, b) => a.name.localeCompare(b.name));
      setAllLists(lists);
    }, (error) => {
      console.error('Error listening to lists:', error);
    });

    return () => unsubscribe();
  }, []);

  const fetchListResults = (searchTerm: string): Result[] => {
    if (!searchTerm.trim()) return [];
    const filtered = allLists.filter(list =>
      list.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return filtered.slice(0, 3);
  };

  const fetchResults = async (query: string): Promise<Result[][]> => {
    setSearchStatus("Searching...");
    const response = await fetch(
      `${SERVER_URL}/rest/search3?query=${query}&artistCount=5&albumCount=5&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`,
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

    const artistResults = Array.from(xmlDoc.getElementsByTagName('artist'));
    const albumResults = Array.from(xmlDoc.getElementsByTagName('album'));

    const albums: Result[] = albumResults.map((album) => ({
      id: album.getAttribute('id') || '',
      name: album.getAttribute('name') || 'Unknown Album',
      type: 'album',
    })).slice(0, 3);

    const artists: Result[] = artistResults.map((artist) => ({
      id: artist.getAttribute('id') || '',
      name: artist.getAttribute('name') || 'Unknown Artist',
      type: 'artist',
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

  useEffect(() => {
    if (listSearchQuery.length >= 2) {
      setIsSearchingLists(true);
      const results = fetchListResults(listSearchQuery);
      setListResults(results);
      setIsSearchingLists(false);
    } else {
      setListResults([]);
      setIsSearchingLists(false);
    }
  }, [listSearchQuery, allLists]);

  const handleSend = () => {
    if (newMessage.trim() && onSend && !disabled) {
      onSend(newMessage.trim());
      setNewMessage('');
      clearSearch();
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setIsSearching(false);
    setListSearchQuery('');
    setIsSearchingLists(false);
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

    // Find the last @ or # before the cursor position
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const hashIndex = textBeforeCursor.lastIndexOf('#');

    // Check for @ (artists/albums) — must be at start of text or preceded by whitespace
    if (atIndex !== -1 && atIndex > hashIndex && (atIndex === 0 || /\s/.test(value[atIndex - 1]))) {
      const queryText = textBeforeCursor.slice(atIndex + 1);
      // Only search if there's no space break after the trigger (user is still typing the query)
      if (!/\n/.test(queryText)) {
        triggerPositionRef.current = atIndex;
        setSearchQuery(queryText);
        setIsSearching(true);
        setListSearchQuery('');
        setIsSearchingLists(false);
        return;
      }
    }

    // Check for # (lists)
    if (hashIndex !== -1 && hashIndex > atIndex && (hashIndex === 0 || /\s/.test(value[hashIndex - 1]))) {
      const queryText = textBeforeCursor.slice(hashIndex + 1);
      if (!/\n/.test(queryText)) {
        triggerPositionRef.current = hashIndex;
        setListSearchQuery(queryText);
        setIsSearchingLists(true);
        setSearchQuery('');
        setIsSearching(false);
        return;
      }
    }

    clearSearch();
  };

  const selectResult = (result: Result) => {
    let link: string;

    if (result.type === 'list') {
      link = `${window.location.origin}/lists/${result.id}`;
    } else {
      link = `${SERVER_URL}/app/#/${result.type}/${result.id}/show`;
    }

    const triggerPos = triggerPositionRef.current;
    if (triggerPos === -1) return;

    const cursorPos = textareaRef.current?.selectionStart ?? newMessage.length;
    const replacement = `[${result.name}](${link}) `;
    const before = newMessage.slice(0, triggerPos);
    const after = newMessage.slice(cursorPos);
    const updatedMessage = before + replacement + after;

    setNewMessage(updatedMessage);
    clearSearch();

    // Focus textarea and position cursor after the inserted link
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = triggerPos + replacement.length;
        textareaRef.current.focus();
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
      }
    }, 0);
  };

  // Auto-resize textarea to fit content
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

  const wordCount = newMessage.trim() ? newMessage.trim().split(/\s+/).length : 0;
  const charCount = newMessage.length;
  const canSend = newMessage.trim().length > 0 && wordCount <= maxWords && charCount <= maxChars && !disabled;

  return (
    <div className={`textbox-container ${disabled ? 'disabled' : ''} ${className}`}>
      <div className="input-area">
        <textarea
          ref={textareaRef}
          className="text-input"
          value={newMessage}
          onChange={handleInputChange}
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

      {isSearching && <p>{searchStatus}</p>}
      {isSearchingLists && <p>Searching for lists...</p>}
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
      {listResults.length > 0 && (
        <figure>
          <figcaption>Lists</figcaption>
          <ul style={{ marginTop: "10px", listStyleType: "none", padding: 0 }}>
            {listResults.map((result, index) => (
              <li key={index}>
                <button onClick={() => selectResult(result)}>{result.name}</button>
              </li>
            ))}
          </ul>
        </figure>
      )}

      <div className="word-counter">
        {wordCount}/{maxWords} words | {charCount}/{maxChars} characters
      </div>
    </div>
  );
};

export default ForumBox;
