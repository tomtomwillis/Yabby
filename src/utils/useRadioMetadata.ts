import { useEffect, useState } from "react";

const STATUS_URL = "https://radio.yabbyville.xyz/status-json.xsl";

/** Icecast now-playing, polled while `enabled`. State is deliberately kept when
 *  it goes false, so returning to the radio shows the last known track rather
 *  than flashing "tuning in…". */
export const useRadioMetadata = (enabled: boolean) => {
  const [nowPlaying, setNowPlaying] = useState("");
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const abortController = new AbortController();

    const poll = async () => {
      try {
        const res = await fetch(STATUS_URL, {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const source = data?.icestats?.source;
        const rawTitle = Array.isArray(source)
          ? source[0]?.title
          : source?.title;
        if (typeof rawTitle === "string" && rawTitle.trim() !== "") {
          const decoded = new DOMParser().parseFromString(rawTitle.trim(), "text/html").documentElement.textContent ?? rawTitle.trim();
          setNowPlaying(decoded);
          // Icecast reports "Artist - Title"; split on the first " - " only, so
          // titles containing a dash keep it. No separator → artist blank, title raw.
          const dash = decoded.indexOf(" - ");
          if (dash !== -1) {
            setArtist(decoded.slice(0, dash).trim());
            setTitle(decoded.slice(dash + 3).trim());
          } else {
            setArtist("");
            setTitle(decoded);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.debug("Metadata poll skipped:", err);
      }
    };

    poll();
    // Nothing to read on a hidden tab, and this would otherwise be two requests
    // a minute forever on one left open.
    const interval = window.setInterval(() => {
      if (abortController.signal.aborted) {
        clearInterval(interval);
        return;
      }
      if (!document.hidden) poll();
    }, 30_000);

    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      abortController.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return { nowPlaying, artist, title };
};
