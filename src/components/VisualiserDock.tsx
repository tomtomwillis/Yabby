import React from 'react';
import { usePlayerActions, usePlayerState } from '../utils/usePlayer';
import './VisualiserDock.css';

/** The visualiser box in the left rail. Shows whichever source is playing —
 *  the engine taps the sum of both, so nothing changes when the mode does.
 *  The canvas itself is created and owned by the engine; this only supplies a
 *  box for it to live in. */
const VisualiserDock: React.FC = () => {
  const { vizOpen, vizFullscreen } = usePlayerState();
  const { setVizOpen, setVizFullscreen, registerVizHost } = usePlayerActions();

  return (
    <div className={`vz${vizFullscreen ? ' vz--fs' : ''}${vizOpen ? '' : ' vz--closed'}`}>
      <button
        className="vz-toggle"
        onClick={() => {
          if (!vizOpen) window.umami?.track('viz_open');
          setVizOpen(!vizOpen);
        }}
        aria-expanded={vizOpen}
      >
        {vizOpen ? '[ hide viz ]' : '[ show viz ]'}
      </button>

      <div className="vz-box">
        {/* Stable callback ref — the engine re-parents the live canvas in and
            out of this node as it mounts, unmounts and goes fullscreen. */}
        <div ref={registerVizHost} className="vz-host" />
        <button
          className="vz-fs"
          onClick={() => setVizFullscreen(!vizFullscreen)}
          aria-label={vizFullscreen ? 'Exit fullscreen visualiser' : 'Expand visualiser to fullscreen'}
        >
          {vizFullscreen ? '[ ✕ ]' : '[ ⛶ ]'}
        </button>
      </div>
    </div>
  );
};

export default VisualiserDock;
