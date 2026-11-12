import { getMusicAccount } from './musicSession';
import { fetchSubsonicJson } from './navidrome';

/** The usual scrobble rule: half the track or four minutes, whichever is first. */
const SUBMIT_AFTER_MAX_S = 240;
/** Time updates arrive a few times a second; a bigger jump is a seek or a
 *  reload, and is not listening. */
const MAX_STEP_S = 2;

function send(id: string, submission: boolean, time: number) {
  // Through the gate only on the member's own account; the shared one has no
  // history of its own to keep.
  if (getMusicAccount() !== 'own') return;
  // Must stay a fetch, never an <img> or a beacon: the gate admits scrobble only
  // with Sec-Fetch-Dest: empty, so another page cannot fire it with an embed.
  fetchSubsonicJson('scrobble', { id, submission: String(submission), time }).catch(() => undefined);
}

/**
 * Now-playing and scrobble reports for the library element, one play at a
 * time. The player calls begin when it loads a track, playing on the
 * element's playing event, and progress on each time update.
 */
export function createScrobbler() {
  let play: { id: string; startedAt: number; heard: number; last: number; submitted: boolean } | null = null;

  return {
    begin(id: string) {
      play = { id, startedAt: 0, heard: 0, last: 0, submitted: false };
    },
    end() {
      play = null;
    },
    playing(currentTime: number) {
      if (!play) return;
      play.last = currentTime;
      if (play.startedAt) return;
      play.startedAt = Date.now();
      send(play.id, false, play.startedAt);
    },
    progress(currentTime: number, duration: number) {
      if (!play || !play.startedAt || play.submitted) return;
      const step = currentTime - play.last;
      play.last = currentTime;
      if (step > 0 && step < MAX_STEP_S) play.heard += step;
      if (!(duration > 0) || play.heard < Math.min(duration / 2, SUBMIT_AFTER_MAX_S)) return;
      play.submitted = true;
      send(play.id, true, play.startedAt);
    },
  };
}
