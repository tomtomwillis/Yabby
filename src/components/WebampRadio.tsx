import { useEffect, useRef, useState } from "react";
import RadioPlayer from "./RadioPlayer";
import "./WebampRadio.css";

const STREAM_URL = "https://radio.yabbyville.xyz/live";
const STATUS_URL = "https://radio.yabbyville.xyz/status-json.xsl";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebampInstance = any;

const DESKTOP_QUERY = "(min-width: 768px)";

interface WebampRadioProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const WebampRadio: React.FC<WebampRadioProps> = ({ containerRef }) => {
  const [nowPlaying, setNowPlaying] = useState("");
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP_QUERY).matches
  );
  const [webampLoading, setWebampLoading] = useState(false);
  const [webampError, setWebampError] = useState<string | null>(null);

  const webampRef = useRef<WebampInstance>(null);
  const hasRenderedRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);

  // --- Responsive: track desktop vs mobile ---
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

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

  // --- Auto-load Webamp on desktop ---
  useEffect(() => {
    if (!isDesktop) return;
    if (hasRenderedRef.current) return;
    if (!containerRef.current) return;

    const container = containerRef.current;
    let disposed = false;

    const initWebamp = async () => {
      setWebampLoading(true);
      setWebampError(null);

      try {
        const mod = await import("webamp/butterchurn");
        const WebampClass = mod.default || mod;

        const butterchurn = await import("butterchurn");
        const presetsMod = await import("butterchurn-presets");
        const presetMap = presetsMod.default || presetsMod;

        if (disposed) return;

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
              position: { top: 0, left: 550 },
              size: { extraWidth: 8, extraHeight: 4 },
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

        if (disposed) return;

        await webamp.renderWhenReady(container);

        webampRef.current = webamp;
        hasRenderedRef.current = true;
      } catch (err) {
        if (!disposed) {
          console.error("Webamp init failed:", err);
          setWebampError("Failed to initialize the radio player.");
        }
      } finally {
        if (!disposed) {
          setWebampLoading(false);
        }
      }
    };

    initWebamp();

    return () => {
      disposed = true;
    };
  }, [isDesktop]);

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

  return (
    <div className="webamp-radio-section">
      <div className="title1">Radio</div>

      {isDesktop ? (
        <>
          {webampLoading && (
            <p className="webamp-radio-loading">Loading player...</p>
          )}

          {webampError && (
            <p className="webamp-radio-error">{webampError}</p>
          )}

          {nowPlaying && (
            <div className="webamp-radio-now-playing">
              Now Playing: {nowPlaying}
            </div>
          )}
        </>
      ) : (
        <RadioPlayer nowPlaying={nowPlaying} />
      )}
    </div>
  );
};

export default WebampRadio;
