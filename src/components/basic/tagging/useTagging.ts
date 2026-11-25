import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { NAVIDROME_SERVER_URL } from '../../../utils/navidrome';
import { navidromeHref, searchLibrary, searchSongs } from '../../../utils/navidromeSearch';
import { eventPath, monthLabel } from '../../events/eventTypes';
import {
  INSTANT_COMMANDS,
  MAX_SEARCH_CHARS,
  SEARCH_COMMANDS,
  SITE_ORIGIN,
  commandNameFor,
  findTrigger,
  parseEventQuery,
  pickEvents,
  resolveSearchCommand,
  searchText,
  splitSlash,
  type SearchCommand,
  type Trigger,
} from '../../../utils/tagCommands';
import {
  eventLabel,
  loadEvents,
  loadIssues,
  loadLists,
  loadMembers,
  loadPlaces,
  loadPlaylists,
  type Named,
  type Place,
  type TagEvent,
} from './tagSources';

export type TagItem = { key: string; label: string; hint?: string } & (
  /** Opens a search: writes "/name " and keeps the menu open. */
  | { kind: 'command'; name: string }
  /** Runs something instead of writing anything. */
  | { kind: 'action'; run: () => void }
  /** Writes [text](href). */
  | { kind: 'link'; text: string; href: string; command: string }
);

/** A / command only some boxes offer, such as /poll or the admin bots. */
export interface TagAction {
  name: string;
  hint: string;
  run: () => void;
}

export interface TagMenu {
  caption: string;
  items: TagItem[];
  /** Shown when there are no items. */
  note?: string;
  /** Still loading, so no items does not yet mean no matches. */
  pending?: boolean;
  active: number;
}

interface TaggingOptions {
  value: string;
  onChange: (next: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  maxLength?: number;
  actions?: TagAction[];
}

const LIBRARY_MIN = 2;
const DEBOUNCE_MS = 250;
const MAX_ITEMS = 6;
const MAX_LONG_ITEMS = 8;
// Long enough for a click on the menu to land before a blur closes it.
const BLUR_CLOSE_MS = 150;

const LIBRARY_COMMANDS: ReadonlySet<SearchCommand> = new Set(['artist', 'album', 'track']);

const includes = (name: string, term: string) => name.toLowerCase().includes(term.toLowerCase());

async function searchLibraryFor(command: SearchCommand, term: string): Promise<TagItem[]> {
  if (command === 'track') {
    return (await searchSongs(term, MAX_ITEMS)).map((s) => ({
      kind: 'link', key: s.id, label: s.title, hint: s.artist, command,
      text: s.artist ? `${s.title} – ${s.artist}` : s.title,
      href: navidromeHref('album', s.albumId),
    }));
  }
  const counts = command === 'artist' ? { artists: MAX_ITEMS, albums: 0 } : { artists: 0, albums: MAX_ITEMS };
  return (await searchLibrary(term, counts)).map((item) => ({
    kind: 'link', key: item.id, label: item.name, hint: item.artist, command,
    text: item.name, href: navidromeHref(item.type, item.id),
  }));
}

/**
 * The @ and / menu every free-text box on the site shares: @ tags a member,
 * / links artists, albums, tracks, playlists, lists, events, travel recs and
 * site pages. The host renders `menu` with TagSuggestions and calls `update`
 * whenever the text or caret moves.
 */
export function useTagging({ value, onChange, textareaRef, maxLength, actions = [] }: TaggingOptions) {
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [active, setActive] = useState(0);

  const [members, setMembers] = useState<Named[] | null>(null);
  const [lists, setLists] = useState<Named[] | null>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [playlists, setPlaylists] = useState<Named[] | null>(null);
  const [issues, setIssues] = useState<Named[] | null>(null);
  const [events, setEvents] = useState<Record<string, TagEvent[]>>({});
  const [library, setLibrary] = useState<{ key: string; items: TagItem[] } | null>(null);

  const requestRef = useRef(0);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slash = useMemo(() => (trigger?.kind === '/' ? splitSlash(trigger.text) : null), [trigger]);
  const search = slash && slash.term !== null ? resolveSearchCommand(slash.command) : null;
  const command = search?.name ?? null;
  const term = (slash?.term ?? '').trim();
  const eventQuery = useMemo(() => (command === 'event' ? parseEventQuery(term) : null), [command, term]);
  const eventKey = eventQuery ? `${eventQuery.start}|${eventQuery.end}` : null;
  const libraryKey = command && LIBRARY_COMMANDS.has(command) && term.length >= LIBRARY_MIN ? `${command}|${term}` : null;

  // Each source loads the first time its command is used; the loaders share
  // one copy between every box on the page.
  const mode = trigger?.kind === '@' ? '@' : command;
  useEffect(() => {
    let live = true;
    const keep = <T,>(load: () => Promise<T>, set: (v: T) => void) =>
      load().then((v) => live && set(v)).catch((error) => console.error('Tag search failed to load:', error));
    if (mode === '@') keep(loadMembers, setMembers);
    if (mode === 'list') keep(loadLists, setLists);
    if (mode === 'travel' || mode === 'city') keep(loadPlaces, setPlaces);
    if (mode === 'playlist') keep(loadPlaylists, setPlaylists);
    if (mode === 'issueresolved') keep(loadIssues, setIssues);
    return () => { live = false; };
  }, [mode]);

  // A month typed letter by letter ("ma", "mar", "marc") would otherwise load
  // a range per keystroke.
  useEffect(() => {
    if (!eventKey || events[eventKey]) return;
    const [start, end] = eventKey.split('|');
    let live = true;
    const timer = setTimeout(() => {
      loadEvents(start, end)
        .then((list) => live && setEvents((prev) => ({ ...prev, [eventKey]: list })))
        .catch((error) => console.error('Error fetching events:', error));
    }, DEBOUNCE_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [eventKey, events]);

  useEffect(() => {
    if (!libraryKey || !command) return;
    const request = ++requestRef.current;
    const timer = setTimeout(() => {
      searchLibraryFor(command, term)
        .then((items) => request === requestRef.current && setLibrary({ key: libraryKey, items }))
        .catch(() => request === requestRef.current && setLibrary({ key: libraryKey, items: [] }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [libraryKey, command, term]);

  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  }, []);

  const built = useMemo((): Omit<TagMenu, 'active'> | null => {
    if (!trigger || trigger.start === dismissedAt) return null;

    if (trigger.kind === '@') {
      const name = trigger.text.trim().toLowerCase();
      if (!name) return null;
      if (!members) return { caption: 'members', items: [], note: 'loading members…', pending: true };
      const items: TagItem[] = members
        .filter((m) => m.name.toLowerCase().includes(name))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(name)) - Number(!b.name.toLowerCase().startsWith(name)))
        .slice(0, MAX_ITEMS)
        .map((m) => ({ kind: 'link', key: m.id, label: `@${m.name}`, text: `@${m.name}`, href: `${SITE_ORIGIN}/user/${m.id}`, command: '@' }));
      return { caption: 'members', items, note: 'no one by that name' };
    }

    if (!slash) return null;

    if (slash.term === null) {
      const typed = slash.command;
      const items: TagItem[] = [];
      for (const info of SEARCH_COMMANDS) {
        const name = commandNameFor(info, typed);
        if (name) items.push({ kind: 'command', key: info.name, name, label: `/${name}`, hint: info.hint });
      }
      for (const [name, page] of Object.entries(INSTANT_COMMANDS)) {
        if (name.startsWith(typed)) {
          items.push({ kind: 'link', key: name, label: `/${name}`, hint: `link to ${page.label}`, text: page.label, href: `${SITE_ORIGIN}${page.path}`, command: name });
        }
      }
      for (const action of actions) {
        if (action.name.startsWith(typed)) items.push({ kind: 'action', key: action.name, label: `/${action.name}`, hint: action.hint, run: action.run });
      }
      return items.length ? { caption: 'commands', items } : null;
    }

    if (!search) return null;
    const link = (key: string, label: string, href: string, hint?: string): TagItem =>
      ({ kind: 'link', key, label, hint, text: label, href, command: search.name });

    switch (search.name) {
      case 'artist':
      case 'album':
      case 'track': {
        if (term.length < LIBRARY_MIN) return { caption: search.heading, items: [], note: `type to search ${search.heading}…` };
        if (library?.key !== libraryKey) return { caption: search.heading, items: [], note: 'searching the library…', pending: true };
        return { caption: search.heading, items: library.items, note: 'nothing in the library called that' };
      }
      case 'playlist': {
        if (!playlists) return { caption: search.heading, items: [], note: 'loading playlists…', pending: true };
        const items = playlists
          .filter((p) => !term || includes(p.name, term))
          .slice(0, MAX_ITEMS)
          .map((p) => link(p.id, p.name, `${NAVIDROME_SERVER_URL}/app/#/playlist/${p.id}/show`));
        return { caption: search.heading, items, note: 'no playlists called that' };
      }
      case 'list': {
        if (!lists) return { caption: search.heading, items: [], note: 'loading lists…', pending: true };
        if (!term) return { caption: search.heading, items: [], note: 'type to search lists…' };
        const items = lists.filter((l) => includes(l.name, term)).slice(0, MAX_ITEMS)
          .map((l) => link(l.id, l.name, `${SITE_ORIGIN}/lists/${l.id}`));
        return { caption: search.heading, items, note: 'no lists called that' };
      }
      case 'travel': {
        if (!places) return { caption: search.heading, items: [], note: 'loading places…', pending: true };
        const items = places.filter((p) => !term || includes(p.name, term)).slice(0, MAX_ITEMS)
          .map((p) => link(p.id, p.name, `${SITE_ORIGIN}/travel?place=${p.id}`, p.city || undefined));
        return { caption: search.heading, items, note: 'no places called that' };
      }
      case 'city': {
        if (!places) return { caption: search.heading, items: [], note: 'loading cities…', pending: true };
        const cities = new Map<string, string>();
        for (const p of places) {
          if (p.cityKey && !cities.has(p.cityKey)) cities.set(p.cityKey, p.city || p.cityKey);
        }
        const items = Array.from(cities)
          .filter(([, label]) => !term || includes(label, term))
          .sort(([, a], [, b]) => a.localeCompare(b))
          .slice(0, MAX_LONG_ITEMS)
          .map(([key, label]) => link(key, label, `${SITE_ORIGIN}/travel?city=${key}`));
        return { caption: search.heading, items, note: 'no cities called that' };
      }
      case 'event': {
        if (!eventQuery || !eventKey) return null;
        const q = eventQuery;
        const caption = q.month
          ? `${q.when === 'past' ? 'past ' : ''}events in ${monthLabel(q.month)}`
          : q.when === 'past' ? 'past events' : 'events';
        const loaded = events[eventKey];
        if (!loaded) return { caption, items: [], note: 'loading events…', pending: true };
        const items = pickEvents(loaded, q).slice(0, MAX_LONG_ITEMS)
          .map((e) => link(e.id, eventLabel(e), `${SITE_ORIGIN}${eventPath(e.id)}`));
        return { caption, items, note: q.text ? 'no events match that' : 'no events then' };
      }
      case 'issueresolved': {
        if (!issues) return { caption: search.heading, items: [], note: 'loading issues…', pending: true };
        const items = issues.filter((i) => !term || includes(i.name, term)).slice(0, MAX_ITEMS)
          .map((i) => link(i.id, i.name, `${SITE_ORIGIN}/issues?issue=${i.id}`));
        return { caption: search.heading, items, note: 'no issues match that' };
      }
    }
    return null;
  }, [trigger, dismissedAt, members, slash, search, term, actions, library, libraryKey, playlists, lists, places, eventQuery, events, eventKey, issues]);

  // A long search with nothing matching is someone using @ or / in a sentence.
  const menu = built && !built.pending && built.items.length === 0 && trigger && searchText(trigger).length > MAX_SEARCH_CHARS
    ? null
    : built;

  const activeIndex = menu && menu.items.length ? Math.min(active, menu.items.length - 1) : 0;

  const cancelBlur = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = null;
  };

  /** Call with the new text and caret after every change, click or focus. */
  const update = (next: string, caret: number) => {
    cancelBlur();
    const t = findTrigger(next, caret);
    setTrigger(t);
    if (!t || t.start !== dismissedAt) setDismissedAt(null);
    setActive(0);
  };

  const close = () => {
    cancelBlur();
    setTrigger(null);
  };

  const onBlur = () => {
    cancelBlur();
    blurTimerRef.current = setTimeout(() => setTrigger(null), BLUR_CLOSE_MS);
  };

  /** Swaps the @ or / and what follows it up to the caret for `text`. */
  const replaceTrigger = (text: string): boolean => {
    if (!trigger) return false;
    const area = textareaRef.current;
    const caret = area?.selectionStart ?? value.length;
    const next = value.slice(0, trigger.start) + text + value.slice(Math.max(caret, trigger.start + 1));
    if (maxLength !== undefined && next.length > maxLength) return false;
    onChange(next);
    const at = trigger.start + text.length;
    requestAnimationFrame(() => {
      if (!area) return;
      area.focus();
      area.setSelectionRange(at, at);
    });
    return true;
  };

  const select = (item: TagItem) => {
    cancelBlur();
    if (!trigger) return;
    if (item.kind === 'command') {
      const text = `/${item.name} `;
      if (replaceTrigger(text)) {
        setTrigger({ kind: '/', start: trigger.start, text: text.slice(1) });
        setActive(0);
      }
      return;
    }
    if (item.kind === 'action') {
      replaceTrigger('');
      close();
      item.run();
      return;
    }
    replaceTrigger(`[${item.text.replace(/[[\]]/g, '')}](${item.href}) `);
    close();
    if (item.command === '@') window.umami?.track('user_mention');
    else if (item.command === 'event') window.umami?.track('calendar_event_link');
    else window.umami?.track('slash_tag', { command: item.command });
  };

  /** True when the key was the menu's, so the host should do nothing more. */
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!menu) return false;
    if (e.key === 'Escape') {
      e.preventDefault();
      setDismissedAt(trigger?.start ?? null);
      return true;
    }
    if (menu.items.length === 0 || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + menu.items.length) % menu.items.length);
      return true;
    }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault();
      select(menu.items[activeIndex]);
      return true;
    }
    return false;
  };

  return {
    menu: menu ? { ...menu, active: activeIndex } : null,
    update,
    close,
    onBlur,
    onKeyDown,
    select,
    setActive,
  };
}
