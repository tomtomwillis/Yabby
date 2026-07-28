import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Visualizer } from 'butterchurn';
import '../components/VisualiserDock.css';

// The visualiser is off until asked for; the choice sticks between visits.
// Read through the radio-only key it replaced so nobody's preference resets.
const VIZ_KEY = 'yabby:viz';
const LEGACY_VIZ_KEY = 'yabby:radio-viz';

function readVizPref(): boolean {
  return (localStorage.getItem(VIZ_KEY) ?? localStorage.getItem(LEGACY_VIZ_KEY)) === '1';
}

interface AudioGraph {
  ctx: AudioContext;
  /** Both sources summed, before volume. The visualiser taps here so muting
   *  does not flatline it, and so neither source is ever reconnected. */
  mix: GainNode;
  /** Carries volume and mute. */
  out: GainNode;
}

export interface AudioEngine {
  /** Builds the graph once. Must be called synchronously from a user gesture.
   *  Returns null if the browser refused — playback then falls back to the
   *  elements' own output, without a visualiser. */
  ensureGraph: () => AudioGraph | null;
  resumeGraph: (graph: AudioGraph | null) => void;
  applyVolume: (volume: number, muted: boolean) => void;
  /** Safe to call at any time; no-ops while the visualiser is closed. */
  ensureVisualizer: () => void;

  vizOpen: boolean;
  vizFullscreen: boolean;
  vizReady: boolean;
  setVizOpen: (open: boolean) => void;
  setVizFullscreen: (fullscreen: boolean) => void;
  registerVizHost: (el: HTMLDivElement | null) => void;
  fullscreenPortal: React.ReactNode;
}

/**
 * Owns the single AudioContext, the two source nodes and the butterchurn canvas.
 *
 * The canvas is created once and never destroyed. It lives in exactly one of
 * three places — the sidebar dock, the fullscreen layer, or detached — and
 * detached is a valid parked state that keeps its WebGL context and preset.
 */
export function useAudioEngine(
  libAudioRef: React.RefObject<HTMLAudioElement | null>,
  radAudioRef: React.RefObject<HTMLAudioElement | null>,
  anyPlayingRef: React.RefObject<boolean>,
): AudioEngine {
  const [vizOpen, setVizOpenState] = useState(readVizPref);
  const [vizFullscreen, setVizFullscreenState] = useState(false);
  const [vizReady, setVizReady] = useState(false);

  const graphRef = useRef<AudioGraph | null>(null);
  const graphTriedRef = useRef(false);
  const resumeArmedRef = useRef(false);

  const vizRef = useRef<Visualizer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fsHostRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const sizePendingRef = useRef(false);
  const vizInitRef = useRef<Promise<void> | null>(null);

  // Mirrors the rAF closure and the imperative helpers read without resubscribing.
  const vizOpenRef = useRef(vizOpen);
  const fullscreenRef = useRef(vizFullscreen);

  // ── Audio graph ──────────────────────────────────────────

  const ensureGraph = useCallback((): AudioGraph | null => {
    if (graphRef.current) return graphRef.current;
    // One flag for both source nodes: createMediaElementSource is one-shot per
    // element, so a partial build must never be retried.
    if (graphTriedRef.current) return null;
    const lib = libAudioRef.current;
    const rad = radAudioRef.current;
    if (!lib || !rad) return null;
    graphTriedRef.current = true;

    try {
      const Ctx = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const mix = ctx.createGain();
      const out = ctx.createGain();
      // Terminate the chain before attaching sources: routing an element
      // through the graph replaces its direct output, so if the second source
      // throws the first is still audible rather than silent.
      mix.connect(out);
      out.connect(ctx.destination);
      ctx.createMediaElementSource(lib).connect(mix);
      ctx.createMediaElementSource(rad).connect(mix);
      graphRef.current = { ctx, mix, out };
      return graphRef.current;
    } catch (err) {
      console.error('Audio graph unavailable, falling back to plain playback:', err);
      return null;
    }
  }, [libAudioRef, radAudioRef]);

  const resumeGraph = useCallback((graph: AudioGraph | null) => {
    if (!graph || graph.ctx.state === 'running') return;
    graph.ctx.resume().catch(() => {});
    // If that gesture did not take, the audio is routed through a suspended
    // context and would be silent. Retry on the next press.
    if (resumeArmedRef.current) return;
    resumeArmedRef.current = true;
    document.addEventListener('pointerdown', () => {
      resumeArmedRef.current = false;
      graph.ctx.resume().catch(() => {});
    }, { once: true });
  }, []);

  const applyVolume = useCallback((volume: number, muted: boolean) => {
    const level = muted ? 0 : volume;
    const graph = graphRef.current;
    const lib = libAudioRef.current;
    const rad = radAudioRef.current;
    if (graph) {
      // Ramped, because the block bars fire a change per pixel of drag.
      graph.out.gain.setTargetAtTime(level, graph.ctx.currentTime, 0.015);
      // Loudness belongs to the graph now. Never element.muted — that would
      // zero the signal upstream of the visualiser's tap.
      if (lib) lib.volume = 1;
      if (rad) rad.volume = 1;
      return;
    }
    if (lib) lib.volume = level;
    if (rad) rad.volume = level;
  }, [libAudioRef, radAudioRef]);

  // ── Visualiser ───────────────────────────────────────────

  const sizeViz = () => {
    const canvas = canvasRef.current;
    const viz = vizRef.current;
    const host = canvas?.parentElement;
    // Parked off-DOM: clientWidth reads 0 and would clamp the buffer to 1x1.
    if (!canvas || !viz || !host || !canvas.isConnected) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round((host.clientWidth || 1) * dpr));
    const h = Math.max(1, Math.round((host.clientHeight || 1) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    viz.setRendererSize(w, h);
  };

  // One setRendererSize per frame. The rail's observer fires in bursts during a
  // window drag and each call reallocates GPU textures.
  const scheduleSize = () => {
    if (sizePendingRef.current) return;
    sizePendingRef.current = true;
    requestAnimationFrame(() => {
      sizePendingRef.current = false;
      sizeViz();
    });
  };

  // The rail's height changes on things window resize never fires for — Stats
  // resolving, the weather sentence rewrapping, a scrollbar appearing.
  const observeHost = (el: Element) => {
    const ro = (roRef.current ??= new ResizeObserver(scheduleSize));
    ro.disconnect();
    ro.observe(el);
  };

  const startLoop = () => {
    if (rafRef.current != null) return;
    const frame = () => {
      const viz = vizRef.current;
      const canvas = canvasRef.current;
      // Nothing to draw while paused, closed, or parked off-DOM.
      if (
        viz && canvas?.isConnected &&
        (fullscreenRef.current || (vizOpenRef.current && anyPlayingRef.current))
      ) {
        try {
          viz.render();
        } catch (err) {
          console.error('Visualiser render failed, stopping:', err);
          rafRef.current = null;
          return;
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  const initVisualizer = async () => {
    if (canvasRef.current) return;
    if (!vizOpenRef.current && !fullscreenRef.current) return;
    const graph = graphRef.current;
    // Either host will do — the dock may not be mounted, or may not exist yet.
    const host = (fullscreenRef.current ? fsHostRef.current : hostRef.current)
      ?? hostRef.current ?? fsHostRef.current;
    if (!graph || !host) return;

    const [{ default: butterchurn }, { default: presets }] = await Promise.all([
      import('butterchurn'),
      import('butterchurn-presets'),
    ]);
    if (canvasRef.current) return; // another trigger raced in during the import

    const canvas = document.createElement('canvas');
    canvas.className = 'vz-canvas';
    host.appendChild(canvas);
    canvasRef.current = canvas;

    canvas.addEventListener('webglcontextlost', (e) => {
      // Without preventDefault the restore event never fires.
      e.preventDefault();
      vizRef.current = null;
      setVizReady(false);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      // butterchurn 2.6 has no re-init hook, so the canvas is rebuilt instead.
      canvas.remove();
      canvasRef.current = null;
      vizInitRef.current = null;
      ensureVisualizer();
    });

    const dpr = window.devicePixelRatio || 1;
    const viz = butterchurn.createVisualizer(graph.ctx, canvas, {
      width: (host.clientWidth || 300) * dpr,
      height: (host.clientHeight || 150) * dpr,
      pixelRatio: 1,
      textureRatio: 1,
    });
    // The pre-volume sum, so the effect survives mute and follows whichever
    // source is live — a paused element's node emits zeros.
    viz.connectAudio(graph.mix);
    const all = presets.getPresets();
    const keys = Object.keys(all);
    viz.loadPreset(all[keys[Math.floor(Math.random() * keys.length)]], 0);
    vizRef.current = viz;
    setVizReady(true);
    observeHost(host);
    sizeViz();
    startLoop();
  };

  // Five things can ask for the visualiser (either source starting, the toggle,
  // a dock mounting, a context restore), so concurrency is guarded by the
  // promise rather than by ad-hoc flags.
  const ensureVisualizer = () => {
    if (vizInitRef.current) return;
    vizInitRef.current = initVisualizer()
      .catch((err) => { console.error('Visualiser init failed:', err); })
      .finally(() => {
        // Nothing built — let a later trigger try again.
        if (!canvasRef.current) vizInitRef.current = null;
      });
  };

  const registerVizHost = useCallback((el: HTMLDivElement | null) => {
    hostRef.current = el;
    const canvas = canvasRef.current;
    if (el) {
      if (!canvas) {
        // The box arrived after the user had already asked for the effect.
        ensureVisualizer();
      } else if (!fullscreenRef.current) {
        el.appendChild(canvas);
        observeHost(el);
      }
    } else if (canvas && !fullscreenRef.current) {
      // Dock unmounted: park the canvas. Its WebGL context and loaded preset
      // survive, the loop stops on its own, and remounting re-appends it.
      canvas.remove();
      roRef.current?.disconnect();
    }
    scheduleSize();
    // Reads refs only, and must keep a stable identity — as a callback ref, a
    // changing one would detach and re-append the canvas on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registerVizFsHost = useCallback((el: HTMLDivElement | null) => {
    fsHostRef.current = el;
  }, []);

  const setVizOpen = useCallback((open: boolean) => setVizOpenState(open), []);
  const setVizFullscreen = useCallback((fs: boolean) => setVizFullscreenState(fs), []);

  // Move the (React-independent) canvas between the dock and the fullscreen
  // layer by re-parenting the same node, which preserves its WebGL context.
  useEffect(() => {
    fullscreenRef.current = vizFullscreen;
    const canvas = canvasRef.current;
    if (canvas) {
      const target = vizFullscreen ? fsHostRef.current : hostRef.current;
      if (target) {
        if (canvas.parentElement !== target) target.appendChild(canvas);
        observeHost(target);
      } else if (!vizFullscreen) {
        canvas.remove();
        roRef.current?.disconnect();
      }
    }
    if (vizFullscreen) startLoop();
    scheduleSize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vizFullscreen]);

  // Opening the box is what triggers the butterchurn import, so init here too
  // for the case where something was already playing.
  useEffect(() => {
    vizOpenRef.current = vizOpen;
    localStorage.setItem(VIZ_KEY, vizOpen ? '1' : '0');
    if (!vizOpen) {
      setVizFullscreenState(false);
      return;
    }
    ensureVisualizer();
    scheduleSize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vizOpen]);

  useEffect(() => {
    if (!vizFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVizFullscreenState(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vizFullscreen]);

  // The ResizeObserver covers layout; this covers a move to a monitor with a
  // different devicePixelRatio, which leaves the CSS box unchanged.
  useEffect(() => {
    const onResize = () => scheduleSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    // Cancel the loop before closing the context — a render against a closed
    // context throws from inside a rAF callback, which no boundary catches.
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    roRef.current?.disconnect();
    roRef.current = null;
    const canvas = canvasRef.current;
    canvas?.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();
    canvas?.remove();
    canvasRef.current = null;
    vizRef.current = null;
    const graph = graphRef.current;
    graphRef.current = null;
    graph?.ctx.close().catch(() => {});
  }, []);

  // Rendered by the engine rather than the dock: it has to outlive the dock,
  // and it is the fallback host when no dock is mounted.
  const fullscreenPortal = createPortal(
    <div
      ref={registerVizFsHost}
      className={`vz-fullscreen${vizFullscreen ? ' is-active' : ''}`}
      aria-hidden="true"
    />,
    document.body,
  );

  return {
    ensureGraph,
    resumeGraph,
    applyVolume,
    ensureVisualizer,
    vizOpen,
    vizFullscreen,
    vizReady,
    setVizOpen,
    setVizFullscreen,
    registerVizHost,
    fullscreenPortal,
  };
}
