import { useEffect, useRef, useState } from "react";
import "./RadioPlayer.css";

const STREAM_URL = "https://radio.yabbyville.xyz/live";

const RadioPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

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
    <div className="radio-player">
      <audio ref={audioRef} src={STREAM_URL} preload="none" />

      <div className="radio-player-controls">
        <button className="radio-player-play" onClick={togglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>

        <button
          className="radio-player-mute"
          onClick={() => setIsMuted((m) => !m)}
        >
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
          className="radio-player-volume"
          aria-label="Volume"
        />
      </div>
    </div>
  );
};

export default RadioPlayer;
