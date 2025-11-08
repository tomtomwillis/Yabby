import React, { useEffect, useState } from 'react';
import './Star.css';

const Star: React.FC = () => {
  const [frameStep, setFrameStep] = useState(0);
  const totalFrames = 8;

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameStep((prevFrame) => (prevFrame + 1) % totalFrames);
    }, 400);

    return () => clearInterval(interval);
  }, []);

  const getDistortionValues = (frame: number) => {
    const baseFrequency = 0.03 + Math.sin(frame * 0.5) * 0.01;
    const scale = 1.5 + Math.cos(frame * 0.7) * 0.8;
    const seed = frame * 11;
    return { baseFrequency, scale, seed };
  };

  const { baseFrequency, scale, seed } = getDistortionValues(frameStep);

  return (
    <div className="star">
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="stopMotionDistortion">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={baseFrequency}
              numOctaves="2"
              seed={seed}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={scale}
            />
          </filter>
        </defs>
        <path
          className="star-path" // Added class for styling
          d="M50,5 
             L55,35 
             L85,35 
             L60,50 
             L75,85 
             L50,65 
             L25,85 
             L40,50 
             L15,35 
             L45,35 
             Z"
          filter="url(#stopMotionDistortion)"
        />
      </svg>
    </div>
  );
};

export default Star;