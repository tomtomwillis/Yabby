import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebaseConfig';
import Header from '../components/basic/Header';
import CalendarMonth from '../components/events/CalendarMonth';
import CalendarWeek from '../components/events/CalendarWeek';
import CalendarSettings from '../components/events/CalendarSettings';
import EventForm from '../components/events/EventForm';
import EventList from '../components/events/EventList';
import type { Facet } from '../components/travel/TravelFilters';
import {
  EVENT_CATEGORIES,
  addDays,
  cityKey,
  compareEvents,
  addMonths,
  attendeesOf,
  dayLabel,
  isHosted,
  monthGrid,
  monthLabel,
  weekTitle,
  startOfMonth,
  startOfWeek,
  todayISO,
  weekDays,
  type CalendarEvent,
  type EventCategory,
} from '../components/events/eventTypes';
import {
  createEvent,
  deleteEvent,
  getEvent,
  loadEventsFrom,
  loadEventsInRange,
  updateEvent,
  type EventCursor,
  type EventDraft,
} from '../utils/eventsApi';
import { setEventStatus, useEventInterests } from '../utils/eventInterests';
import { getUserData, getUserProfile } from '../utils/userCache';
import { useAdmin } from '../utils/useAdmin';
import { useRateLimit } from '../utils/useRateLimit';
import './CalendarPage.css';

type View = 'month' | 'week';

const VIEW_KEY = 'yabby.calendar.view';
const FILTERS_KEY = 'yabby.calendar.filters';
/** Where CalendarPage.css lays the page out for a phone. */
const NARROW = '(max-width: 768px)';
/** Matches .cal-set-panel's transition in CalendarSettings.css. */
const SETTINGS_ROLL_MS = 280;

/** The view last chosen here, or week on a phone — a month's cells are too
 *  narrow there to show anything but dots. */
function storedView(): View {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(VIEW_KEY);
  } catch {
    /* private mode — fall through to the default */
  }
  if (stored === 'week' || stored === 'month') return stored;
  return window.matchMedia('(max-width: 760px)').matches ? 'week' : 'month';
}

type HostFilter = '' | 'members' | 'mine';

/** What the filter line is set to. Labels are kept beside the values so a
 *  choice still reads right on a day or month that has none of it. */
interface Filters {
  city: string;
  cityLabel: string;
  type: EventCategory | '';
  by: string;
  byLabel: string;
  host: HostFilter;
  /** '' for everyone's events, 'mine' for the member's own ticks, or the uid
   *  of a member who shares their calendar. */
  cal: string;
  calLabel: string;
}

const NO_FILTERS: Filters = {
  city: '',
  cityLabel: '',
  type: '',
  by: '',
  byLabel: '',
  host: '',
  cal: '',
  calLabel: '',
};

/** The filters as this browser last left them — "only Glasgow" should not
 *  need setting again every visit. Anything unreadable is dropped. */
function storedFilters(): Filters {
  try {
    const raw = JSON.parse(localStorage.getItem(FILTERS_KEY) ?? '{}');
    const text = (key: keyof Filters) => (typeof raw[key] === 'string' ? (raw[key] as string).slice(0, 200) : '');
    return {
      city: text('city'),
      cityLabel: text('cityLabel'),
      type: EVENT_CATEGORIES.some((c) => c.value === raw.type) ? raw.type : '',
      by: text('by'),
      byLabel: text('byLabel'),
      host: raw.host === 'members' || raw.host === 'mine' ? raw.host : '',
      cal: text('cal'),
      calLabel: text('calLabel'),
    };
  } catch {
    return NO_FILTERS;
  }
}

function track(event: string, data?: Record<string, string>) {
  try {
    window.umami?.track?.(event, data);
  } catch {
    /* ignore umami errors */
  }
}

function daysOf(view: View, anchor: string): string[] {
  return view === 'month' ? monthGrid(anchor) : weekDays(anchor);
}

/** Today when it is on screen, otherwise the first day of what is. */
function defaultSelection(view: View, anchor: string, today: string): string {
  if (daysOf(view, anchor).includes(today) && (view === 'week' || today.slice(0, 7) === anchor.slice(0, 7))) {
    return today;
  }
  return view === 'month' ? startOfMonth(anchor) : startOfWeek(anchor);
}

/** Which facet a count is being taken for — left out of the match, so each
 *  option shows what choosing it would leave. Same scheme as the travel page. */
type Facetted = 'city' | 'type' | 'by' | 'host' | 'cal' | null;

/** Events in calendar order, split into runs of one date. */
function groupByDate(events: CalendarEvent[]): [string, CalendarEvent[]][] {
  const groups: [string, CalendarEvent[]][] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last && last[0] === event.date) last[1].push(event);
    else groups.push([event.date, [event]]);
  }
  return groups;
}

export default function CalendarPage() {
  const [user] = useAuthState(auth);
  const uid = user?.uid ?? null;
  const { isAdmin } = useAdmin();
  const [searchParams] = useSearchParams();
  const today = useMemo(todayISO, []);

  const [view, setView] = useState<View>(storedView);
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [filters, setFilters] = useState<Filters>(storedFilters);
  const { ids: interested, going } = useEventInterests();
  // Members who ticked something in view: their name, and whether they let
  // others pick their calendar in the filter.
  const [people, setPeople] = useState<Map<string, { username: string; shares: boolean }>>(new Map());
  // Rows start open; these are the ones closed since. On a phone every row
  // starts closed, and choosing a day on the grid opens that day's.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const seenRows = useRef(new Set<string>());
  const [openedDay, setOpenedDay] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped after a write. The cache has already folded the write in, so the
  // re-read it causes costs nothing.
  const [version, setVersion] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | undefined>();
  // The settings panel and the form share a line and open one at a time.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const switchTimer = useRef<number | undefined>(undefined);

  const { checkRateLimit } = useRateLimit({
    maxAttempts: 10,
    windowMs: 10 * 60 * 1000,
  });
  const addRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // The element to bring into view once it has rendered. Kept until it has
  // been found — after a deep link the row only exists once its month loads.
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  const days = useMemo(() => daysOf(view, anchor), [view, anchor]);
  const start = days[0];
  const end = days[days.length - 1];

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch {
      /* private mode — the filters just aren't remembered */
    }
  }, [filters]);

  // Published for the side column, which pins just under the bar on a wide page.
  useEffect(() => {
    const bar = barRef.current;
    const page = pageRef.current;
    if (!bar || !page) return;
    const observer = new ResizeObserver(() => page.style.setProperty('--cal-bar-h', `${bar.offsetHeight}px`));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const setFilter = useCallback((patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch })), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadEventsInRange(start, end)
      .then((list) => {
        if (!cancelled) setEvents(list);
      })
      .catch(() => {
        if (!cancelled) setError('could not load the calendar.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [start, end, version]);

  // The list runs on past the grid, a page at a time. The grid's own read
  // already covers up to its last day, so this starts the day after.
  const beyondFrom = addDays(end, 1);
  const [beyond, setBeyond] = useState<{
    from: string;
    events: CalendarEvent[];
    next: EventCursor | null;
    loading: boolean;
  }>({ from: '', events: [], next: null, loading: false });

  useEffect(() => {
    let cancelled = false;
    setBeyond({ from: beyondFrom, events: [], next: null, loading: true });
    loadEventsFrom(beyondFrom)
      .then((page) => {
        if (!cancelled)
          setBeyond({
            from: beyondFrom,
            events: page.events,
            next: page.next,
            loading: false,
          });
      })
      .catch(() => {
        if (!cancelled) setBeyond((prev) => ({ ...prev, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [beyondFrom, version]);

  const showMore = () => {
    const { from: pageFrom, next } = beyond;
    if (!next || beyond.loading) return;
    setBeyond((prev) => ({ ...prev, loading: true }));
    track('calendar_show_more');
    loadEventsFrom(pageFrom, next)
      .then((page) =>
        setBeyond((prev) =>
          prev.from === pageFrom
            ? {
                ...prev,
                events: [...prev.events, ...page.events],
                next: page.next,
                loading: false,
              }
            : prev,
        ),
      )
      .catch(() => setBeyond((prev) => ({ ...prev, loading: false })));
  };

  // Through the shared profile cache, which the names on the board and the
  // interested hovers fill as well.
  useEffect(() => {
    const unseen = new Set<string>();
    for (const event of events) {
      for (const id of attendeesOf(event)) if (id !== uid && !people.has(id)) unseen.add(id);
    }
    if (unseen.size === 0) return;
    let cancelled = false;
    Promise.all(
      [...unseen].map((id) =>
        getUserProfile(id).then(
          (profile) => [id, { username: profile.username, shares: profile.calendarPublic }] as const,
        ),
      ),
    )
      .then((found) => {
        if (!cancelled) setPeople((prev) => new Map([...prev, ...found]));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [events, uid, people]);

  const focusEvent = useCallback((event: CalendarEvent) => {
    setSelected(event.date);
    setFocusId(event.id);
    setCollapsed((prev) => {
      if (!prev.has(event.id)) return prev;
      const next = new Set(prev);
      next.delete(event.id);
      return next;
    });
    setScrollTarget(`ev-${event.id}`);
  }, []);

  // ?event=<id> — from the home widget, the board's hover card, or a pasted link.
  const linkedId = searchParams.get('event');
  useEffect(() => {
    if (!linkedId) return;
    let cancelled = false;
    getEvent(linkedId)
      .then((event) => {
        if (cancelled) return;
        if (!event) {
          setNotice('that event has been removed.');
          return;
        }
        setAnchor(event.date);
        focusEvent(event);
      })
      .catch(() => {
        if (!cancelled) setNotice('could not load that event.');
      });
    return () => {
      cancelled = true;
    };
  }, [linkedId, focusEvent]);

  // ?cal=<uid> — from a member's profile: their calendar, if they share it.
  const linkedCal = searchParams.get('cal');
  useEffect(() => {
    if (!linkedCal || !uid) return;
    if (linkedCal === uid) {
      setFilter({ cal: 'mine', calLabel: '' });
      return;
    }
    let cancelled = false;
    getUserProfile(linkedCal)
      .then((profile) => {
        if (cancelled) return;
        if (profile.calendarPublic) setFilter({ cal: linkedCal, calLabel: profile.username });
        else setNotice(`${profile.username} keeps their calendar to themselves.`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [linkedCal, uid, setFilter]);

  /** Does this event survive the filters, ignoring the one being counted? */
  const matches = useCallback(
    (e: CalendarEvent, skip: Facetted) => {
      const f = filters;
      return (
        (skip === 'city' || !f.city || cityKey(e.city ?? '') === f.city) &&
        (skip === 'type' || !f.type || e.category === f.type) &&
        (skip === 'by' || !f.by || e.userId === f.by) &&
        (skip === 'host' || !f.host || (isHosted(e) && (f.host === 'members' || e.userId === uid))) &&
        (skip === 'cal' || !f.cal || (f.cal === 'mine' ? interested.has(e.id) : attendeesOf(e).includes(f.cal)))
      );
    },
    [filters, interested, uid],
  );

  const visible = useMemo(() => events.filter((e) => matches(e, null)), [events, matches]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of visible) {
      const list = map.get(event.date);
      if (list) list.push(event);
      else map.set(event.date, [event]);
    }
    return map;
  }, [visible]);

  // The list runs from the selected day — never from the edge of last month
  // the grid shows — through the rest of the grid and on into the pages after.
  // The list covers the whole month (or week) on screen; choosing a day
  // scrolls to it rather than cutting off the days before.
  const from = view === 'month' ? startOfMonth(anchor) : start;
  const upcoming = useMemo(
    () =>
      [...events.filter((e) => e.date >= from), ...(beyond.from === beyondFrom ? beyond.events : [])].sort(
        compareEvents,
      ),
    [events, from, beyond, beyondFrom],
  );
  const upcomingShown = useMemo(() => upcoming.filter((e) => matches(e, null)), [upcoming, matches]);

  // The filter offers what the whole month (or week) on screen holds, so
  // choosing a day never changes what can be chosen.
  const inView = useMemo(
    () =>
      view === 'month'
        ? events.filter((e) => e.date.slice(0, 7) === anchor.slice(0, 7))
        : events.filter((e) => e.date >= start && e.date <= end),
    [events, view, anchor, start, end],
  );
  const viewShown = useMemo(() => inView.filter((e) => matches(e, null)).length, [inView, matches]);

  const facets = useMemo<Facet[]>(() => {
    const count = (skip: Facetted, keysOf: (e: CalendarEvent) => string[]) => {
      const counts = new Map<string, number>();
      let all = 0;
      for (const e of inView) {
        if (!matches(e, skip)) continue;
        all += 1;
        for (const key of keysOf(e)) if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return { counts, all };
    };
    const byCount = (a: { count: number; label: string }, b: { count: number; label: string }) =>
      b.count - a.count || a.label.localeCompare(b.label);

    const cityLabels = new Map<string, string>();
    const userLabels = new Map<string, string>();
    const calLabels = new Map<string, string>();
    for (const e of inView) {
      if (e.city && !cityLabels.has(cityKey(e.city))) cityLabels.set(cityKey(e.city), e.city);
      if (e.userId && !userLabels.has(e.userId)) userLabels.set(e.userId, e.username || 'someone');
      for (const id of attendeesOf(e)) {
        const person = people.get(id);
        if (id !== uid && person?.shares) calLabels.set(id, person.username);
      }
    }
    // A choice stays on the line even where this stretch has none of it.
    if (filters.city && !cityLabels.has(filters.city)) cityLabels.set(filters.city, filters.cityLabel || filters.city);
    if (filters.by && !userLabels.has(filters.by)) userLabels.set(filters.by, filters.byLabel || 'someone');
    if (filters.cal && filters.cal !== 'mine' && !calLabels.has(filters.cal)) {
      calLabels.set(filters.cal, filters.calLabel || 'someone');
    }
    const calOptions = new Map(uid ? [['mine', 'mine'] as const, ...calLabels] : calLabels);

    const facet = (
      key: string,
      value: string,
      labels: Map<string, string>,
      counted: { counts: Map<string, number>; all: number },
      onChange: (value: string, label: string) => void,
      sort = true,
    ): Facet => {
      const options = Array.from(labels, ([v, label]) => ({
        value: v,
        label,
        count: counted.counts.get(v) ?? 0,
      }));
      return {
        key,
        value,
        allCount: counted.all,
        options: sort ? options.sort(byCount) : options,
        onChange: (next) => {
          onChange(next, labels.get(next) ?? '');
          track('calendar_filter', { type: key });
        },
      };
    };

    return [
      facet(
        'city',
        filters.city,
        cityLabels,
        count('city', (e) => [cityKey(e.city ?? '')]),
        (v, label) => setFilter({ city: v, cityLabel: label }),
      ),
      facet(
        'type',
        filters.type,
        new Map(EVENT_CATEGORIES.map((c) => [c.value, c.label])),
        count('type', (e) => [e.category]),
        (v) => setFilter({ type: v as EventCategory | '' }),
      ),
      facet(
        'hosted by',
        filters.host,
        new Map(
          uid
            ? [
                ['members', 'yabbyville members'],
                ['mine', 'me'],
              ]
            : [['members', 'yabbyville members']],
        ),
        count('host', (e) => (isHosted(e) ? ['members', e.userId === uid ? 'mine' : ''] : [])),
        (v) => setFilter({ host: v as HostFilter }),
        false,
      ),
      facet(
        'added by',
        filters.by,
        userLabels,
        count('by', (e) => [e.userId]),
        (v, label) => setFilter({ by: v, byLabel: label }),
      ),
      facet(
        'calendar',
        filters.cal,
        calOptions,
        count('cal', (e) => [interested.has(e.id) ? 'mine' : '', ...attendeesOf(e).filter((id) => id !== uid)]),
        (v, label) => setFilter({ cal: v, calLabel: v === 'mine' ? '' : label }),
        false,
      ),
    ];
  }, [inView, matches, filters, setFilter, interested, people, uid]);

  const clearFilters = () => setFilters(NO_FILTERS);

  const pickType = (type: EventCategory) => {
    setFilter({ type: filters.type === type ? '' : type });
    track('calendar_filter', { type: 'type', via: 'key' });
  };

  const listed = upcomingShown;
  const groups = useMemo(() => groupByDate(listed), [listed]);

  // Closes rows the first time they are listed on a phone — before paint, so
  // they never flash open. The chosen day's and the linked event stay open.
  useLayoutEffect(() => {
    const fresh = listed.filter((e) => !seenRows.current.has(e.id));
    if (fresh.length === 0) return;
    for (const e of fresh) seenRows.current.add(e.id);
    if (!window.matchMedia(NARROW).matches) return;
    const closing = fresh.filter((e) => e.date !== openedDay && e.id !== focusId);
    if (closing.length === 0) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const e of closing) next.add(e.id);
      return next;
    });
  }, [listed, openedDay, focusId]);
  const allCollapsed = listed.length > 0 && listed.every((e) => collapsed.has(e.id));

  // Bring the chosen day or event into view once it exists. A chosen day goes
  // to the top of the list; an event only as far as `nearest`, so one already
  // on screen does not move.
  useEffect(() => {
    if (!scrollTarget || loading) return;
    const el = document.getElementById(scrollTarget);
    if (!el) return;
    setScrollTarget(null);
    el.scrollIntoView({ behavior: 'smooth', block: scrollTarget.startsWith('day-') ? 'start' : 'nearest' });
  }, [scrollTarget, loading, groups]);

  const step = (direction: -1 | 1) => {
    const next = view === 'month' ? addMonths(anchor, direction) : addDays(startOfWeek(anchor), direction * 7);
    setAnchor(next);
    setSelected(defaultSelection(view, next, today));
    setFocusId(null);
    setScrollTarget(null);
  };

  const goToday = () => {
    setAnchor(today);
    setSelected(today);
    setFocusId(null);
    setScrollTarget(null);
  };

  const switchView = (next: View) => {
    if (next === view) return;
    setView(next);
    setAnchor(selected);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* private mode — the choice just isn't remembered */
    }
    track('calendar_view', { view: next });
  };

  const selectDay = useCallback(
    (day: string) => {
      setSelected(day);
      setFocusId(null);
      setOpenedDay(day);
      setCollapsed((prev) => {
        const next = new Set(prev);
        for (const event of events) if (event.date === day) next.delete(event.id);
        return next.size === prev.size ? prev : next;
      });
      // A day from the next or last month, greyed at the edge of the grid,
      // turns the page to its month.
      if (view === 'month' && day.slice(0, 7) !== anchor.slice(0, 7)) setAnchor(day);
      setScrollTarget(`day-${day}`);
    },
    [view, anchor, events],
  );

  const toggleRow = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const event of listed) {
        if (allCollapsed) next.delete(event.id);
        else next.add(event.id);
      }
      return next;
    });
  };

  useEffect(() => () => window.clearTimeout(switchTimer.current), []);

  const openForm = (event?: CalendarEvent) => {
    window.clearTimeout(switchTimer.current);
    const show = () => {
      setEditing(event);
      setFormOpen(true);
      requestAnimationFrame(() => addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };
    // Settings roll shut first, then the form opens in their place.
    if (settingsOpen) {
      setSettingsOpen(false);
      switchTimer.current = window.setTimeout(show, SETTINGS_ROLL_MS);
    } else {
      show();
    }
  };

  const toggleSettings = () => {
    window.clearTimeout(switchTimer.current);
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    // The form has no roll, so it is gone before the panel starts opening.
    if (formOpen) closeForm();
    setSettingsOpen(true);
    track('calendar_settings_open');
  };

  const showMine = () => {
    setFilter({ cal: 'mine', calLabel: '' });
    track('calendar_filter', { type: 'calendar' });
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(undefined);
  };

  const showSaved = (saved: CalendarEvent) => {
    closeForm();
    setAnchor(saved.date);
    focusEvent(saved);
    setVersion((v) => v + 1);
  };

  const handleSubmit = async (draft: EventDraft, going: boolean) => {
    if (!user) throw new Error('Sign in to add events.');

    if (editing) {
      const saved = await updateEvent(editing, draft);
      track('calendar_event_edited', { category: saved.category });
      showSaved(saved);
      return;
    }

    if (!checkRateLimit()) throw new Error("You're adding events quickly. Give it a few minutes.");
    const profile = await getUserData(user.uid);
    // The rules refuse an event whose name is not the one on the profile.
    if (!profile.hasUsername) throw new Error('Set a username on your profile before adding events.');
    const saved = await createEvent(draft, profile.username);
    track('calendar_event_added', {
      category: saved.category,
      hosted: saved.hosted ? 'yes' : 'no',
      going: going ? 'yes' : 'no',
    });
    showSaved(saved);
    // Whoever adds an event is interested in it, or going. The event is saved either way.
    setEventStatus(saved, going ? 'going' : 'interested').catch((error) => console.warn('Could not mark the new event interested:', error));
  };

  const handleDelete = async (event: CalendarEvent) => {
    if (!window.confirm(`Delete "${event.title}"? This cannot be undone.`)) return;
    try {
      await deleteEvent(event.id);
      track('calendar_event_deleted');
      setFocusId(null);
      setVersion((v) => v + 1);
    } catch (err) {
      console.error('Error deleting event:', err);
      alert('Could not delete the event. Please try again.');
    }
  };

  const heading = view === 'month' ? monthLabel(anchor) : `${dayLabel(start)} – ${dayLabel(end)}`;
  // The stretch the filter counts cover, for "12 events this month".
  const week = weekTitle(start, today);
  const period =
    view === 'month'
      ? anchor.slice(0, 7) === today.slice(0, 7) ? 'this month' : `in ${monthLabel(anchor)}`
      : week.startsWith('week of') ? `in the ${week}` : week;

  return (
    <div className="calendar-page" ref={pageRef}>
      <Header title="Calendar" subtitle="What's on around Yabbyville - add yours!" />

      {/* The one line that steers the page, pinned to the top of the column. */}
      <div className="cal-bar" ref={barRef}>
        {/* The arrows round the month, today and month/week on one line, then
            the key. The arrows come first by CSS order. */}
        <button type="button" className="cal-word cal-today" onClick={goToday}>
          today
        </button>

        <div className="cal-nav">
          <button type="button" className="cal-word cal-step" onClick={() => step(-1)} aria-label={`Previous ${view}`}>
            ‹
          </button>
          <h2 className="cal-title" aria-live="polite">
            {heading}
          </h2>
          <button type="button" className="cal-word cal-step" onClick={() => step(1)} aria-label={`Next ${view}`}>
            ›
          </button>
        </div>

        <div className="cal-views" role="group" aria-label="View">
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`cal-word${view === v ? ' is-sel' : ''}`}
              aria-pressed={view === v}
              onClick={() => switchView(v)}
            >
              {v}
            </button>
          ))}
        </div>

        {/* What the colours mean, and a shortcut to the type filter. */}
        <ul className={`cal-key${filters.type ? ' is-filtered' : ''}`} aria-label="Filter by type">
          {EVENT_CATEGORIES.map((c) => (
            <li key={c.value} style={{ '--ec-c': c.colour } as React.CSSProperties}>
              <button
                type="button"
                className={`cal-key-item${filters.type === c.value ? ' is-sel' : ''}`}
                aria-pressed={filters.type === c.value}
                onClick={() => pickType(c.value)}
              >
                <span className="cal-key-dot" aria-hidden="true" />
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* One column, or the grid beside the list where the page is wide. */}
      <div className="cal-body">
        <div className="cal-side">
          <div className={`cal-grid${loading ? ' is-loading' : ''}`}>
            {view === 'month' ? (
              <CalendarMonth
                anchor={anchor}
                today={today}
                selected={selected}
                eventsByDate={eventsByDate}
                interested={interested}
                onSelect={selectDay}
              />
            ) : (
              <CalendarWeek
                anchor={anchor}
                today={today}
                selected={selected}
                openId={focusId}
                eventsByDate={eventsByDate}
                interested={interested}
                going={going}
                onSelect={selectDay}
                onOpen={focusEvent}
              />
            )}
          </div>

          <CalendarSettings
            facets={facets}
            shown={viewShown}
            total={inView.length}
            period={period}
            onClear={clearFilters}
            signedIn={!!user}
            onShowMine={showMine}
            open={settingsOpen}
            onToggle={toggleSettings}
            lead={
              <button
                type="button"
                className="cal-add-open"
                aria-expanded={formOpen}
                onClick={() => (formOpen ? closeForm() : openForm())}
              >
                <span className="cal-bar-sym cal-add-plus" aria-hidden="true">+</span>
                add an event
              </button>
            }
          />

          {/* The one band on the page that is an input rather than content. */}
          {formOpen && (
            <div className="cal-add" ref={addRef}>
              <EventForm
                key={editing?.id ?? 'new'}
                editing={editing}
                defaultDate={selected}
                onSubmit={handleSubmit}
                onCancel={closeForm}
              />
            </div>
          )}
        </div>

        <div className="cal-list">
          <div className="cal-h">
            <h2 className="cal-h-label">events from {dayLabel(from)}</h2>
            <span className="cal-h-rule" aria-hidden="true" />
            {listed.length > 0 && (
              <button type="button" className="cal-word cal-h-toggle" onClick={toggleAll}>
                {allCollapsed ? 'expand all' : 'collapse all'}
              </button>
            )}
            <span className="cal-h-note">
              {listed.length} {listed.length === 1 ? 'event' : 'events'}
            </span>
          </div>

          {notice && <p className="cal-status">{notice}</p>}
          {error && <p className="cal-error">{error}</p>}
          {!error && loading && listed.length === 0 && <p className="cal-status">loading…</p>}
          {!error && !loading && !beyond.loading && listed.length === 0 && !beyond.next && (
            <p className="cal-status">
              nothing from {dayLabel(from)} on
              {upcomingShown.length < upcoming.length && ' that fits the filter'}.{' '}
              <button type="button" className="cal-inline" onClick={() => openForm()}>
                add something?
              </button>
            </p>
          )}

          {groups.map(([date, dayEvents]) => (
            <section
              key={date}
              id={`day-${date}`}
              className={`cal-group${date === selected ? ' is-sel' : ''}${date === today ? ' is-today' : ''}`}
              aria-label={dayLabel(date)}
            >
              <h3 className="cal-dh">
                <button type="button" className="cal-dh-day" onClick={() => setSelected(date)}>
                  {dayLabel(date)}
                </button>
                <span className="cal-dh-rule" aria-hidden="true" />
              </h3>
              <EventList
                events={dayEvents}
                collapsedIds={collapsed}
                focusId={focusId}
                currentUserId={uid}
                isAdmin={isAdmin}
                onToggle={toggleRow}
                onEdit={openForm}
                onDelete={handleDelete}
              />
            </section>
          ))}

          {(beyond.next || beyond.loading) && (
            <p className="cal-more">
              {beyond.loading ? (
                <span className="cal-status-inline">loading…</span>
              ) : (
                <button type="button" className="cal-inline" onClick={showMore}>
                  show more
                </button>
              )}
              {upcoming.length > 0 && (
                <span className="cal-more-note"> · loaded to {dayLabel(upcoming[upcoming.length - 1].date)}</span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
