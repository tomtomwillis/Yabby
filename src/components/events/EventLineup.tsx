import React, { Fragment } from 'react';
import NavidromeTagLink from '../basic/NavidromeTagLink';
import { navidromeHref } from '../../utils/navidromeSearch';
import type { LineupAct } from './eventTypes';

/** The bill, one act after another. An act in the library is a tag — hover
 *  for its card, click to pin it — and one that is not is just its name. */
const EventLineup: React.FC<{ acts: LineupAct[] }> = ({ acts }) => (
  <span className="ev-lineup">
    {acts.map((act, i) => (
      <Fragment key={`${i}-${act.name}`}>
        {i > 0 && <span className="ev-lineup-sep" aria-hidden="true"> · </span>}
        {act.artistId ? (
          <NavidromeTagLink target={{ type: 'artist', id: act.artistId }} href={navidromeHref('artist', act.artistId)}>
            {act.name}
          </NavidromeTagLink>
        ) : (
          <span>{act.name}</span>
        )}
      </Fragment>
    ))}
  </span>
);

export default EventLineup;
