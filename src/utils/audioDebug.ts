import { fetchSubsonicJson } from './navidrome';

// Opt-in diagnostics for reports we cannot reproduce. A member turns it on from
// the console with localStorage.setItem('yabby:audio-debug', '1') and reloads.
const DEBUG_KEY = 'yabby:audio-debug';

export const audioDebugEnabled: boolean = (() => {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
})();

export function audioLog(...args: unknown[]): void {
  if (!audioDebugEnabled) return;
  console.log(`%c[audio ${new Date().toISOString().slice(11, 23)}]`, 'color:#2a5bd7', ...args);
}

function ranges(r: TimeRanges): string {
  const out: string[] = [];
  for (let i = 0; i < r.length; i++) out.push(`${r.start(i).toFixed(1)}-${r.end(i).toFixed(1)}`);
  return out.join(',') || 'none';
}

function elementState(el: HTMLAudioElement) {
  return {
    t: Number(el.currentTime.toFixed(2)),
    dur: Number.isFinite(el.duration) ? Number(el.duration.toFixed(2)) : el.duration,
    rate: el.playbackRate,
    defaultRate: el.defaultPlaybackRate,
    preservesPitch: (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch,
    paused: el.paused,
    readyState: el.readyState,
    networkState: el.networkState,
    buffered: ranges(el.buffered),
  };
}

const EVENTS = [
  'loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough',
  'durationchange', 'play', 'playing', 'pause', 'waiting', 'stalled', 'suspend',
  'seeking', 'seeked', 'ratechange', 'ended', 'error', 'emptied', 'abort',
];

/**
 * Logs the element's events, and every 2s while playing compares how far
 * currentTime moved against the wall clock. A pitch rise that shows up there
 * is the element or decoder running fast; one that does not is downstream of
 * it — Web Audio resampling or the output device.
 */
export function attachAudioDebug(el: HTMLAudioElement, label: string): () => void {
  if (!audioDebugEnabled) return () => {};
  const onEvent = (e: Event) => {
    if (e.type === 'error') {
      audioLog(label, 'error', el.error?.code, el.error?.message, elementState(el));
      return;
    }
    audioLog(label, e.type, elementState(el));
  };
  EVENTS.forEach((type) => el.addEventListener(type, onEvent));

  let last: { media: number; wall: number } | null = null;
  const tick = window.setInterval(() => {
    if (el.paused || el.readyState < 2) { last = null; return; }
    const now = { media: el.currentTime, wall: performance.now() / 1000 };
    if (last) {
      const mediaDelta = now.media - last.media;
      const wallDelta = now.wall - last.wall;
      const speed = wallDelta > 0 ? mediaDelta / wallDelta : 0;
      // Under 2% off is timer jitter; flag anything beyond it.
      const flag = Math.abs(speed - 1) > 0.02 ? ' ⚠️' : '';
      audioLog(label, `tick speed=${speed.toFixed(3)}${flag}`, elementState(el));
    }
    last = now;
  }, 2000);

  return () => {
    EVENTS.forEach((type) => el.removeEventListener(type, onEvent));
    window.clearInterval(tick);
  };
}

/** What the file is and how the proxy serves it — Range support and a known
 *  length decide how Safari buffers and decodes it. */
export function logTrackSource(trackId: string, src: string): void {
  if (!audioDebugEnabled) return;
  fetchSubsonicJson('getSong', { id: trackId })
    .then((root) => {
      const s = root?.song ?? {};
      audioLog('track', {
        id: trackId,
        suffix: s.suffix,
        contentType: s.contentType,
        bitRate: s.bitRate,
        samplingRate: s.samplingRate,
        bitDepth: s.bitDepth,
        channels: s.channelCount,
        duration: s.duration,
        transcodedSuffix: s.transcodedSuffix,
      });
    })
    .catch((err) => audioLog('track metadata failed', String(err)));

  fetch(src, { headers: { Range: 'bytes=0-1' } })
    .then((res) => {
      audioLog('stream headers', {
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentLength: res.headers.get('content-length'),
        contentRange: res.headers.get('content-range'),
        acceptRanges: res.headers.get('accept-ranges'),
      });
      return res.body?.cancel();
    })
    .catch((err) => audioLog('stream probe failed', String(err)));
}

export function logEnvironment(): void {
  if (!audioDebugEnabled) return;
  audioLog('environment', {
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    vizPref: localStorage.getItem('yabby:viz') ?? localStorage.getItem('yabby:radio-viz'),
  });
}
