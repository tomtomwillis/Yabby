import { useEffect, useRef, useState } from "react";

const STATUS_URL = "https://radio.yabbyville.xyz/status-json.xsl";

export const useRadioMetadata = () => {
  const [nowPlaying, setNowPlaying] = useState("");
  const pollAbortRef = useRef<AbortController | null>(null);

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

  return { nowPlaying };
};
