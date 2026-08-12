import React, { useEffect, useState, useRef } from 'react';
import './ForumMessageBox.css';
import Button from './Button';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { trackedGetDocs as getDocs } from '../../utils/firestoreMetrics';
import { fetchSubsonicXml, NAVIDROME_SERVER_URL } from '../../utils/navidrome';
import { normalizeAvatarPath } from '../../utils/avatarPath';
import PollComposeModal, { type PollDraft } from './PollComposeModal';

interface Result {
  id: string;
  name: string;
  type: 'artist' | 'album' | 'list' | 'playlist' | 'place' | 'city' | 'instant' | 'travel' | 'action' | 'poll' | 'issue';
}

type SearchCommand = 'list' | 'playlist' | 'travel' | 'city' | 'issueresolved';
type SlashMode = 'command' | SearchCommand | null;

// Inserted links are stored in messages, so they must not depend on the
// current origin (e.g. localhost during development).
const SITE_ORIGIN = 'https://yabbyville.xyz';

const INSTANT_COMMANDS: Record<string, { label: string; path: string }> = {
  filmclub: { label: 'Film Club', path: '/film-club' },
  radio:    { label: 'Radio',     path: '/radio' },
  news:     { label: 'News',      path: '/news' },
  stickers: { label: 'Stickers',  path: '/stickers' },
  wiki:     { label: 'Wiki',      path: '/wiki' },
  issues:   { label: 'Issues',    path: '/issues' },
};

const SEARCH_COMMANDS: readonly SearchCommand[] = ['list', 'playlist', 'travel', 'city', 'issueresolved'];

const SEARCH_COMMAND_LABELS: Record<SearchCommand, string> = {
  list:     'search lists',
  playlist: 'search public playlists',
  travel:   'search a travel rec',
  city:     'search a list of filtered recs for a city',
  issueresolved: 'link to a specific issue',
};

const SLASH_MODE_LABELS: Record<SearchCommand, string> = {
  list:     'Lists',
  playlist: 'Playlists',
  travel:   'Places',
  city:     'Cities',
  issueresolved: 'Issues',
};

// Matches MAX_FILE_SIZE in backend_server/routes/messageImages.js
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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
  onFilmAnnounce?: (variant: 1 | 2 | 3) => Promise<void>;
  onPollAttach?: (poll: PollDraft | null) => void;
  /** The signed-in user's avatar, drawn beside the field on boards that lay
      the composer out as a post. Omitted everywhere else, so nothing changes
      on a board that has never had one. */
  avatar?: string;
  /** Their name, shown under that avatar. Only read when `avatar` is set. */
  avatarName?: string;
  /** Put the send button, the attach button and the counter in a row under the
      field rather than inside it. The ledger boards lay the composer out this
      way; everywhere else keeps the button in the field. */
  outsideControls?: boolean;
  /** A tick box drawn with the controls. The sub-boards use it to offer
      cross-posting to the main board; the box itself is controlled by whoever
      does the writing. */
  crossPost?: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  };
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
  onFilmAnnounce,
  onPollAttach,
  avatar,
  avatarName,
  outsideControls,
  crossPost,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [artistResults, setArtistResults] = useState<Result[]>([]);
  const [albumResults, setAlbumResults] = useState<Result[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string>("");
  const [newMessage, setNewMessage] = useState(initialValue);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingPoll, setPendingPoll] = useState<PollDraft | null>(null);
  const [pollComposeOpen, setPollComposeOpen] = useState(false);

  // Slash command state
  const [slashMode, setSlashMode] = useState<SlashMode>(null);
  const [slashSearchTerm, setSlashSearchTerm] = useState('');
  const [slashResults, setSlashResults] = useState<Result[]>([]);

  // Lazy-loaded data for search commands
  const [allLists, setAllLists] = useState<Result[]>([]);
  const [allPlaces, setAllPlaces] = useState<{ id: string; displayName: string; city: string; cityKey: string }[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<Result[]>([]);
  const [allIssues, setAllIssues] = useState<Result[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Dragging over a child fires dragleave on the parent, so count depth
  // instead of toggling on the first leave.
  const dragDepthRef = useRef(0);
  const triggerPositionRef = useRef<number>(-1);
  const listsFetchPromiseRef = useRef<Promise<void> | null>(null);
  const placesFetchPromiseRef = useRef<Promise<void> | null>(null);
  const playlistsFetchPromiseRef = useRef<Promise<void> | null>(null);
  const issuesFetchPromiseRef = useRef<Promise<void> | null>(null);

  const ensureListsLoaded = (): Promise<void> => {
    if (listsFetchPromiseRef.current) return listsFetchPromiseRef.current;
    const p = (async () => {
      try {
        const listsQuery = query(
          collection(db, 'lists'),
          where('isPublic', '==', true),
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
        const xmlDoc = await fetchSubsonicXml('getPlaylists');
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

  const ensureIssuesLoaded = (): Promise<void> => {
    if (issuesFetchPromiseRef.current) return issuesFetchPromiseRef.current;
    const p = (async () => {
      try {
        const issuesQuery = query(
          collection(db, 'issues'),
          orderBy('lastActivityAt', 'desc'),
          limit(50),
        );
        const snapshot = await getDocs(issuesQuery);
        const issues: Result[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          // Issues have no title — derive a snippet from the message text.
          const plain = String(data.text || '')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const name = plain ? (plain.length > 60 ? `${plain.slice(0, 60)}…` : plain) : '(image post)';
          issues.push({ id: docSnap.id, name, type: 'issue' as const });
        });
        setAllIssues(issues);
      } catch (error) {
        console.error('Error fetching issues:', error);
        issuesFetchPromiseRef.current = null;
      }
    })();
    issuesFetchPromiseRef.current = p;
    return p;
  };

  const fetchResults = async (queryStr: string): Promise<Result[][]> => {
    setSearchStatus("Searching...");
    const xmlDoc = await fetchSubsonicXml('search3', { query: queryStr, artistCount: 5, albumCount: 5 });

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
    } else if (slashMode === 'issueresolved') {
      // Empty term shows the most recent issues (kept in lastActivityAt order).
      const filtered = allIssues
        .filter((i) => !slashSearchTerm.trim() || i.name.toLowerCase().includes(slashSearchTerm.toLowerCase()))
        .slice(0, 5);
      setSlashResults(filtered);
    }
  }, [slashMode, slashSearchTerm, allLists, allPlaces, allPlaylists, allIssues]);

  const handleSend = () => {
    if ((newMessage.trim() || imagePreviewUrl || pendingPoll) && onSend && !disabled) {
      onSend(newMessage.trim());
      setNewMessage('');
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
        setImagePreviewUrl(null);
        onImageAttach?.(null);
      }
      if (pendingPoll) {
        setPendingPoll(null);
        onPollAttach?.(null);
      }
      clearSearch();
    }
  };

  const savePollDraft = (draft: PollDraft) => {
    setPendingPoll(draft);
    onPollAttach?.(draft);
    setPollComposeOpen(false);
  };

  const removePollDraft = () => {
    setPendingPoll(null);
    onPollAttach?.(null);
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
          const actionMatches: Result[] = [];
          if (onFilmAnnounce) {
            const ANNOUNCE_LABELS: Record<string, string> = {
              filmannounce1: 'announce current film',
              filmannounce2: 'remind voting deadline',
              filmannounce3: 'announce next month\'s film',
            };
            Object.keys(ANNOUNCE_LABELS).forEach((cmd) => {
              if (cmd.startsWith(command)) {
                actionMatches.push({ id: cmd, name: `/${cmd} — ${ANNOUNCE_LABELS[cmd]}`, type: 'action' });
              }
            });
          }
          if (onPollAttach && 'poll'.startsWith(command)) {
            actionMatches.push({ id: 'poll', name: '/poll — create a poll', type: 'poll' });
          }
          setSlashResults([...searchMatches, ...instantMatches, ...actionMatches]);
          setSlashMode('command');
        } else if (SEARCH_COMMANDS.includes(command as SearchCommand)) {
          setSlashMode(command as SearchCommand);
          // slashResults populated reactively by useEffect above
          if (command === 'list') ensureListsLoaded();
          if (command === 'travel' || command === 'city') ensurePlacesLoaded();
          if (command === 'playlist') ensurePlaylistsLoaded();
          if (command === 'issueresolved') ensureIssuesLoaded();
        } else if (Object.keys(INSTANT_COMMANDS).some((k) => k.startsWith(command)) || (onFilmAnnounce && ['filmannounce1', 'filmannounce2', 'filmannounce3'].some((cmd) => cmd.startsWith(command))) || (onPollAttach && 'poll'.startsWith(command))) {
          // Instant or action command typed with a trailing space
          const instantMatches: Result[] = Object.entries(INSTANT_COMMANDS)
            .filter(([k]) => k.startsWith(command))
            .map(([k, v]) => ({ id: k, name: `/${k} — ${v.label}`, type: 'instant' as const }));
          const actionMatches: Result[] = [];
          if (onFilmAnnounce) {
            const ANNOUNCE_LABELS: Record<string, string> = {
              filmannounce1: 'announce current film',
              filmannounce2: 'remind voting deadline',
              filmannounce3: 'announce next month\'s film',
            };
            Object.keys(ANNOUNCE_LABELS).forEach((cmd) => {
              if (cmd.startsWith(command)) {
                actionMatches.push({ id: cmd, name: `/${cmd} — ${ANNOUNCE_LABELS[cmd]}`, type: 'action' });
              }
            });
          }
          if (onPollAttach && 'poll'.startsWith(command)) {
            actionMatches.push({ id: 'poll', name: '/poll — create a poll', type: 'poll' });
          }
          setSlashResults([...instantMatches, ...actionMatches]);
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
    if (result.type === 'action' && result.id.startsWith('filmannounce')) {
      const triggerPos = triggerPositionRef.current;
      if (triggerPos !== -1) {
        const cursorPos = textareaRef.current?.selectionStart ?? newMessage.length;
        setNewMessage(newMessage.slice(0, triggerPos) + newMessage.slice(cursorPos));
      }
      clearSearch();
      const variant = parseInt(result.id.slice(-1)) as 1 | 2 | 3;
      onFilmAnnounce?.(variant);
      return;
    }

    if (result.type === 'poll') {
      const triggerPos = triggerPositionRef.current;
      if (triggerPos !== -1) {
        const cursorPos = textareaRef.current?.selectionStart ?? newMessage.length;
        setNewMessage(newMessage.slice(0, triggerPos) + newMessage.slice(cursorPos));
      }
      clearSearch();
      setPollComposeOpen(true);
      return;
    }

    let link: string;
    const linkText = result.type === 'instant' ? INSTANT_COMMANDS[result.id].label : result.name;

    if (result.type === 'instant') {
      link = `${SITE_ORIGIN}${INSTANT_COMMANDS[result.id].path}`;
    } else if (result.type === 'playlist') {
      link = `${NAVIDROME_SERVER_URL}/app/#/playlist/${result.id}/show`;
    } else if (result.type === 'place') {
      link = `${SITE_ORIGIN}/travel?place=${result.id}`;
    } else if (result.type === 'city') {
      link = `${SITE_ORIGIN}/travel?city=${result.id}`;
    } else if (result.type === 'list') {
      link = `${SITE_ORIGIN}/lists/${result.id}`;
    } else if (result.type === 'issue') {
      link = `${SITE_ORIGIN}/issues?issue=${result.id}`;
    } else {
      link = `${NAVIDROME_SERVER_URL}/app/#/${result.type}/${result.id}/show`;
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
    if (cmd === 'issueresolved') ensureIssuesLoaded();

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

  // The one path all three attach methods go through: paste, picker, drop.
  const attachImageFile = (file: File, method: 'paste' | 'picker' | 'drop') => {
    // Deliberately looser than the server's allow-list: some platforms report
    // an empty or odd MIME type (HEIC especially), and the server is the gate.
    if (!file.type.startsWith('image/')) {
      alert('Only image files can be attached.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      alert('Image must be under 8 MB.');
      return;
    }
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(URL.createObjectURL(file));
    onImageAttach?.(file);
    window.umami?.track('message-image-attach', { method });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        attachImageFile(file, 'paste');
        return;
      }
    }
  };

  const dragEnabled = !!onImageAttach && !disabled;

  const handleDragEnter = (e: React.DragEvent) => {
    if (!dragEnabled || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!dragEnabled || !e.dataTransfer.types.includes('Files')) return;
    // Without this the browser navigates to the file and no drop event fires.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!dragEnabled) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!dragEnabled) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    // Dragging an image out of another web page gives a URL, not a File.
    const file = e.dataTransfer.files?.[0];
    if (file) attachImageFile(file, 'drop');
  };

  const removeImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    onImageAttach?.(null);
  };

  const wordCount = newMessage.trim() ? newMessage.trim().split(/\s+/).length : 0;
  const charCount = newMessage.length;
  const canSend = (newMessage.trim().length > 0 || !!imagePreviewUrl || !!pendingPoll) && wordCount <= maxWords && charCount <= maxChars && !disabled;

  // Hoisted because they sit either inside the field or in a row under it,
  // depending on the board.
  const sendButton = (
    <div className="send-button-container">
      <Button
        type="basic"
        label="Send"
        onClick={handleSend}
        size="2.5em"
        disabled={!canSend}
      />
    </div>
  );

  const wordCounter = (
    <div className="word-counter">
      {wordCount}/{maxWords} words | {charCount}/{maxChars} characters
    </div>
  );

  const isSlashSearchMode = slashMode !== null && slashMode !== 'command';
  const slashModeLabel = isSlashSearchMode ? SLASH_MODE_LABELS[slashMode as SearchCommand] : '';

  const slashEmptyHint = (() => {
    if (slashMode === 'list') return 'Type to search lists…';
    if (slashMode === 'playlist') return 'Type to search playlists…';
    if (slashMode === 'travel') return allPlaces.length === 0 ? 'Loading places…' : 'Type to search places…';
    if (slashMode === 'city') return allPlaces.length === 0 ? 'Loading cities…' : 'No cities found';
    if (slashMode === 'issueresolved') return allIssues.length === 0 ? 'Loading issues…' : 'No matching issues';
    return '';
  })();

  // Only offered where a parent is actually listening for the file — News uses
  // this layout but has nowhere to put an image.
  const attachButton = onImageAttach ? (
    <>
      {/* accept="image/*" rather than the server's exact list: it is what makes
          iOS offer Photo Library / Take Photo / Browse and Android show the
          gallery. No `capture`, so the camera never becomes the only option. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="textbox-attach-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) attachImageFile(file, 'picker');
          e.target.value = ''; // so the same file can be picked again
        }}
      />
      <button
        type="button"
        className="textbox-attach"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
      >
        ▓ attach
      </button>
    </>
  ) : null;

  const crossPostToggle = crossPost ? (
    <label className="textbox-crosspost">
      <input
        type="checkbox"
        checked={crossPost.checked}
        onChange={(e) => crossPost.onChange(e.target.checked)}
        disabled={disabled}
      />
      {crossPost.label}
    </label>
  ) : null;

  return (
    <div
      className={`textbox-container ${disabled ? 'disabled' : ''} ${isDragOver ? 'dragover' : ''} ${className}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {avatar && (
        <>
          {/* The composer's poster gutter: the same column a post has, so the
              field you type into starts on the same edge as everything already
              on the board. */}
          <div className="textbox-poster">
            <img
              className="textbox-avatar"
              src={normalizeAvatarPath(avatar)}
              alt=""
              loading="lazy"
            />
            <p className="textbox-poster-note">Posting as</p>
            {avatarName && <p className="textbox-poster-name">{avatarName}</p>}
          </div>
          <div className="textbox-gutter-rule" aria-hidden="true"></div>
        </>
      )}
      {/* Everything that is not the gutter, in one box — a board that lays the
          composer out in columns needs a single thing to put in the last one. */}
      <div className="textbox-body">
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
        {showSendButton && !outsideControls && sendButton}
      </div>

      {outsideControls && (
        <div className="textbox-controls">
          {showSendButton && sendButton}
          {attachButton}
          {crossPostToggle}
          {wordCounter}
        </div>
      )}

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

      {pendingPoll && (
        <div className="poll-draft-chip" onClick={() => setPollComposeOpen(true)} role="button" tabIndex={0}>
          <span className="poll-draft-chip__label">📊 {pendingPoll.question}</span>
          <span className="poll-draft-chip__meta">{pendingPoll.options.length} options</span>
          <button
            type="button"
            className="poll-draft-chip__remove"
            onClick={(e) => {
              e.stopPropagation();
              removePollDraft();
            }}
            aria-label="Remove poll"
          >
            ✕
          </button>
        </div>
      )}

      {pollComposeOpen && (
        <PollComposeModal
          initialValue={pendingPoll}
          onSave={savePollDraft}
          onCancel={() => setPollComposeOpen(false)}
        />
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
                    r.type === 'instant' || r.type === 'action' || r.type === 'poll' ? selectResult(r) : activateSearchCommand(r.id)
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

      {!outsideControls && crossPostToggle}
      {!outsideControls && wordCounter}
      </div>
    </div>
  );
};

export default ForumBox;
