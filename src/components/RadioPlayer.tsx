import React, { useEffect, useRef, useState } from "react";
import { IcecastMetadataReader } from "icecast-metadata-js";
import "./RadioPlayer.css";

const STREAM_URL = "https://radio.yabbyville.xyz/"; // Caddy proxies / → /live

const RadioPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [metadata, setMetadata] = useState({
    artist: "YabbyVille Radio",
    track: "",
  });
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);

  //
  // Sync volume + mute with the audio element
  //
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  //
  // Metadata reader setup for MP3 ICY metadata
  //
  useEffect(() => {
    const controller = new AbortController();

    async function start() {
      try {
        // Request stream with metadata enabled
        const response = await fetch(STREAM_URL, {
          headers: { "Icy-MetaData": "1" },
          signal: controller.signal,
        });

        if (!response.body) {
          console.warn("No response body from stream");
          return;
        }

        const reader = response.body.getReader();

        // ICY metadata parser
        const metadataReader = new IcecastMetadataReader({
  metadataTypes: ["icy"],
  onMetadata: (meta: any) => {
    console.log("RAW META:", meta);

    let title: string | null = null;

    if (meta.StreamTitle) {
      // ICY MP3 metadata
      title = meta.StreamTitle.replace(/'/g, "").trim();
    } else if (meta.ARTIST || meta.TITLE) {
      // Ogg-style metadata
      title = `${meta.ARTIST || ""} - ${meta.TITLE || ""}`.trim();
    }

    if (!title) return;

    const parts = title.split(" - ");

    setMetadata({
      artist: parts[0] || "YabbyVille Radio",
      track: parts.slice(1).join(" - ") || "",
    });
  },
});

        // Read stream chunks
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          await metadataReader.asyncReadAll(value);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Metadata error:", err);
        }
      }
    }

    start();

    return () => controller.abort();
  }, []);

  //
  // Play / Pause
  //
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.error("Playback failed:", err));
    }
  };

  return (
    <div className="radio-player-container">
      {/* Audio element */}
      <audio ref={audioRef} src={STREAM_URL} />

      {/* Metadata */}
      <div className="metadata">
        <strong>{metadata.artist}</strong>
        {metadata.track && <div>{metadata.track}</div>}
      </div>

      {/* Controls */}
      <div className="player-controls">
        <button className="play-button" onClick={togglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>

        <div className="volume-control">
          <button className="mute-button" onClick={() => setIsMuted(!isMuted)}>
            {isMuted ? "Unmute" : "Mute"}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolume(v);
              if (v > 0 && isMuted) setIsMuted(false);
            }}
            className="volume-slider"
          />
        </div>
      </div>
    </div>
  );
};

export default RadioPlayer;
