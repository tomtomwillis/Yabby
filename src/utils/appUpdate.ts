/* A new service worker takes over as soon as it installs, but the page already
   open keeps running the build it loaded with. Reloading it there and then would
   cut off the music and lose whatever was being typed, so the reload waits for
   a moment the member has already left the page they were on. */

const STALE_CHUNK_KEY = 'yabby.staleChunkReload';
const STALE_CHUNK_GAP_MS = 60_000;

let updateReady = false;

export function markUpdateReady(): void {
  updateReady = true;
}

export function isUpdateReady(): boolean {
  return updateReady;
}

/** A page outliving its build asks for chunks the deploy has since deleted. The
    only way forward is the new build. Limited to one try a minute, because the
    same failure while offline would otherwise reload for ever. */
export function reloadForStaleChunk(event: Event): void {
  try {
    const last = Number(sessionStorage.getItem(STALE_CHUNK_KEY));
    if (Date.now() - last < STALE_CHUNK_GAP_MS) return;
    sessionStorage.setItem(STALE_CHUNK_KEY, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
}
