import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './WeathrAnimation.css';
import { setPaletteMode, type PaletteMode } from './weathr/colors';
import { WeathrEngine } from './weathr/engine';
import type { WeatherCondition, WeatherInput } from './weathr/types';

// WMO weathercode → our condition enum (Open-Meteo follows WMO 4677).
function conditionFromWeatherCode(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly-cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code === 51 || code === 53 || code === 55) return 'drizzle';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'freezing-rain';
  if (code === 61 || code === 63 || code === 65) return 'rain';
  if (code === 80 || code === 81 || code === 82) return 'rain-showers';
  if (code === 71 || code === 73 || code === 75) return 'snow';
  if (code === 77) return 'snow-grains';
  if (code === 85 || code === 86) return 'snow-showers';
  if (code === 95) return 'thunderstorm';
  if (code === 96 || code === 99) return 'thunderstorm-hail';
  return 'clear';
}

// JGS pixel-font sizing. The bitmap fonts only look crisp at exact pixel
// multiples — 10px ⇒ jgs5, 14px ⇒ jgs7, 18px ⇒ jgs9. Other sizes fall back to
// the nearest multiple's font.
function jgsFamilyForSize(px: number): string {
  if (px % 10 === 0) return 'jgs5, ui-monospace, monospace';
  if (px % 14 === 0) return 'jgs7, ui-monospace, monospace';
  if (px % 18 === 0) return 'jgs9, ui-monospace, monospace';
  // Approximate: pick whichever intrinsic height (5/7/9) divides closest.
  const candidates = [
    { font: 'jgs5', mod: px % 10 },
    { font: 'jgs7', mod: px % 14 },
    { font: 'jgs9', mod: px % 18 },
  ];
  candidates.sort((a, b) => a.mod - b.mod);
  return `${candidates[0].font}, ui-monospace, monospace`;
}

interface OpenMeteoCurrent {
  temperature: number;
  windspeed: number;
  winddirection: number;
  weathercode: number;
  is_day: 0 | 1;
}

interface WeathrAnimationProps {
  latitude?: number;
  longitude?: number;
  cols?: number;
  rows?: number;
  fps?: number;
  fontSizePx?: number;
  paletteMode?: PaletteMode;
  showLeaves?: boolean;
  /** Manual overrides for testing — when supplied, skips the Open-Meteo fetch. */
  conditionOverride?: WeatherCondition;
  isDayOverride?: boolean;
}

const DEFAULT_WEATHER: WeatherInput = {
  condition: 'clear',
  temperature: 15,
  windSpeedKmh: 8,
  windDirectionDeg: 225,
  moonPhase: 0.5,
  isDay: true,
};

const WeathrAnimation: React.FC<WeathrAnimationProps> = ({
  latitude = 55.83,
  longitude = -4.27,
  cols = 150,
  rows = 40,
  fps = 20,
  fontSizePx = 10,
  paletteMode = 'light',
  showLeaves = false,
  conditionOverride,
  isDayOverride,
}) => {
  const preRef = useRef<HTMLPreElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<WeathrEngine | null>(null);
  const [weather, setWeather] = useState<WeatherInput>(DEFAULT_WEATHER);
  const [scale, setScale] = useState(1);

  // Apply palette mode before the engine renders any frame.
  useMemo(() => setPaletteMode(paletteMode), [paletteMode]);

  // Fetch current weather from Open-Meteo unless overrides are supplied.
  useEffect(() => {
    if (conditionOverride) {
      setWeather((prev) => ({
        ...prev,
        condition: conditionOverride,
        isDay: typeof isDayOverride === 'boolean' ? isDayOverride : prev.isDay,
      }));
      return;
    }
    let cancelled = false;
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}&longitude=${longitude}` +
      `&current_weather=true&windspeed_unit=kmh`;
    fetch(url)
      .then((r) => r.json())
      .then((data: { current_weather?: OpenMeteoCurrent }) => {
        if (cancelled) return;
        const c = data.current_weather;
        if (!c) return;
        setWeather({
          condition: conditionFromWeatherCode(c.weathercode),
          temperature: c.temperature,
          windSpeedKmh: c.windspeed,
          windDirectionDeg: c.winddirection,
          moonPhase: 0.5,
          isDay: typeof isDayOverride === 'boolean' ? isDayOverride : c.is_day === 1,
        });
      })
      .catch(() => {
        // Network failure: keep the default clear-day scene rather than blanking.
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, conditionOverride, isDayOverride]);

  // Build engine once per grid configuration.
  useEffect(() => {
    const pre = preRef.current;
    if (!pre) return;
    const engine = new WeathrEngine({ width: cols, height: rows, weather, showLeaves });
    engineRef.current = engine;

    const interval = Math.max(16, Math.round(1000 / fps));
    let alive = true;
    let lastDraw = 0;
    let rafId = 0;
    const tick = (now: number) => {
      if (!alive) return;
      if (now - lastDraw >= interval) {
        lastDraw = now;
        pre.innerHTML = engine.step();
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      engineRef.current = null;
    };
    // Engine is rebuilt only when grid dimensions or fps change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows, fps]);

  useEffect(() => {
    engineRef.current?.setWeather(weather);
  }, [weather]);

  useEffect(() => {
    engineRef.current?.setShowLeaves(showLeaves);
  }, [showLeaves]);

  const family = useMemo(() => jgsFamilyForSize(fontSizePx), [fontSizePx]);

  // Scale the pre to fit its frame on both axes. The engine draws a fixed
  // cols × rows grid at fontSizePx — we just shrink/grow the rendered output
  // to fill whatever container the panel gives us.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const pre = preRef.current;
    if (!frame || !pre) return;

    const recompute = () => {
      pre.style.transform = 'scale(1)';
      const natW = pre.scrollWidth;
      const natH = pre.scrollHeight;
      const availW = frame.clientWidth;
      const availH = frame.clientHeight;
      if (natW > 0 && natH > 0 && availW > 0 && availH > 0) {
        setScale(Math.min(availW / natW, availH / natH));
      }
    };
    recompute();

    const ro = new ResizeObserver(recompute);
    ro.observe(frame);
    ro.observe(pre);
    return () => ro.disconnect();
  }, [cols, rows, fontSizePx]);

  return (
    <div className="weathr-frame" ref={frameRef}>
      <pre
        className="weathr-pre"
        ref={preRef}
        aria-hidden="true"
        style={{
          fontFamily: family,
          fontSize: `${fontSizePx}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
};

export default WeathrAnimation;
