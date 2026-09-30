import React, { useEffect, useState } from 'react';
import Lightbox from '../basic/Lightbox';
import UsernameLink from '../basic/UsernameLink';
import { eventImageUrl } from '../../utils/eventsApi';
import { getUserData } from '../../utils/userCache';
import { normalizeAvatarPath } from '../../utils/avatarPath';
import { validateUrl } from '../../utils/sanitise';
import EventLineup from './EventLineup';
import EventNotes from './EventNotes';
import InterestedCheck, { InterestMark } from './InterestedCheck';
import { useEventInterests } from '../../utils/eventInterests';
import { attendanceIn, categoryColour, dayLabel, linkLabel, timeLabel, whereLabel, zoneNote, type CalendarEvent } from './eventTypes';
import './EventList.css';

/** The author's avatar beside the name the event was saved under. The avatar
 *  comes through the shared profile cache — one read per author per session,
 *  and none at all for anyone the board has already shown. */
const EventAuthor: React.FC<{ userId: string; username: string }> = ({ userId, username }) => {
  const [avatar, setAvatar] = useState('');

  useEffect(() => {
    if (!userId) return;
    let live = true;
    getUserData(userId)
      .then((data) => {
        if (live) setAvatar(normalizeAvatarPath(data.avatar));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId]);

  return (
    <span className="ev-author">
      {avatar && <img className="ev-author-avatar" src={avatar} alt="" loading="lazy" />}
      <UsernameLink userId={userId || undefined} username={username} className="ev-author-name" />
    </span>
  );
};

interface EventListProps {
  events: CalendarEvent[];
  /** Rows start open; these are the ones the reader has closed. */
  collapsedIds: Set<string>;
  /** The event just linked to, saved or picked on the grid. */
  focusId: string | null;
  currentUserId: string | null;
  isAdmin: boolean;
  onToggle: (id: string) => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}

/** Events as ledger rows, open by default — a day rarely holds more than a
 *  few. Anyone can tick an event into their own calendar; its author can edit
 *  it, and its author or an admin delete it. */
const EventList: React.FC<EventListProps> = ({
  events,
  collapsedIds,
  focusId,
  currentUserId,
  isAdmin,
  onToggle,
  onEdit,
  onDelete,
}) => {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const mine = useEventInterests();

  return (
    <>
      <ul className="ev-rows">
        {events.map((event) => {
          const open = !collapsedIds.has(event.id);
          const isOwner = !!currentUserId && event.userId === currentUserId;
          const image = eventImageUrl(event.imageId);
          const urls = (event.urls ?? []).filter(validateUrl);
          const where = whereLabel(event);
          const { interested, going } = attendanceIn(event, currentUserId, mine);
          const summary = [
            event.category,
            where,
            interested.count > 0 && `${interested.count} interested`,
            going.count > 0 && `${going.count} going`,
          ]
            .filter(Boolean)
            .join(' · ');
          const classes = ['ev-row', open && 'is-open', event.id === focusId && 'is-focus'].filter(Boolean).join(' ');

          return (
            <li
              key={event.id}
              id={`ev-${event.id}`}
              className={classes}
              style={{ '--ec-c': categoryColour(event.category) } as React.CSSProperties}
            >
              <button
                type="button"
                className="ev-row-head"
                onClick={() => onToggle(event.id)}
                aria-expanded={open}
                aria-controls={`ev-detail-${event.id}`}
              >
                <span className="ev-row-dot" aria-hidden="true" />
                <span className="ev-row-time">{timeLabel(event) || 'all day'}</span>
                <span className="ev-row-title">
                  {mine.ids.has(event.id) && <><InterestMark />{' '}</>}
                  {event.title}
                </span>
                <span className="ev-row-where">{summary}</span>
                <span className="ev-row-toggle" aria-hidden="true">{open ? '▴ hide' : '▾ show'}</span>
              </button>

              <div className="ev-detail" id={`ev-detail-${event.id}`}>
                <div className="ev-detail-inner">
                  {open && (
                    <div className={image ? 'ev-detail-body has-image' : 'ev-detail-body'}>
                      {image && (
                        <button
                          type="button"
                          className="ev-detail-image"
                          onClick={() => setLightbox(image)}
                          aria-label={`View ${event.title} image`}
                        >
                          <img src={image} alt="" loading="lazy" />
                        </button>
                      )}

                      <div className="ev-detail-text">
                        <dl className="ev-facts">
                          {event.city && (
                            <>
                              <dt>city</dt>
                              <dd>{event.city}</dd>
                            </>
                          )}
                          <dt>when</dt>
                          <dd>
                            {dayLabel(event.date)}
                            {timeLabel(event) ? `, ${timeLabel(event)}` : ''}
                            {zoneNote(event) ? ` (${zoneNote(event)})` : ''}
                          </dd>
                          {where && (
                            <>
                              <dt>where</dt>
                              <dd>{where}</dd>
                            </>
                          )}
                          {event.lineup && event.lineup.length > 0 && (
                            <>
                              <dt>lineup</dt>
                              <dd><EventLineup acts={event.lineup} /></dd>
                            </>
                          )}
                          {event.cost && (
                            <>
                              <dt>cost</dt>
                              <dd>{event.cost}</dd>
                            </>
                          )}
                          {event.username && (
                            <>
                              <dt>added by</dt>
                              <dd>
                                <EventAuthor userId={event.userId} username={event.username} />
                              </dd>
                            </>
                          )}
                        </dl>

                        <EventNotes event={event} descClassName="ev-desc" />

                        {urls.length > 0 && (
                          <ul className="ev-links">
                            {urls.map((url) => (
                              <li key={url}>
                                <a href={url} target="_blank" rel="noopener noreferrer">{linkLabel(url)}</a>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="ev-detail-actions">
                          <InterestedCheck event={event} />
                          {isOwner && (
                            <button type="button" className="ev-word" onClick={() => onEdit(event)}>
                              edit
                            </button>
                          )}
                          {(isOwner || isAdmin) && (
                            <button type="button" className="ev-word ev-word-del" onClick={() => onDelete(event)}>
                              del
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
};

export default EventList;
