import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './WeathrAnimation.css';

function getWsUrl(): string {
  const envUrl = import.meta.env.VITE_WEATHR_WS_URL;
  if (envUrl) return envUrl;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/media/weathr/stream`;
}

const WeathrAnimation: React.FC = () => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const term = new Terminal({
      cols: 150,
      rows: 40,
      disableStdin: true,
      cursorBlink: false,
      cursorStyle: 'bar',
      convertEol: true,
      allowTransparency: true,
      fontFamily: 'jgs7, NectoMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 14,
      fontWeight: 'normal',
      fontWeightBold: 'normal',
      theme: {
        background: 'rgba(0,0,0,0)',
        foreground: '#1a2ecc',
        cursor: '#1a2ecc',
        black: '#1a1a1a',
        red: '#b8261a',
        green: '#2f7a36',
        yellow: '#c46a18',
        blue: '#1a2ecc',
        magenta: '#8825e6',
        cyan: '#0e7c93',
        white: '#5a5a5a',
        brightBlack: '#3a3a3a',
        brightRed: '#e0392b',
        brightGreen: '#4CAF50',
        brightYellow: '#e87a3a',
        brightBlue: '#3a55ff',
        brightMagenta: '#a64bff',
        brightCyan: '#1aa6c9',
        brightWhite: '#7a7a7a',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    try { fit.fit(); } catch { /* host not yet measurable */ }

    const ws = new WebSocket(getWsUrl());
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        term.write(ev.data);
      } else {
        term.write(new Uint8Array(ev.data));
      }
    };

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* ignore transient measure errors */ }
    });
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      try { ws.close(); } catch { /* already closed */ }
      try { term.dispose(); } catch { /* already disposed */ }
    };
  }, []);

  return <div className="weathr-host" ref={hostRef} aria-hidden="true" />;
};

export default WeathrAnimation;
