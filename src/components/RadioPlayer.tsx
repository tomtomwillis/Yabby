import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Visualizer } from "butterchurn";
import { useRadioMetadata } from "../utils/useRadioMetadata";
import "./RadioPlayer.css";

const STREAM_URL = "https://radio.yabbyville.xyz/live";

// Border glyph count. Fixed rather than width-derived — the row is decorative
// and clips under overflow: hidden on narrow panels.
const BORDER_CHARS = 64;
const VOL_BLOCKS = 8;

/** The animated ASCII border. Each char is phase-shifted via --i so the row
 *  reads as a travelling wave; the keyframes only run under .rp-is-playing. */
const WaveBorder: React.FC = () => (
  <div className="rp-wave" aria-hidden="true">
    {Array.from({ length: BORDER_CHARS }, (_, i) => (
      <span
        key={i}
        className="rp-wave-ch"
        style={{ ["--i"]: i } as React.CSSProperties}
      >
        =
      </span>
    ))}
  </div>
);

interface VolumeBlocksProps {
  value: number;
  onChange: (v: number) => void;
}

/** Block-glyph volume bar with an invisible range input on top, so drag, touch
 *  and keyboard come for free (mirrors the sticker player's sp-blocks). */
const VolumeBlocks: React.FC<VolumeBlocksProps> = ({ value, onChange }) => {
  const filled = Math.round(Math.min(Math.max(value, 0), 1) * VOL_BLOCKS);
  return (
    <div className="rp-blocks">
      <span className="rp-blocks-glyphs" aria-hidden="true">
        {Array.from({ length: VOL_BLOCKS }, (_, i) => (
          <span key={i} className={i < filled ? "rp-blocks-fill" : "rp-blocks-rest"}>
            {i < filled ? "▓" : "░"}
          </span>
        ))}
      </span>
      <input
        className="rp-range"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label="Volume"
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
};

const RadioPlayer: React.FC = () => {
  const { artist, title } = useRadioMetadata();

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const visualizerRef = useRef<Visualizer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const fsLayerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Mirror state into refs the rAF closure can read without re-subscribing.
  const playingRef = useRef(false);
  const fullscreenRef = useRef(false);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  // Match butterchurn's render buffer to whichever container now holds the
  // canvas (docked box or fullscreen layer). setRendererSize alone does not
  // resize the canvas backing store in this butterchurn version, so the canvas
  // dimensions are set explicitly (at device pixels) to keep it crisp.
  const sizeViz = () => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const viz = visualizerRef.current;
    if (!canvas || !host || !viz) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round((host.clientWidth || 1) * dpr));
    const h = Math.max(1, Math.round((host.clientHeight || 1) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    viz.setRendererSize(w, h);
  };

  const startLoop = () => {
    if (rafRef.current != null) return;
    const frame = () => {
      const viz = visualizerRef.current;
      // Skip rendering while paused and docked — spares the GPU when idle.
      if (viz && (playingRef.current || fullscreenRef.current)) viz.render();
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  // MediaElementSource can only be created once per element, so guard on the
  // ref. Routing through the graph replaces the element's direct output, hence
  // the explicit connect to destination for sound.
  const ensureAudioGraph = (): AudioContext => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctx = window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaElementSource(audioRef.current!);
    src.connect(ctx.destination);
    sourceRef.current = src;
    return ctx;
  };

  const initVisualizer = async (ctx: AudioContext) => {
    if (visualizerRef.current || !dockRef.current) return;
    const [{ default: butterchurn }, { default: presets }] = await Promise.all([
      import("butterchurn"),
      import("butterchurn-presets"),
    ]);
    if (visualizerRef.current) return; // a second play() may have raced in

    // Append to whichever container is active now — the user may have hit
    // fullscreen while butterchurn was still loading.
    const host = (fullscreenRef.current && fsLayerRef.current) || dockRef.current;
    const canvas = document.createElement("canvas");
    canvas.className = "rp-canvas";
    host.appendChild(canvas);
    canvasRef.current = canvas;

    const dpr = window.devicePixelRatio || 1;
    const viz = butterchurn.createVisualizer(ctx, canvas, {
      width: (host.clientWidth || 300) * dpr,
      height: (host.clientHeight || 150) * dpr,
      pixelRatio: 1,
      textureRatio: 1,
    });
    viz.connectAudio(sourceRef.current!);
    const all = presets.getPresets();
    const keys = Object.keys(all);
    viz.loadPreset(all[keys[Math.floor(Math.random() * keys.length)]], 0);
    visualizerRef.current = viz;
    sizeViz();
    startLoop();
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    window.umami?.track("radio_play");
    const ctx = ensureAudioGraph();
    // Kick off the visualiser first so its init never waits on (or is skipped
    // by) a stalled resume()/play() — the stream may fail to load entirely.
    initVisualizer(ctx);
    try {
      if (ctx.state === "suspended") await ctx.resume();
      await audio.play();
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") console.error("Playback failed:", err);
    }
  };

  // Move the (React-independent) canvas between docked box and fullscreen layer
  // by re-parenting the same node, which preserves its WebGL context.
  useEffect(() => {
    fullscreenRef.current = fullscreen;
    const canvas = canvasRef.current;
    const target = fullscreen ? fsLayerRef.current : dockRef.current;
    if (canvas && target && canvas.parentElement !== target) {
      target.appendChild(canvas);
    }
    if (fullscreen) startLoop();
    requestAnimationFrame(sizeViz);
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  useEffect(() => {
    const onResize = () => sizeViz();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const nowPlaying = title
    ? artist
      ? `${artist} · ${title}`
      : title
    : "tuning in…";

  return (
    <div className={`rp ${isPlaying ? "rp-is-playing" : ""}`}>
      <audio
        ref={audioRef}
        src={STREAM_URL}
        crossOrigin="anonymous"
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => setIsPlaying(false)}
      />

      <div className="rp-frame">
        <WaveBorder />

        <div className="rp-row">
          <span className="rp-brand">[ YABBYVILLE RADIO ]</span>
          <button
            className="rp-btn rp-play"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>
          <span className="rp-vol-label">VOL</span>
          <VolumeBlocks
            value={isMuted ? 0 : volume}
            onChange={(v) => {
              setVolume(v);
              if (v > 0 && isMuted) setIsMuted(false);
            }}
          />
          <button
            className="rp-btn rp-mute"
            onClick={() => setIsMuted((m) => !m)}
            aria-pressed={isMuted}
          >
            {isMuted ? "UNMUTE" : "MUTE"}
          </button>
        </div>

        <div className="rp-nowplaying">{nowPlaying}</div>

        <WaveBorder />
      </div>

      <div className={`rp-viz ${fullscreen ? "rp-viz--fs" : ""}`}>
        <div ref={dockRef} className="rp-viz-dock" />
        <button
          className="rp-viz-fs"
          onClick={() => setFullscreen((v) => !v)}
          aria-label={fullscreen ? "Exit fullscreen visualiser" : "Expand visualiser to fullscreen"}
        >
          {fullscreen ? "[ ✕ ]" : "[ ⛶ ]"}
        </button>
      </div>

      {createPortal(
        <div
          ref={fsLayerRef}
          className={`rp-viz-fullscreen ${fullscreen ? "is-active" : ""}`}
          aria-hidden="true"
        />,
        document.body,
      )}
    </div>
  );
};

export default RadioPlayer;
