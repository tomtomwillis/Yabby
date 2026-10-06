import React, { useRef, useState } from 'react';
import { eventImageUrl, importEventFromLink, uploadEventImage, type EventDraft, type ImportedEvent } from '../../utils/eventsApi';
import { normalizeSiteUrl, sanitizeText } from '../../utils/sanitise';
import {
  DEFAULT_TIME_ZONE,
  EVENT_CATEGORIES,
  EVENT_LIMITS,
  EVENT_TIME_ZONES,
  isValidCityName,
  isHosted,
  isValidEventDate,
  isValidEventImageId,
  isValidEventTime,
  type CalendarEvent,
  type EventCategory,
  type LineupAct,
  viewerTimeZone,
} from './eventTypes';
import TagTextarea from './TagTextarea';
import LineupEditor from './LineupEditor';
import CityInput from './CityInput';
import './EventForm.css';

// Matches MAX_FILE_SIZE in backend_server/routes/messageImages.js
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface EventFormProps {
  /** The event being edited, or undefined for a new one. */
  editing?: CalendarEvent;
  /** The date a new event starts on — the day chosen on the calendar. */
  defaultDate: string;
  /** `going` is whether the author has a ticket — asked only for a new event. */
  onSubmit: (draft: EventDraft, going: boolean) => Promise<void>;
  onCancel: () => void;
}

/** One line of text as the rules want it: tags stripped, whitespace folded. */
const oneLine = (value: string) => sanitizeText(value).replace(/\s+/g, ' ').trim();

/** Radio shows are nearly always the member's own; everything else is as
 *  likely to be a night they are only telling people about. */
const hostedByDefault = (category: EventCategory) => category === 'radio';

/** The sites the backend can read an event from. It checks the link properly;
 *  this only decides whether a paste is worth sending. */
const IMPORT_SOURCES = [
  { re: /^https?:\/\/(www\.)?communalleisure\.com\/[a-z0-9][a-z0-9-]*\/?(\?.*)?$/i, name: 'communal leisure', id: 'communal-leisure' },
  { re: /^https?:\/\/(www\.)?dice\.fm\/event\/[a-z0-9][a-z0-9-]*\/?(\?.*)?$/i, name: 'dice', id: 'dice' },
  { re: /^https?:\/\/(www\.)?gel\.now\/events\/[0-9]+\/?(\?.*)?$/i, name: 'gel', id: 'gel' },
];
const importSourceFor = (url: string) => IMPORT_SOURCES.find((source) => source.re.test(url));
const str = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Adding or editing an event, in flow inside the page's tinted input band like
 * the travel form. Only the title, date and city are required; everything else
 * is left out of the document when it is empty.
 */
const EventForm: React.FC<EventFormProps> = ({ editing, defaultDate, onSubmit, onCancel }) => {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [category, setCategory] = useState<EventCategory>(editing?.category ?? 'gig');
  const [date, setDate] = useState(editing?.date ?? defaultDate);
  const [time, setTime] = useState(editing?.time ?? '');
  const [endTime, setEndTime] = useState(editing?.endTime ?? '');
  // A new event starts in the zone the member's own clock keeps; one saved
  // before zones existed is in UK time.
  const [timeZone, setTimeZone] = useState(editing ? editing.timeZone ?? DEFAULT_TIME_ZONE : viewerTimeZone());
  // An event saved in a zone the list does not offer still shows its own.
  const zoneListed = EVENT_TIME_ZONES.some((zone) => zone.value === timeZone);
  const [location, setLocation] = useState(editing?.location ?? '');
  const [city, setCity] = useState(editing?.city ?? '');
  const [lineup, setLineup] = useState<LineupAct[]>(editing?.lineup ?? []);
  const [cost, setCost] = useState(editing?.cost ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [comment, setComment] = useState(editing?.comment ?? '');
  const [urls, setUrls] = useState<string[]>(editing?.urls?.length ? editing.urls : ['']);
  const [imageId, setImageId] = useState<string | undefined>(editing?.imageId);
  const [hosted, setHosted] = useState(editing ? isHosted(editing) : hostedByDefault('gig'));
  // Once the member has set it themselves, changing category leaves it alone.
  const [hostedTouched, setHostedTouched] = useState(!!editing);
  const [going, setGoing] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageUrl = eventImageUrl(imageId);

  const chooseCategory = (next: EventCategory) => {
    setCategory(next);
    if (!hostedTouched) setHosted(hostedByDefault(next));
  };

  /** Fills the form from what the page gave. Everything still goes through
   *  buildDraft's checks on save, as if it had been typed. */
  const applyImport = (found: ImportedEvent) => {
    if (str(found.title)) setTitle(str(found.title));
    if (isValidEventDate(str(found.date))) setDate(str(found.date));
    const start = isValidEventTime(str(found.time)) ? str(found.time) : '';
    setTime(start);
    setEndTime(start && isValidEventTime(str(found.endTime)) ? str(found.endTime) : '');
    if (start && str(found.timeZone)) setTimeZone(str(found.timeZone));
    setLocation(str(found.location));
    setCity(str(found.city));
    setDescription(str(found.description));
    setCost(str(found.cost));
    if (Array.isArray(found.lineup)) {
      setLineup(found.lineup.filter((act) => act && typeof act.name === 'string').map((act) => ({ name: act.name })));
    }
    if (Array.isArray(found.urls)) {
      const links = found.urls.filter((u): u is string => typeof u === 'string');
      if (links.length) setUrls(links.slice(0, EVENT_LIMITS.urls));
    }
    if (found.category && EVENT_CATEGORIES.some((c) => c.value === found.category)) chooseCategory(found.category);
    if (!imageId && isValidEventImageId(str(found.imageId))) setImageId(str(found.imageId));
  };

  const runImport = async (raw: string) => {
    const url = raw.trim();
    const source = importSourceFor(url);
    if (!source) {
      setImportNote('paste a link to an event on communal leisure, dice or gel');
      return;
    }
    setImporting(true);
    setImportNote(null);
    try {
      applyImport(await importEventFromLink(url));
      setImportNote(`filled in from ${source.name} — check it over before adding.`);
      window.umami?.track('calendar_event_imported', { source: source.id });
    } catch (err) {
      setImportNote(((err as Error).message || 'Could not read that page.').toLowerCase());
    } finally {
      setImporting(false);
    }
  };

  const handleImage = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError('That image is over 8 MB.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      setImageId(await uploadEventImage(file));
    } catch (err) {
      setError((err as Error).message || 'Image upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setUrl = (index: number, value: string) =>
    setUrls((prev) => prev.map((url, i) => (i === index ? value : url)));

  const removeUrl = (index: number) =>
    setUrls((prev) => (prev.length === 1 ? [''] : prev.filter((_, i) => i !== index)));

  /** The form as a draft, or an error message saying what to fix. */
  const buildDraft = (): EventDraft | string => {
    const cleanTitle = oneLine(title);
    if (!cleanTitle) return 'Give the event a title.';
    if (!isValidEventDate(date)) return 'Pick a date.';
    if (time && !isValidEventTime(time)) return 'The start time is not a time.';
    if (endTime && !time) return 'Add a start time before an end time.';
    if (endTime && !isValidEventTime(endTime)) return 'The end time is not a time.';

    const cleanCity = city.trim().replace(/\s+/g, ' ');
    if (!cleanCity) return 'Add the city it is in.';
    if (!isValidCityName(cleanCity)) {
      return 'A city is letters, with spaces, hyphens, apostrophes or full stops between them.';
    }

    if (lineup.length > EVENT_LIMITS.lineup) {
      return `An event can have at most ${EVENT_LIMITS.lineup} acts in its lineup. Remove ${lineup.length - EVENT_LIMITS.lineup} to save.`;
    }

    const links: string[] = [];
    for (const [i, raw] of urls.entries()) {
      if (!raw.trim()) continue;
      const url = normalizeSiteUrl(raw);
      // The rules refuse characters outside the BMP (emoji) in a link.
      if (!url || url.length > EVENT_LIMITS.url || /[\u{10000}-\u{10FFFF}]/u.test(url)) return `Link ${i + 1} is not a web address.`;
      if (!links.includes(url)) links.push(url);
    }

    return {
      title: cleanTitle.slice(0, EVENT_LIMITS.title),
      date,
      category,
      time: time || undefined,
      endTime: time && endTime ? endTime : undefined,
      timeZone: time ? timeZone : undefined,
      location: oneLine(location).slice(0, EVENT_LIMITS.location) || undefined,
      city: cleanCity,
      lineup,
      cost: oneLine(cost).slice(0, EVENT_LIMITS.cost) || undefined,
      description: sanitizeText(description).trim().slice(0, EVENT_LIMITS.description) || undefined,
      comment: sanitizeText(comment).trim().slice(0, EVENT_LIMITS.comment) || undefined,
      urls: links.slice(0, EVENT_LIMITS.urls),
      imageId,
      hosted,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const draft = buildDraft();
    if (typeof draft === 'string') {
      setError(draft);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(draft, going);
    } catch (err) {
      setError((err as Error).message || 'Could not save the event.');
      setSubmitting(false);
    }
  };

  return (
    <form className="ev-form" onSubmit={handleSubmit} noValidate>
      <div className="ev-form-head">
        <span className="ev-form-head-label">{editing ? 'edit event' : 'new event'}</span>
        <span className="ev-form-head-rule" aria-hidden="true" />
        <button type="button" className="ev-form-cancel" onClick={onCancel} disabled={submitting}>
          cancel
        </button>
      </div>

      <div className="ev-form-grid">
        <div className="ev-form-side">
          {imageUrl ? (
            <div className="ev-form-image">
              <img src={imageUrl} alt="" />
              <button
                type="button"
                className="ev-form-image-remove"
                onClick={() => setImageId(undefined)}
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ev-form-image-add"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'uploading…' : '+ image'}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
            className="ev-form-file"
            onChange={(e) => handleImage(e.target.files?.[0])}
          />
        </div>

        <div className="ev-form-body">
          {!editing && (
            <div className="ev-import">
              <label className="ev-import-label" htmlFor="ev-import-url">
                Automated Fill (works with links from Communal Leisure, Dice or GEL)
              </label>
              <div className="ev-url">
                <input
                  id="ev-import-url"
                  className="ev-input"
                  type="url"
                  inputMode="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text').trim();
                    if (importSourceFor(pasted)) {
                      e.preventDefault();
                      setImportUrl(pasted);
                      runImport(pasted);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      runImport(importUrl);
                    }
                  }}
                  placeholder="https://dice.fm/event/…"
                  disabled={importing}
                />
                <button
                  type="button"
                  className="ev-import-go"
                  onClick={() => runImport(importUrl)}
                  disabled={importing || !importUrl.trim()}
                >
                  {importing ? 'reading…' : 'fill in'}
                </button>
              </div>
              {importNote && <p className="ev-import-note" role="status">{importNote}</p>}
            </div>
          )}

          <div className="ev-field">
            <span className="ev-label" id="ev-cat-label">category</span>
            <div className="ev-cats" role="group" aria-labelledby="ev-cat-label">
              {EVENT_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`ev-cat${category === c.value ? ' is-sel' : ''}`}
                  style={{ '--ec-c': c.colour } as React.CSSProperties}
                  aria-pressed={category === c.value}
                  onClick={() => chooseCategory(c.value)}
                >
                  <span className="ev-cat-dot" aria-hidden="true" />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <label className="ev-field">
            <span className="ev-label">title <span className="ev-req">required</span></span>
            <input
              className="ev-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={EVENT_LIMITS.title}
              placeholder="what's on?"
              required
            />
          </label>

          <div className="ev-row">
            <label className="ev-field">
              <span className="ev-label">date <span className="ev-req">required</span></span>
              <input
                className="ev-input"
                type="date"
                value={date}
                min="2000-01-01"
                max="2099-12-31"
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label className="ev-field">
              <span className="ev-label">starts</span>
              <input className="ev-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <label className="ev-field">
              <span className="ev-label">ends</span>
              <input
                className="ev-input"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={!time}
              />
            </label>
            <label className="ev-field ev-zone">
              <span className="ev-label">time zone</span>
              <select
                className="ev-input"
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value)}
                disabled={!time}
              >
                {!zoneListed && <option value={timeZone}>{timeZone}</option>}
                {EVENT_TIME_ZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="ev-row">
            <label className="ev-field ev-field-wide">
              <span className="ev-label">where</span>
              <input
                className="ev-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={EVENT_LIMITS.location}
                placeholder="venue or address"
              />
            </label>
            <div className="ev-field">
              <span className="ev-label">city <span className="ev-req">required</span></span>
              <CityInput value={city} onChange={setCity} />
            </div>
          </div>

          <div className="ev-field">
            <span className="ev-label">lineup</span>
            <LineupEditor acts={lineup} onChange={setLineup} />
          </div>

          <div className="ev-field">
            <span className="ev-label">description</span>
            <TagTextarea
              value={description}
              onChange={setDescription}
              maxLength={EVENT_LIMITS.description}
              placeholder="use @ to tag artists and albums"
            />
          </div>

          <label className="ev-field">
            <span className="ev-label">Add a Comment</span>
            <textarea
              className="ev-input ev-textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={EVENT_LIMITS.comment}
              placeholder="saw them last year, a friend's playing…"
            />
          </label>

          <label className="ev-field ev-cost">
            <span className="ev-label">cost</span>
            <input
              className="ev-input"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              maxLength={EVENT_LIMITS.cost}
              placeholder="free, £8 otd…"
            />
          </label>

          <div className="ev-field">
            <span className="ev-label">links</span>
            {urls.map((url, i) => (
              <div className="ev-url" key={i}>
                <input
                  className="ev-input"
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(i, e.target.value)}
                  maxLength={EVENT_LIMITS.url}
                  placeholder="https://"
                  aria-label={`Link ${i + 1}`}
                />
                {(urls.length > 1 || url) && (
                  <button type="button" className="ev-url-remove" onClick={() => removeUrl(i)} aria-label={`Remove link ${i + 1}`}>
                    ×
                  </button>
                )}
              </div>
            ))}
            {urls.length < EVENT_LIMITS.urls && (
              <button type="button" className="ev-url-add" onClick={() => setUrls((prev) => [...prev, ''])}>
                + another link
              </button>
            )}
          </div>

          <label className="ev-own">
            <input
              type="checkbox"
              checked={hosted}
              onChange={(e) => {
                setHosted(e.target.checked);
                setHostedTouched(true);
              }}
            />
            <span className="ev-own-mark" aria-hidden="true">{hosted ? '[x]' : '[ ]'}</span>
            this is my event
            <span className="ev-own-note">you're putting it on, playing, or it's your show</span>
          </label>

          {!editing && (
            <label className="ev-own">
              <input type="checkbox" checked={going} onChange={(e) => setGoing(e.target.checked)} />
              <span className="ev-own-mark" aria-hidden="true">{going ? '[x]' : '[ ]'}</span>
              i'm going
              <span className="ev-own-note">you've got a ticket — otherwise you're marked interested</span>
            </label>
          )}

          <div className="ev-actions">
            <button type="submit" className="ev-btn ev-btn-primary" disabled={submitting || uploading}>
              {submitting ? 'saving…' : editing ? 'save' : 'add event'}
            </button>
          </div>

          {error && <p className="ev-error" role="alert">{error}</p>}
        </div>
      </div>
    </form>
  );
};

export default EventForm;
