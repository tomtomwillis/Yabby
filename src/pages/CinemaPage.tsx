import { useEffect, useRef, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc } from 'firebase/firestore';
import Hls from 'hls.js';
import Header from '../components/basic/Header';
import { auth, db } from '../firebaseConfig';
import './CinemaPage.css';

function formatNextShowing(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STREAM_URL =
  import.meta.env.VITE_CINEMA_STREAM_URL ||
  'https://cinema.yabbyville.xyz/cinema/index.m3u8';

const GRANT_REFRESH_MS = 50 * 60 * 1000; // 50 min — cookie lasts 60
const OFFAIR_RETRY_MS = 20 * 1000;

type StreamState = 'connecting' | 'playing' | 'offair' | 'error';

function CinemaPage() {
  const [user] = useAuthState(auth);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const grantTimerRef = useRef<number | null>(null);
  const initialResolvedRef = useRef(false);
  const [state, setState] = useState<StreamState>('connecting');
  const [showPlayPrompt, setShowPlayPrompt] = useState(false);
  const [animateCurtains, setAnimateCurtains] = useState(false);
  const [nextShowingAt, setNextShowingAt] = useState<string>('');

  // Issue / refresh the signed cookie used by Caddy forward_auth.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const grant = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/cinema/grant', {
          method: 'POST',
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`grant ${res.status}`);
      } catch (err) {
        if (!cancelled) {
          console.error('[cinema] grant failed', err);
          setState('error');
        }
      }
    };

    grant();
    grantTimerRef.current = window.setInterval(grant, GRANT_REFRESH_MS);

    return () => {
      cancelled = true;
      if (grantTimerRef.current) window.clearInterval(grantTimerRef.current);
    };
  }, [user]);

  // Attach the HLS player. On fatal errors, drop to offair and retry.
  useEffect(() => {
    if (!user) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

    const attach = () => {
      if (cancelled) return;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 60,
          xhrSetup: (xhr) => {
            xhr.withCredentials = true;
          },
        });
        hlsRef.current = hls;
        hls.loadSource(STREAM_URL);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setState('playing');
          video.play().catch(() => setShowPlayPrompt(true));
        });

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          setState('offair');
          hls.destroy();
          hlsRef.current = null;
          retryTimerRef.current = window.setTimeout(attach, OFFAIR_RETRY_MS);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari — native HLS
        video.src = STREAM_URL;
        video.addEventListener(
          'loadedmetadata',
          () => {
            setState('playing');
            video.play().catch(() => setShowPlayPrompt(true));
          },
          { once: true },
        );
        video.addEventListener('error', () => {
          setState('offair');
          retryTimerRef.current = window.setTimeout(attach, OFFAIR_RETRY_MS);
        });
      } else {
        setState('error');
      }
    };

    attach();

    window.umami?.track?.('cinema-open');

    return () => {
      cancelled = true;
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [user]);

  // Load the admin-set next showing time once on mount.
  useEffect(() => {
    getDoc(doc(db, 'cinema', 'state'))
      .then((snap) => {
        const value = snap.exists() ? ((snap.data() as { nextShowingAt?: string }).nextShowingAt ?? '') : '';
        setNextShowingAt(value);
      })
      .catch((err) => console.error('[cinema] state load failed', err));
  }, []);

  // First resolution of stream state snaps curtains without animating;
  // any later transitions (stream drops, returns) animate.
  useEffect(() => {
    if (initialResolvedRef.current) return;
    if (state === 'connecting') return;
    initialResolvedRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimateCurtains(true));
    });
  }, [state]);

  const handleManualPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.play()
      .then(() => setShowPlayPrompt(false))
      .catch(() => {});
  };

  const curtainsOpen = state === 'playing';
  const nextShowingLabel = nextShowingAt ? formatNextShowing(nextShowingAt) : 'TBD';
  const plateText = curtainsOpen ? 'NOW SHOWING' : `NEXT SHOWING: ${nextShowingLabel}`;

  return (
    <div className="app-container">
      <div className="cinema-blackout" aria-hidden="true" />
      <Header title="Cinema" subtitle="live screenings of this months Flim Club" />

      <div className="cinema-stage">
        <div className="cinema-frame">
          <div
            className={
              'cinema-curtain cinema-curtain--left' +
              (curtainsOpen ? ' cinema-curtain--open' : '') +
              (animateCurtains ? ' cinema-curtain--anim' : '')
            }
            aria-hidden="true"
          />
          <div
            className={
              'cinema-curtain cinema-curtain--right' +
              (curtainsOpen ? ' cinema-curtain--open' : '') +
              (animateCurtains ? ' cinema-curtain--anim' : '')
            }
            aria-hidden="true"
          />

          <div
            className={
              'cinema-screen' + (curtainsOpen ? ' cinema-screen--live' : '')
            }
          >
            <video
              ref={videoRef}
              className="cinema-video"
              controls
              playsInline
              preload="none"
              poster=""
            />
            {showPlayPrompt && curtainsOpen && (
              <button
                type="button"
                className="cinema-play-prompt"
                onClick={handleManualPlay}
              >
                ▶ Tap to start the film
              </button>
            )}
          </div>
        </div>

        <div className="cinema-divider" aria-hidden="true">
          ─ ─ ─ ✦ ─ ─ ─
        </div>

        <div className="cinema-plate">
          <span className="cinema-plate__bracket">[</span>
          <span className="cinema-plate__bulb" />
          <span className="cinema-plate__text">{plateText}</span>
          <span className="cinema-plate__bulb" />
          <span className="cinema-plate__bracket">]</span>
        </div>
      </div>
    </div>
  );
}

export default CinemaPage;
