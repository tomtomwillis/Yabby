import { useEffect, useRef, useState, useCallback } from "react";
import "./WebampRadio.css";

const STREAM_URL = "https://radio.yabbyville.xyz/live";
const STATUS_URL = "https://radio.yabbyville.xyz/status-json.xsl";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebampInstance = any;

const WebampRadio: React.FC = () => {
  const [nowPlaying, setNowPlaying] = useState("");
  const [webampLoaded, setWebampLoaded] = useState(false);
  const [webampLoading, setWebampLoading] = useState(false);
  const [webampClosed, setWebampClosed] = useState(false);
  const [webampError, setWebampError] = useState<string | null>(null);

  const webampRef = useRef<WebampInstance>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasRenderedRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);

  // --- Poll status-json.xsl on mount, every 30 seconds ---
  useEffect(() => {
    const abortController = new AbortController();
    pollAbortRef.current = abortController;

    const poll = async () => {
      try {
        const res = await fetch(STATUS_URL, {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const source = data?.icestats?.source;
        const title = Array.isArray(source)
          ? source[0]?.title
          : source?.title;
        if (typeof title === "string" && title.trim() !== "") {
          setNowPlaying(title.trim());
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.debug("Metadata poll skipped:", err);
      }
    };

    poll();
    const interval = window.setInterval(() => {
      if (abortController.signal.aborted) {
        clearInterval(interval);
        return;
      }
      poll();
    }, 30_000);

    return () => {
      abortController.abort();
      clearInterval(interval);
    };
  }, []);

  // --- Load webamp on click, or reopen if closed ---
  const handleRadioClick = useCallback(async () => {
    // If webamp was closed, reopen it
    if (webampLoaded && webampClosed && webampRef.current) {
      webampRef.current.reopen();
      setWebampClosed(false);
      return;
    }

    // First-time load
    if (hasRenderedRef.current || webampLoading) return;
    if (!containerRef.current) return;

    const container = containerRef.current;
    setWebampLoading(true);
    setWebampError(null);

    try {
      const mod = await import("webamp/butterchurn");
      const WebampClass = mod.default || mod;

      const butterchurn = await import("butterchurn");
      const presetsMod = await import("butterchurn-presets");
      const presetMap = presetsMod.default || presetsMod;

      const webamp = new WebampClass({
        initialTracks: [
          {
            metaData: {
              artist: "YabbyVille",
              title: "Radio",
            },
            url: STREAM_URL,
          },
        ],
        windowLayout: {
          main: {
            position: { top: 0, left: 0 },
            shadeMode: false,
            closed: false,
          },
          equalizer: {
            position: { top: 230, left: 0 },
            shadeMode: false,
            closed: true,
          },
          playlist: {
            position: { top: 28, left: 0 },
            shadeMode: false,
            size: { extraHeight: 3, extraWidth: 11 },
            closed: true,
          },
          milkdrop: {
            position: { top: 230, left: 0 },
            size: { extraWidth: 11, extraHeight: 5 },
            closed: false,
          },
        },
        enableDoubleSizeMode: true,
        __butterchurnOptions: {
          importButterchurn: () => Promise.resolve(butterchurn),
          getPresets: async () => {
            return Object.keys(presetMap).map((name) => ({
              name,
              butterchurnPresetObject: presetMap[name],
            }));
          },
          butterchurnOpen: true,
        },
      });

      // Intercept the default close (which disposes) — cancel and use .close() instead
      webamp.onWillClose((cancel: () => void) => {
        cancel();
        webamp.close();
      });

      webamp.onClose(() => {
        setWebampClosed(true);
      });

      await webamp.renderWhenReady(container);

      webampRef.current = webamp;
      hasRenderedRef.current = true;
      setWebampLoaded(true);
    } catch (err) {
      console.error("Webamp init failed:", err);
      setWebampError("Failed to initialize the radio player.");
    } finally {
      setWebampLoading(false);
    }
  }, [webampLoading, webampLoaded, webampClosed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (webampRef.current) {
        try {
          webampRef.current.dispose();
        } catch {
          // Webamp dispose may fail silently
        }
      }
      if (pollAbortRef.current) {
        pollAbortRef.current.abort();
      }
    };
  }, []);

  const showLink = !webampLoaded || webampClosed;

  return (
    <div className="webamp-radio-section">
      <div className="title1 webamp-radio-title-row">
        {showLink ? (
          <span
            className="webamp-radio-link"
            onClick={handleRadioClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleRadioClick();
            }}
          >
            Radio {webampLoading ? "(Loading...)" : "→"}
          </span>
        ) : (
          <span>Radio</span>
        )}
        {nowPlaying && (
          <span className="webamp-radio-now-playing">
            Now Playing: {nowPlaying}
          </span>
        )}
      </div>

      {webampError && (
        <p className="webamp-radio-error">{webampError}</p>
      )}

      <div ref={containerRef} className="webamp-radio-container" />
    </div>
  );
};

export default WebampRadio;
