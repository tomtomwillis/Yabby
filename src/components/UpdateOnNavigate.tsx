import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { isUpdateReady } from '../utils/appUpdate';
import { usePlayerState } from '../utils/usePlayer';

/** Picks up a waiting build on the next route change. Whatever was on the old
 *  page is gone by then anyway, and a paused queue comes back after the reload.
 *  Sound that is still playing would stop, so that waits for a later route. */
function UpdateOnNavigate() {
  const { pathname } = useLocation();
  const { isPlaying } = usePlayerState();
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    if (isUpdateReady() && !isPlayingRef.current) window.location.reload();
  }, [pathname]);

  return null;
}

export default UpdateOnNavigate;
